import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { setUpdateListener, applyUpdate } from '../lib/swUpdate.js'

// Appears only once a newer build has been downloaded and is waiting. The current build keeps
// running until the user taps Reload, so nothing in progress is interrupted. Clicking Reload
// activates the new service worker (skipWaiting) and reloads the page.
export default function UpdateBanner() {
  const { t } = useStore()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setUpdateListener(() => setReady(true))
    return () => setUpdateListener(null)
  }, [])
  if (!ready) return null
  return (
    <div className="update-banner">
      <span className="flex items gap"><RefreshCw size={15} /> {t('A new version is ready.')}</span>
      <button className="btn btn-primary btn-sm" onClick={applyUpdate}>{t('Reload')}</button>
    </div>
  )
}
