// push-notify — sends FCM pushes for order pipeline events, to the roles
// that own them, plus Owner on everything. Runs inside Directus as a hook
// (filter + action + schedule) on `orders` and `push_tokens`.
//
// Why a hook and not a Flow: sending on FCM HTTP v1 means minting an OAuth2
// access token by signing a JWT with the Firebase service account. Directus's
// Flow script sandbox has neither crypto nor outbound fetch, so the signing
// lives here instead (Node's own `crypto`, no extra dependency).
//
// Server config (Directus .env), never in the client bundle:
//   FCM_SERVICE_ACCOUNT       — the service-account JSON, inline or a file path.
//   PUSH_NOTIFY_DISABLED      — "true" mutes all sending without a redeploy.
//   PUSH_DOCS_OVERDUE_DAYS    — default 3.
//   PUSH_COD_OVERDUE_DAYS     — default 3.
//   PUSH_REMINDER_CRON        — default '0 2 * * *' (09:00 WIB, UTC container).
//   PUSH_REMINDER_RUN_ON_START — "true" also runs the reminder check once at
//                                boot, for testing; leave unset in normal use.

import crypto from 'node:crypto'
import fs from 'node:fs'

// ---------- role resolution ----------

// Port of `normalizeRole()` in src/lib/domain.ts. Must stay identical: prod
// carries both `Administrator` and `Owner/Developer/Administrator` roles, so
// the owner-before-admin ordering is what stops an Owner being treated as
// Admin (and a stray `Administrator` from mis-routing).
function normalizeRole(directusRoleName) {
  if (!directusRoleName) return 'Admin'
  const name = String(directusRoleName).toLowerCase()
  if (name.includes('owner')) return 'Owner'
  if (name.includes('admin')) return 'Admin'
  if (name.includes('warehouse')) return 'Warehouse'
  if (name.includes('production')) return 'Production'
  if (name.includes('finance')) return 'Finance'
  if (name.includes('courier')) return 'Courier'
  return 'Admin'
}

// Mirrors ACTOR in src/lib/pipeline.ts — "who has the ball at this stage".
// Only the stages with a routine notification below are listed.
const STAGE_OWNER = {
  intake: 'Admin',
  cold: 'Warehouse',
  production: 'Production',
  packing: 'Warehouse',
  finalise: 'Admin',
  dispatch: 'Courier',
}

const STAGE_MESSAGE = {
  intake: (o) => `New order #${o.no} from ${o.customer_name ?? 'a customer'}`,
  cold: (o) => `Order #${o.no} ready to weigh`,
  production: (o) => `Order #${o.no} ready to cut`,
  packing: (o) => `Order #${o.no} ready to pack`,
  finalise: (o) => `Order #${o.no} ready to print DO/SI`,
  dispatch: (o) => `Order #${o.no} ready for delivery`,
}

// ---------- FCM ----------

function loadServiceAccount() {
  const raw = process.env.FCM_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const text = raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8')
    const parsed = JSON.parse(text)
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null
    return parsed
  } catch {
    return null
  }
}

let cachedToken = null // { value, expiresAt }

