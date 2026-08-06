import { useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { Languages, LogOut, Sparkles, Download, Upload, Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react'
import { correctionCount } from '../lib/recognize.js'
import { ROLES, CAPABILITIES, can } from '../lib/domain.js'
import { LANGS } from '../lib/i18n.js'
import { PageHead } from '../components/ui.jsx'
import { ordersToCSV, downloadText } from '../lib/export.js'
import { backupAll, restoreAll } from '../lib/backup.js'
import { clearAllPhotos } from '../lib/photos.js'

const ROLE_COLS = ['Admin', 'Warehouse', 'Production', 'Finance', 'Courier']
const GROUPS = [...new Set(CAPABILITIES.map((c) => c.group))]

export default function Settings() {
  const { user, orders, users, addUser, updateUser, removeUser, settings, updateSettings, logout, resetData, lang, setLang, t } = useStore()
  const nav = useNavigate()
  const learned = correctionCount()
  const [newUser, setNewUser] = useState({ name: '', role: 'Warehouse' })
  const [editU, setEditU] = useState(null)  // the team member being edited (a working copy)
  // Team management is Owner-only — deactivating/removing the LAST active Owner would permanently
  // orphan this device (nobody left who can manage the team, permissions, or reactivate anyone).
  const lastActiveOwner = (u) => u.role === 'Owner' && u.active && !(users || []).some((x) => x.id !== u.id && x.role === 'Owner' && x.active)
  // Toggle one role's permission for one capability (writes a sparse override; can() merges defaults).
  const setPerm = (cap, role, val) => {
    const permissions = { ...(settings.permissions || {}) }
    permissions[cap] = { ...(permissions[cap] || {}), [role]: val }
    updateSettings({ permissions })
  }

  const [backing, setBacking] = useState(false)
  const doBackup = async () => {
    setBacking(true)
    try {
      const b = await backupAll()
      const blob = new Blob([JSON.stringify(b)], { type: 'application/json' })  // no BOM — must stay valid JSON
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `ipp-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) { alert('Backup failed: ' + e.message) }
    setBacking(false)
  }
  const onRestore = (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''
    if (!f) return
    if (!window.confirm(t('Restore REPLACES all data on this device. Continue?'))) return
    const r = new FileReader()
    r.onload = async () => { try { await restoreAll(JSON.parse(r.result)); alert(t('Restored — reloading.')); location.reload() } catch (err) { alert('Restore failed: ' + err.message) } }
    r.readAsText(f)
  }
  const onReset = () => {
    if (!window.confirm(t('Reset ALL data and photos back to the demo? This cannot be undone — back up first.'))) return
    clearAllPhotos().catch(() => {}).finally(() => resetData())
  }

  return (
    <>
      <PageHead title={t('Settings')} />
      <div className="page" style={{ maxWidth: 720 }}>

      <div className="sec-label">{t('Account')}</div>
      <div className="card card-pad mb"><div style={{ fontWeight: 600 }}>{user.name}</div><div className="tiny muted">{t(user.role)}</div></div>
      {/* No fake "Change password" here — it stored nothing and lied "✓ saved". Real password login
          (+ recovery) arrives with the deferred Firebase Auth backend; see the note under Team. */}

      {can(user.role, 'manageTeam', settings) && (<>
        <div className="sec-label mt-lg">{t('Team')}</div>
        <div className="tiny muted" style={{ margin: '-4px 2px 8px' }}>{t('Manage who can log in. Set a PIN on a person to require the real login — without a PIN they stay on the demo quick-login. (Online accounts with recovery arrive with Firebase at go-live.)')}</div>
        <div className="card card-pad mb">
          {(users || []).map((u) => (
            editU && editU.id === u.id ? (
              <div key={u.id} style={{ padding: '8px 0' }}>
                <div className="grid2 mb" style={{ gap: 8 }}>
                  <input className="input" placeholder={t('Name')} value={editU.name} onChange={(e) => setEditU({ ...editU, name: e.target.value })} autoFocus />
                  <select className="input" value={editU.role} onChange={(e) => setEditU({ ...editU, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select>
                </div>
                <div className="grid2 mb" style={{ gap: 8 }}>
                  <input className="input" placeholder={t('Username')} value={editU.username || ''} onChange={(e) => setEditU({ ...editU, username: e.target.value })} />
                  <input className="input" placeholder={t('PIN (4–6 digits)')} inputMode="numeric" value={editU.pin || ''} onChange={(e) => setEditU({ ...editU, pin: e.target.value.replace(/[^\d]/g, '').slice(0, 6) })} />
                </div>
                {u.role === 'Owner' && (editU.pin || '').length > 0 && <div className="tiny" style={{ color: 'var(--warning-text)', margin: '-4px 0 8px' }}>{t("Don't forget the Owner PIN — there is no recovery until the app goes online.")}</div>}
                <div className="flex items gap">
                  <button className="btn btn-ghost" style={{ color: 'var(--danger-text)' }} onClick={() => { if (lastActiveOwner(u)) { window.alert(t('This is the last active Owner — add another Owner first, or the team can never be managed again.')); return } if (window.confirm(t('Remove this team member?'))) { removeUser(u.id); setEditU(null) } }}><Trash2 size={15} /></button>
                  <span className="spacer" />
                  <button className="btn btn-secondary" onClick={() => setEditU(null)}>{t('Cancel')}</button>
                  <button className="btn btn-primary" disabled={!editU.name.trim() || ((editU.pin || '') !== '' && (editU.pin || '').length < 4)} onClick={() => { if (lastActiveOwner(u) && editU.role !== 'Owner') { window.alert(t('This is the last active Owner — add another Owner first, or the team can never be managed again.')); return } updateUser({ id: u.id, name: editU.name.trim(), role: editU.role, username: (editU.username || '').trim(), pin: (editU.pin || '').trim() || null }); setEditU(null) }}>{t('Save')}</button>
                </div>
              </div>
            ) : (
              <div key={u.id} className="flex items" style={{ padding: '6px 0', gap: 10, opacity: u.active ? 1 : 0.5 }}>
                {/* name grows (inline flex:1 — there is no global .grow, only .rowcard .grow) so the
                    pencil + toggle pack to the right and line up in a tidy column across every row */}
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setEditU({ ...u, username: u.username || '' })}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                  <div className="tiny muted">{t(u.role)}{u.username ? ' · @' + u.username : ''}{u.pin ? ' · ' + t('PIN set') : ' · ' + t('demo login')}{u.active ? '' : ' · ' + t('inactive')}</div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => setEditU({ ...u, username: u.username || '' })}><Pencil size={14} /></button>
                <button className={'toggle' + (u.active ? ' on' : '')} style={{ flexShrink: 0 }} onClick={() => { if (u.active && lastActiveOwner(u)) { window.alert(t('This is the last active Owner — add another Owner first, or the team can never be managed again.')); return } updateUser({ id: u.id, active: !u.active }) }} />
              </div>
            )
          ))}
          <div className="flex gap mt" style={{ paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
            <input className="input" style={{ flex: 1 }} placeholder={t('Name')} value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <select className="input" style={{ maxWidth: 130 }} value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select>
            <button className="btn btn-secondary" disabled={!newUser.name.trim()} onClick={() => { addUser({ id: 'u' + Date.now(), name: newUser.name.trim(), role: newUser.role, username: '', active: true }); setNewUser({ name: '', role: 'Warehouse' }) }}><Plus size={15} /></button>
          </div>
        </div>
      </>)}

      {user.role === 'Owner' && (<>
        <div className="sec-label mt-lg"><ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{t('Roles & permissions')}</div>
        <div className="tiny muted" style={{ margin: '-4px 2px 8px' }}>{t('Turn each function on or off per role. Owner always has full access. Tap a cell to change it.')}</div>
        <div className="card card-pad mb" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr><th></th>{ROLE_COLS.map((r) => <th key={r} style={{ padding: '0 2px 6px', fontWeight: 600, fontSize: 11 }}>{t(r)}</th>)}</tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <Fragment key={g}>
                  <tr><td colSpan={6} className="muted" style={{ padding: '8px 0 2px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t(g)}</td></tr>
                  {CAPABILITIES.filter((c) => c.group === g).map((c) => (
                    <tr key={c.key} style={{ borderTop: '0.5px solid var(--border)' }}>
                      <td style={{ padding: '7px 8px 7px 0', lineHeight: 1.2 }}>{t(c.label)}</td>
                      {ROLE_COLS.map((r) => {
                        const on = can(r, c.key, settings)
                        return (
                          <td key={r} style={{ textAlign: 'center', padding: '3px 2px' }}>
                            <button onClick={() => setPerm(c.key, r, !on)} aria-label={`${c.key} ${r}`}
                              style={{ width: 26, height: 24, borderRadius: 6, border: '0.5px solid var(--border)', background: on ? 'var(--success-bg, var(--surface-2))' : 'transparent', color: on ? 'var(--success-text)' : 'var(--text-3)', fontWeight: 700, cursor: 'pointer' }}>{on ? '✓' : '—'}</button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <button className="btn btn-ghost btn-sm mt" style={{ color: 'var(--text-2)' }} onClick={() => { if (window.confirm(t('Reset all role permissions to defaults?'))) updateSettings({ permissions: {} }) }}>{t('Reset permissions to defaults')}</button>
        </div>
      </>)}

      <div className="sec-label mt-lg">{t('Intake learning')}</div>
      <div className="card card-pad mb">
        <div className="flex items gap"><Sparkles size={18} style={{ color: 'var(--info)', flexShrink: 0 }} />
          <div className="grow"><div style={{ fontWeight: 600 }}>{learned} {t('learned matches')}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{t('Shared knowledge base — every correction your team makes is kept and reused. Cannot be cleared.')}</div></div>
        </div>
      </div>

      {can(user.role, 'manageSettings', settings) && (<>
      <div className="sec-label mt-lg">{t('Cold Storage')}</div>
      <div className="card card-pad mb">
        <div className="flex items between">
          <span className="grow"><div style={{ fontWeight: 600 }}>{t('Require a proof photo on every item')}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{t('Warehouse must attach at least one photo per item before releasing.')}</div></span>
          <button className={'toggle' + (settings.requirePhoto ? ' on' : '')} onClick={() => updateSettings({ requirePhoto: !settings.requirePhoto })} />
        </div>
        <div className="label" style={{ margin: '16px 0 8px' }}>{t('Weight tolerance vs the order')}</div>
        <div className="grid2">
          <div className="field" style={{ margin: 0 }}><label>{t('Flag if below by (%)')}</label>
            <input className="input" type="number" min="0" max="100" value={settings.tolBelowPct} onChange={(e) => updateSettings({ tolBelowPct: Math.max(0, Number(e.target.value) || 0) })} /></div>
          <div className="field" style={{ margin: 0 }}><label>{t('Flag if above by (%)')}</label>
            <input className="input" type="number" min="0" max="100" value={settings.tolAbovePct} onChange={(e) => updateSettings({ tolAbovePct: Math.max(0, Number(e.target.value) || 0) })} /></div>
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>{t('A weighed total outside this range shows a gentle hint — it does not block.')}</div>
      </div>

      <div className="sec-label mt-lg">{t('Dispatch')}</div>
      <div className="card card-pad mb">
        <div className="flex items between">
          <span className="grow"><div style={{ fontWeight: 600 }}>{t('Require delivery proof photos')}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{t('Courier must attach condition, received-by & signed-invoice photos before marking delivered. Off = photos optional.')}</div></span>
          <button className={'toggle' + (settings.dispatchProofRequired !== false ? ' on' : '')} onClick={() => updateSettings({ dispatchProofRequired: settings.dispatchProofRequired === false })} />
        </div>
      </div>
      </>)}

      <div className="sec-label mt-lg">{t('General')}</div>
      <div className="rowcard" style={{ cursor: 'default' }}><Languages size={16} className="muted" /><span className="grow">{t('Language')}</span>
        <div className="seg">{LANGS.map((l) => <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)}>{l.label}</button>)}</div>
      </div>

      {can(user.role, 'backupRestore', settings) && (<>
      <div className="sec-label mt-lg">{t('Data')}</div>
      <button className="btn btn-secondary btn-block" onClick={doBackup} disabled={backing}><Download size={15} /> {backing ? t('Preparing backup…') : t('Backup everything (download)')}</button>
      <label className="btn btn-secondary btn-block mt" style={{ cursor: 'pointer' }}><Upload size={15} /> {t('Restore from backup')}
        <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onRestore} /></label>
      <div className="tiny muted" style={{ margin: '6px 2px 0' }}>{t('Full backup = orders, customers, settings + all photos in one file. Keep a copy off this device.')}</div>
      <button className="btn btn-secondary btn-block mt" onClick={() => downloadText(`ipp-all-orders-${new Date().toISOString().slice(0, 10)}.csv`, ordersToCSV(orders, user.role, settings))}><Download size={15} /> {t('Export all orders (CSV)')}</button>
      <div className="tiny muted" style={{ margin: '6px 2px 0' }}>{t('Columns follow your role — photos & PO export via an order’s Print → Save as PDF.')}</div>
      </>)}

      <button className="btn btn-danger-outline btn-block mt-lg" onClick={() => { logout(); nav('/login') }}><LogOut size={15} /> {t('Log out')}</button>
      {can(user.role, 'resetData', settings) && <button className="btn btn-ghost btn-block mt" style={{ color: 'var(--danger-text)' }} onClick={onReset}>{t('Reset demo data')}</button>}
      </div>
    </>
  )
}
