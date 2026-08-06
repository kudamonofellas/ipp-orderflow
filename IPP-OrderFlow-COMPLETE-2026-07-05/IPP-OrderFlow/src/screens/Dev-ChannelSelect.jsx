import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { PageHead } from '../components/ui.jsx'
import { Building2, ShoppingBag, ChevronRight, Clock } from 'lucide-react'

export default function ChannelSelect() {
  const nav = useNavigate()
  const { t } = useStore()
  return (
    <>
      <PageHead title={t('New order')} sub={t('Which channel is this order for?')} />
      <div className="page" style={{ maxWidth: 640 }}>

      <button className="chan-card chan-horeca" onClick={() => nav('/new/intake')}>
        <div className="chan-ic" style={{ background: 'var(--info)', color: '#fff' }}><Building2 size={26} /></div>
        <div className="chan-body">
          <div className="chan-title">Horeca <span className="chip chip-info">B2B</span></div>
          <div className="chan-sub">{t('Hotels, restaurants & cafés — buy whole, cut to order.')}</div>
        </div>
        <ChevronRight size={20} className="chan-arrow" />
      </button>

      <button className="chan-card chan-mf" onClick={() => alert('Meatfellas (B2C) — coming in a later build.')}>
        <div className="chan-ic" style={{ background: 'var(--c-courier)', color: '#fff' }}><ShoppingBag size={26} /></div>
        <div className="chan-body">
          <div className="chan-title">Meatfellas <span className="chip">B2C</span></div>
          <div className="chan-sub">{t('Retail & online shop — Tokopedia, Shopee, walk-in.')}</div>
        </div>
        <span className="chip chip-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><Clock size={11} /> {t('Soon')}</span>
      </button>
      </div>
    </>
  )
}
