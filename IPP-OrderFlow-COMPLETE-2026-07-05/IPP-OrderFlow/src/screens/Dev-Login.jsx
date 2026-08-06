import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { Logo } from '../components/Logo.jsx'

export default function Login() {
  const { users, login, t } = useStore()
  const nav = useNavigate()
  const active = (users || []).filter((u) => u.active)
  // REAL login = team members with a PIN set (Settings → Team). Anyone without a PIN stays on the
  // demo quick-login below — so the demo naturally shrinks away as the owner secures each person.
  // (Proper online accounts with recovery arrive with the Firebase backend; this is the device login.)
  const secured = active.filter((u) => !!u.pin)
  const demo = active.filter((u) => !u.pin)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const go = (u) => { login({ name: u.name, role: u.role }); nav('/') }
  const submit = () => {
    const q = name.trim().toLowerCase()
    const u = secured.find((x) => x.name.toLowerCase() === q || (x.username || '').toLowerCase() === q)
    if (!u || String(u.pin) !== pin.trim()) { setErr(t('Wrong name or PIN.')); setPin(''); return }
    go(u)
  }
  return (
    <div className="shell" style={{ justifyContent: 'center', padding: 18 }}>
      <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
        <div style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}><Logo size={64} /></div>
        <div className="h1" style={{ marginTop: 8 }}>IPP OrderFlow</div>
        <div className="muted tiny" style={{ marginTop: 2 }}>Horeca · B2B</div>
      </div>

      {/* REAL login — always on top, verified against the team's PINs (Settings → Team). */}
      <div className="field"><label>{t('Name or username')}</label><input className="input" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} placeholder={t('Name or username')} autoFocus /></div>
      <div className="field"><label>PIN</label><input className="input" type="password" inputMode="numeric" value={pin} onChange={(e) => { setPin(e.target.value); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && name.trim() && pin.trim() && submit()} placeholder="••••" /></div>
      {err ? <div className="tiny" style={{ color: 'var(--danger-text)', marginBottom: 8 }}>{err}</div> : null}
      <button className="btn btn-primary btn-block" disabled={!name.trim() || !pin.trim()} onClick={submit}>{t('Log in')}</button>
      {secured.length === 0 && <div className="tiny muted" style={{ textAlign: 'center', marginTop: 8 }}>{t('No one has a PIN yet — set PINs in Settings → Team.')}</div>}

      {/* DEMO quick-login — team members WITHOUT a PIN yet. Set a PIN in Settings → Team and the
          person moves to the real login above. */}
      {demo.length > 0 && (<>
        <div className="sec-label" style={{ textAlign: 'center', margin: '18px 0 9px' }}>{t('Log in as')} · <span style={{ color: 'var(--warning-text)' }}>{t('demo')}</span></div>
        <div className="grid2">
          {demo.map((u) => (
            <button key={u.id} className="card card-pad" style={{ textAlign: 'left', cursor: 'pointer', border: '0.5px solid var(--border)' }} onClick={() => go(u)}>
              <div style={{ fontWeight: 600 }}>{u.name}</div>
              <div className="muted tiny">{t(u.role)}</div>
            </button>
          ))}
        </div>
        <div className="tiny muted" style={{ textAlign: 'center', marginTop: 14 }}>{t('These roles have no PIN yet — anyone with this device can open them. Set a PIN in Settings → Team to require the real login above. Online accounts (Firebase) come at go-live.')}</div>
      </>)}
    </div>
  )
}