// FCM HTTP v1 needs an OAuth2 access token. Mint one by signing the service
// account's JWT assertion (RS256) and exchanging it; cached until ~1 min
// before expiry, so a burst of events costs one exchange.
async function getAccessToken(account) {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value

  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${b64(header)}.${b64(claims)}`
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(account.private_key)
    .toString('base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  cachedToken = { value: json.access_token, expiresAt: now + (json.expires_in ?? 3600) }
  return cachedToken.value
}

/** Sends one message. Returns "ok" | "stale" (token gone) | "error". */
async function sendOne(account, accessToken, token, title, body, data) {
  // FCM rejects non-string / undefined data values.
  const cleanData = Object.fromEntries(
    Object.entries(data ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  )
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: cleanData,
          android: { priority: 'HIGH', notification: { sound: 'default' } },
        },
      }),
    },
  )
  if (res.ok) return 'ok'
  const text = await res.text()
  // A device that uninstalled or re-registered: drop the row rather than
  // retrying it on every future event.
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) return 'stale'
  return 'error'
}

// ---------- previous-state cache (filter -> action handoff) ----------

// `filter` runs before the mutation, `action` after — reading the row in
// each gives the before/after pair a transition needs. Stashed between the
// two rather than diffed from `payload` alone, because several write paths
// (notably the generic Undo in OrderDetail.tsx) replay old values through
// `payload` in ways that look identical to a fresh event; comparing actual
// before/after avoids trusting payload shape at all.
const PREV_TTL_MS = 60_000
const prevCache = new Map() // orderId -> { data, expiresAt }

function cachePrev(id, data) {
  const now = Date.now()
  // Opportunistic sweep so a filter that never got a matching action (an
  // update that errored downstream) doesn't leak forever.
  for (const [key, entry] of prevCache) {
    if (entry.expiresAt < now) prevCache.delete(key)
  }
  prevCache.set(id, { data, expiresAt: now + PREV_TTL_MS })
}

function takePrev(id) {
  const entry = prevCache.get(id)
  prevCache.delete(id)
  if (!entry || entry.expiresAt < Date.now()) return null
  return entry.data
}

const TRACKED_ORDER_FIELDS = [
  'id',
  'no',
  'customer_name',
  'stage',
  'cancelled',
  'hold',
  'return_received',
  'payment_confirmed',
]

// ---------- transition -> event mapping ----------

/**
 * Compares before/after order state and returns the notification events it
 * represents. Each event names the roles that own it (Owner is added by
 * `notify()`, never listed here) and a message class used against the
 * recipient's notification preference — see `notification_prefs` below.
 */
function detectEvents(prev, next) {
  const events = []
  const stageChanged = prev.stage !== next.stage
  const ownerOf = (stage) => STAGE_OWNER[stage]
  const adminPlus = (role) => (role && role !== 'Admin' ? ['Admin', role] : ['Admin'])

  if (stageChanged && STAGE_OWNER[next.stage]) {
    events.push({
      roles: [STAGE_OWNER[next.stage]],
      cls: 'routine',
      body: STAGE_MESSAGE[next.stage](next),
      orderId: next.id,
    })
  }
  // Finance is a parallel queue, not a stage: an order sitting at `cold`
  // with payment not yet confirmed (and not on hold) is what Finance acts
  // on — matches financeParallelQueueFilter in src/lib/pipeline.ts.
  if (
    stageChanged &&
    next.stage === 'cold' &&
    next.payment_confirmed !== true &&
    next.hold !== true
  ) {
    events.push({
      roles: ['Finance'],
      cls: 'routine',
      body: `Order #${next.no} needs payment clearing`,
      orderId: next.id,
    })
  }

  if (prev.cancelled !== true && next.cancelled === true) {
    events.push({
      roles: adminPlus(ownerOf(prev.stage)),
      cls: 'important',
      body: `Order #${next.no} was cancelled`,
      orderId: next.id,
    })
  }
  if (prev.hold !== true && next.hold === true) {
    events.push({
      roles: adminPlus(ownerOf(next.stage)),
      cls: 'important',
      body: `Order #${next.no} was put on hold`,
      orderId: next.id,
    })
  }
  if (prev.hold === true && next.hold !== true) {
    events.push({
      roles: adminPlus(ownerOf(next.stage)),
      cls: 'important',
      body: `Order #${next.no} resumed from hold`,
      orderId: next.id,
    })
  }
  if (stageChanged && next.stage === 'delivered') {
    events.push({
      roles: ['Admin', 'Finance'],
      cls: 'important',
      body: `Order #${next.no} was delivered`,
      orderId: next.id,
    })
  }
  if (stageChanged && prev.stage === 'dispatch' && next.stage === 'outstanding') {
    events.push({
      roles: ['Admin', 'Finance'],
      cls: 'important',
      body: `Order #${next.no} delivered short — needs follow-up`,
      orderId: next.id,
    })
  }
  if (stageChanged && next.stage === 'returned') {
    events.push({
      roles: ['Admin', 'Warehouse'],
      cls: 'important',
      body: `Order #${next.no} was refused / returned`,
      orderId: next.id,
    })
  }
  if (prev.return_received !== true && next.return_received === true) {
    events.push({
      roles: ['Admin', 'Finance'],
      cls: 'important',
      body: `Return received for order #${next.no}`,
      orderId: next.id,
    })
  }
  if (prev.payment_confirmed !== true && next.payment_confirmed === true) {
    events.push({
      roles: ['Admin', 'Warehouse'],
      cls: 'important',
      body: `Payment confirmed for order #${next.no}`,
      orderId: next.id,
    })
  }

  return events
}

