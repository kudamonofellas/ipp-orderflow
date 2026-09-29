// Idempotent provisioning of the `notification_prefs` collection + per-role
// ACLs. Run once per Directus instance:
//   TARGET_URL=https://dev-admin.kudafellas.cloud TARGET_TOKEN=<admin token> node scripts/provision.mjs
//   TARGET_URL=https://admin.kudafellas.cloud     TARGET_TOKEN=<admin token> node scripts/provision.mjs
const URL_ = process.env.TARGET_URL, TOKEN = process.env.TARGET_TOKEN;
if (!URL_ || !TOKEN) throw new Error("TARGET_URL / TARGET_TOKEN required");

async function api(method, path, body) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}
const errText = (r) => r.json?.errors?.[0]?.message ?? JSON.stringify(r.json).slice(0, 200);

const existing = await api("GET", "/collections/notification_prefs");
if (existing.ok) {
  console.log("collection notification_prefs: already exists");
} else {
  const r = await api("POST", "/collections", {
    collection: "notification_prefs",
    meta: {
      icon: "notifications",
      note: "Per-user push notification preference (all / important / off).",
      accountability: "all",
      sort_field: null,
    },
    schema: { name: "notification_prefs" },
    fields: [
      { field: "id", type: "uuid", meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
        schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    ],
  });
  console.log("collection notification_prefs:", r.ok ? "created" : "FAILED " + errText(r));
  if (!r.ok) process.exit(1);
}

const fields = [
  { field: "user", type: "uuid",
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], required: true, note: "Owner of this preference." },
    schema: { is_nullable: false, is_unique: true } },
  { field: "mode", type: "string",
    meta: { interface: "select-dropdown", options: { choices: [
      { text: "All", value: "all" }, { text: "Important only", value: "important" }, { text: "Off", value: "off" },
    ] }, note: "No row = 'all' (default)." },
    schema: { default_value: "all", max_length: 32 } },
  { field: "date_updated", type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true }, schema: {} },
];
for (const f of fields) {
  const has = await api("GET", `/fields/notification_prefs/${f.field}`);
  if (has.ok) { console.log(`  field ${f.field}: exists`); continue; }
  const r = await api("POST", "/fields/notification_prefs", f);
  console.log(`  field ${f.field}:`, r.ok ? "created" : "FAILED " + errText(r));
}

const relCheck = await api("GET", "/relations/notification_prefs/user");
if (relCheck.ok) console.log("  relation user -> directus_users: exists");
else {
  const r = await api("POST", "/relations", {
    collection: "notification_prefs", field: "user", related_collection: "directus_users",
    meta: { sort_field: null, one_deselect_action: "delete" },
    schema: { on_delete: "CASCADE" },
  });
  console.log("  relation user -> directus_users:", r.ok ? "created" : "FAILED " + errText(r));
}

// Own-row CRUD for every non-admin role — same pattern as push_tokens.
const roles = (await api("GET", "/roles?fields=id,name,admin_access&limit=-1")).json.data;
const mine = { user: { _eq: "$CURRENT_USER" } };
const perms = [
  { action: "create", validation: mine, fields: ["*"] },
  { action: "read", permissions: mine, fields: ["*"] },
  { action: "update", permissions: mine, validation: mine, fields: ["mode"] },
  { action: "delete", permissions: mine },
];
for (const role of roles.filter((r) => !r.admin_access)) {
  for (const p of perms) {
    const q = `/permissions?filter[role][_eq]=${role.id}&filter[collection][_eq]=notification_prefs&filter[action][_eq]=${p.action}`;
    const found = (await api("GET", q)).json?.data ?? [];
    if (found.length) { console.log(`  perm ${role.name}/${p.action}: exists`); continue; }
    const r = await api("POST", "/permissions", { role: role.id, collection: "notification_prefs", ...p });
    console.log(`  perm ${role.name}/${p.action}:`, r.ok ? "created" : "FAILED " + errText(r));
  }
}
console.log("done:", URL_);
