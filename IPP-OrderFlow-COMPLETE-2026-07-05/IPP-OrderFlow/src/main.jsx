import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { StoreProvider } from './lib/store.jsx'
import { registerApply, notifyUpdateReady } from './lib/swUpdate.js'
import './index.css'

// Keep the installed app current WITHOUT yanking the page out from under someone. registerType
// is 'prompt': a new build downloads in the background, then onNeedRefresh fires and we show a
// "Reload" banner — the user applies it when ready (forcing a reload would lose an order being
// typed). We also poll every 60s so a long-open tab notices a fresh deploy promptly; the poll is
// offline-safe (a courier with no signal must not get an unhandled rejection each minute).
// In dev this whole callback machinery is a stub (the SW isn't active), so none of it runs.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { notifyUpdateReady() },
  onRegisteredSW(_url, r) {
    if (r) setInterval(() => { if (navigator.onLine) r.update().catch(() => {}) }, 60 * 1000)
  },
})
registerApply(() => updateSW(true))
// Dev-only manual trigger to preview the "new version" banner without a real deploy.
if (import.meta.env.DEV) window.__swUpdateReady = notifyUpdateReady

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