// ---------- overdue reminders ----------

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000 // WIB, no DST

/** Whole calendar days in Asia/Jakarta between `isoString` and now. */
function daysSinceJakarta(isoString, now = new Date()) {
  if (!isoString) return null
  const then = new Date(isoString)
  if (Number.isNaN(then.getTime())) return null
  const thenDay = Math.floor((then.getTime() + JAKARTA_OFFSET_MS) / 86_400_000)
  const nowDay = Math.floor((now.getTime() + JAKARTA_OFFSET_MS) / 86_400_000)
  return nowDay - thenDay
}

/** Fires once at the threshold, then weekly while still unresolved. */
function isReminderDue(days, thresholdDays) {
  return days >= thresholdDays && (days - thresholdDays) % 7 === 0
}

// ---------- hook ----------

export default (
  { filter, action, schedule },
  { services, getSchema, logger, database },
) => {
  const { ItemsService } = services

  function itemsServices(schema) {
    return {
      orders: new ItemsService('orders', { schema, knex: database }),
      tokens: new ItemsService('push_tokens', { schema, knex: database }),
      users: new ItemsService('directus_users', { schema, knex: database }),
      prefs: new ItemsService('notification_prefs', { schema, knex: database }),
    }
  }

  /** Loads the FCM account + a fresh services/token bundle shared by every
   *  send in one hook invocation. Returns null (and logs once) when FCM
   *  isn't configured, so callers can bail out cheaply. */
  async function buildContext() {
    const account = loadServiceAccount()
    if (!account) {
      logger.warn('push-notify: FCM_SERVICE_ACCOUNT missing or invalid — not sending')
      return null
    }
    const schema = await getSchema()
    const accessToken = await getAccessToken(account)
    return { account, accessToken, logger, ...itemsServices(schema) }
  }

  /**
   * Sends one notification to every device of every active user whose role
   * matches `roles` (Owner is always included) and whose notification
   * preference allows this message class. Returns the number of devices
   * actually sent to.
   */
  async function notify(ctx, { roles, cls, title = 'IPP-OrderFlow', body, orderId, route }) {
    const targetRoles = new Set([...roles, 'Owner'])

    const recipients = await ctx.users.readByQuery({
      fields: ['id', 'role.name'],
      filter: { status: { _eq: 'active' } },
      limit: -1,
    })
    const userIds = recipients
      .filter((u) => targetRoles.has(normalizeRole(u.role?.name)))
      .map((u) => u.id)
    if (userIds.length === 0) return 0

    const prefRows = await ctx.prefs.readByQuery({
      fields: ['user', 'mode'],
      filter: { user: { _in: userIds } },
      limit: -1,
    })
    const modeByUser = new Map(prefRows.map((p) => [p.user, p.mode]))
    // No row = default 'all' (opt-out, not opt-in — matches every other
    // per-user setting in this app, e.g. language).
    const allowedUserIds = userIds.filter((id) => {
      const mode = modeByUser.get(id) ?? 'all'
      if (mode === 'off') return false
      if (mode === 'important') return cls === 'important' || cls === 'reminder'
      return true
    })
    if (allowedUserIds.length === 0) return 0

    const rows = await ctx.tokens.readByQuery({
      fields: ['id', 'token'],
      filter: { user: { _in: allowedUserIds } },
      limit: -1,
    })

    const seen = new Set()
    let sent = 0
    for (const row of rows) {
      if (seen.has(row.token)) continue
      seen.add(row.token)
      const result = await sendOne(ctx.account, ctx.accessToken, row.token, title, body, {
        orderId,
        route,
      })
      if (result === 'ok') sent += 1
      if (result === 'stale') {
        await ctx.tokens.deleteOne(row.id)
        ctx.logger.info(`push-notify: pruned stale token ${row.id}`)
      }
    }
    return sent
  }

  // ----- token claiming: one device, one row -----
  //
  // A device that logs out cleanly already has its row deleted client-side
  // (`unregisterPush`). This covers the unclean case — force-close, cleared
  // data, a crash — where the previous user's row is left behind holding a
  // still-valid token: the next user's own-row read can't see it (ACL), so
  // their create would otherwise fail the unique constraint on `token` and
  // they'd register nothing, while the stale row keeps notifying the
  // previous user on what is now someone else's phone. Deleting any row
  // with the same token before insert makes the newest login authoritative.
  filter('push_tokens.items.create', async (payload) => {
    const token = payload?.token
    if (!token) return payload
    try {
      const schema = await getSchema()
      const tokens = new ItemsService('push_tokens', { schema, knex: database })
      const existing = await tokens.readByQuery({
        fields: ['id'],
        filter: { token: { _eq: token } },
        limit: -1,
      })
      for (const row of existing) {
        await tokens.deleteOne(row.id)
      }
    } catch (err) {
      logger.error(`push-notify: token claim failed: ${err instanceof Error ? err.message : err}`)
    }
    return payload
  })

  // ----- capture before-state -----
  filter('orders.items.update', async (payload, meta) => {
    try {
      const schema = await getSchema()
      const orders = new ItemsService('orders', { schema, knex: database })
      for (const key of meta.keys) {
        const prev = await orders.readOne(key, { fields: TRACKED_ORDER_FIELDS })
        if (prev) cachePrev(key, prev)
      }
    } catch (err) {
      logger.error(`push-notify: prev-state read failed: ${err instanceof Error ? err.message : err}`)
    }
    return payload
  })

  // ----- detect transitions, send events -----
  action('orders.items.update', async ({ keys }) => {
    if (process.env.PUSH_NOTIFY_DISABLED === 'true') return

    // Resolve which keys actually changed something worth notifying before
    // paying for an FCM token exchange.
    const pairs = []
    const schema = await getSchema()
    const orders = new ItemsService('orders', { schema, knex: database })
    for (const key of keys) {
      const prev = takePrev(key)
      if (!prev) continue // filter didn't run or the entry expired — skip rather than guess
      const next = await orders.readOne(key, { fields: TRACKED_ORDER_FIELDS })
      if (!next) continue
      const events = detectEvents(prev, next)
      if (events.length > 0) pairs.push(...events)
    }
    if (pairs.length === 0) return

    try {
      const ctx = await buildContext()
      if (!ctx) return
      for (const evt of pairs) {
        const sent = await notify(ctx, evt)
        logger.info(
          `push-notify: order event "${evt.body}" -> [${evt.roles.join(', ')} + Owner] (${sent} device(s))`,
        )
      }
    } catch (err) {
      // Never let a notification failure roll back or block the order update.
      logger.error(`push-notify: ${err instanceof Error ? err.message : err}`)
    }
  })

  // ----- overdue reminders -----

  async function collectDocsOverdue(orders, thresholdDays) {
    const rows = await orders.readByQuery({
      fields: ['id', 'no', 'delivered_at'],
      filter: {
        _and: [
          { stage: { _eq: 'delivered' } },
          { cancelled: { _neq: true } },
          { docs_returned: { _neq: true } },
        ],
      },
      limit: -1,
    })
    return rows.filter((o) => {
      const days = daysSinceJakarta(o.delivered_at)
      return days !== null && isReminderDue(days, thresholdDays)
    })
  }

  async function collectCodOverdue(orders, thresholdDays) {
    const rows = await orders.readByQuery({
      fields: ['id', 'no', 'delivered_at', 'customer_id.pay_timing'],
      filter: {
        _and: [
          { stage: { _in: ['delivered', 'outstanding'] } },
          { cancelled: { _neq: true } },
          { cod_reconciled: { _neq: true } },
          { third_party: { _neq: true } },
        ],
      },
      limit: -1,
    })
    return rows.filter((o) => {
      const payTiming = String(o.customer_id?.pay_timing ?? '').trim().toLowerCase()
      if (payTiming !== 'cod') return false
      const days = daysSinceJakarta(o.delivered_at)
      return days !== null && isReminderDue(days, thresholdDays)
    })
  }

  /** One push per recipient per kind, not per order — a single overdue
   *  order deep-links straight to it; several summarize with a route. */
  async function sendReminderGroup(ctx, { roles, singleBody, groupNoun, route }, overdueOrders) {
    if (overdueOrders.length === 0) return
    if (overdueOrders.length === 1) {
      const o = overdueOrders[0]
      const sent = await notify(ctx, {
        roles,
        cls: 'reminder',
        body: singleBody(o),
        orderId: o.id,
      })
      logger.info(`push-notify: reminder "${singleBody(o)}" -> [${roles.join(', ')} + Owner] (${sent} device(s))`)
      return
    }
    const shown = overdueOrders.slice(0, 5).map((o) => `#${o.no}`).join(', ')
    const more = overdueOrders.length > 5 ? ` +${overdueOrders.length - 5} more` : ''
    const body = `${overdueOrders.length} ${groupNoun}: ${shown}${more}`
    const sent = await notify(ctx, { roles, cls: 'reminder', body, route })
    logger.info(`push-notify: reminder "${body}" -> [${roles.join(', ')} + Owner] (${sent} device(s))`)
  }

  async function runReminders() {
    if (process.env.PUSH_NOTIFY_DISABLED === 'true') return
    const docsDays = Number(process.env.PUSH_DOCS_OVERDUE_DAYS ?? 3)
    const codDays = Number(process.env.PUSH_COD_OVERDUE_DAYS ?? 3)

    const ctx = await buildContext()
    if (!ctx) return

    const docsOverdue = await collectDocsOverdue(ctx.orders, docsDays)
    await sendReminderGroup(
      ctx,
      {
        roles: ['Admin'],
        singleBody: (o) => `Order #${o.no}: signed DO/SI not returned (${docsDays}+ days)`,
        groupNoun: 'orders with signed DO/SI not returned',
        route: '/orders?stage=pending-docs',
      },
      docsOverdue,
    )

    const codOverdue = await collectCodOverdue(ctx.orders, codDays)
    await sendReminderGroup(
      ctx,
      {
        roles: ['Admin', 'Finance'],
        singleBody: (o) => `Order #${o.no}: COD cash not reconciled (${codDays}+ days)`,
        groupNoun: 'orders with COD cash not reconciled',
        route: '/cashup',
      },
      codOverdue,
    )
  }

  // Default 09:00 WIB — assumes a UTC container; verify with
  // `docker exec directus date` and adjust PUSH_REMINDER_CRON if not.
  schedule(process.env.PUSH_REMINDER_CRON ?? '0 2 * * *', async () => {
    try {
      await runReminders()
    } catch (err) {
      logger.error(`push-notify: reminder run failed: ${err instanceof Error ? err.message : err}`)
    }
  })

  // Testing only: also run once at boot. Unset PUSH_REMINDER_RUN_ON_START
  // once verified — every Directus restart would otherwise re-send.
  if (process.env.PUSH_REMINDER_RUN_ON_START === 'true') {
    runReminders().catch((err) =>
      logger.error(`push-notify: startup reminder run failed: ${err instanceof Error ? err.message : err}`),
    )
  }
}
