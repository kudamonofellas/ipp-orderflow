import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import OrderList from '../components/OrderList.jsx'
import { PageHead } from '../components/ui.jsx'
import { ordersToCSV, downloadText } from '../lib/export.js'
import { STAGE_LABEL, RETURN_BUCKETS, returnBuckets, deliveredOn, cancelledOn, can } from '../lib/domain.js'
import { Search, Download } from 'lucide-react'

// Stages anyone can filter to (view-only unless it's their own stage — acting is still gated in OrderDetail).
const STAGE_FILTERS = ['intake', 'cold', 'finance', 'production', 'packing', 'finalise', 'dispatch', 'outstanding', 'awaiting', 'delivered', 'returned', 'cancelled']

export default function Orders() {
  const { orders, user, t, settings } = useStore()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  // The URL is the single source of truth for the filter, so the dashboard links, the dropdown, and
  // browser Back/Forward all stay in sync. ?ret= (return bucket, set by the Returns strip) wins over
  // ?stage=; picking a stage from the dropdown rewrites the URL and drops ret.
  const ret = params.get('ret') || ''
  // Clickable dashboard cards deep-link here: ?filter=today = orders CREATED today; ?dfrom&dto =
  // delivered orders whose ACTUAL delivery date falls in [dfrom, dto) (the Delivered card's period).
  const dfrom = params.get('dfrom'); const dto = params.get('dto'); const dtype = params.get('dtype') || 'delivered'
  const todayNew = params.get('filter') === 'today'
  const special = !!(ret || (dfrom && dto) || todayNew)
  const stage = special ? 'all' : (params.get('stage') || 'all')

  // Cancelling never removes an order — it keeps its queue number and stays VISIBLE (marked Cancelled),
  // just out of the 'active' working set. (There is no separate 'void' — cancel is the single dead state.)
  const filtered = orders
    .filter((o) => {
      if (ret) return returnBuckets(o).includes(ret)          // viewing one step of the returns flow
      if (dfrom && dto) {                                     // delivered / cancelled within a picked period
        const dfn = dtype === 'cancelled' ? cancelledOn : deliveredOn
        const d = dfn(o); const inR = d >= new Date(dfrom) && d < new Date(dto)
        if (dtype === 'cancelled') return o.stage === 'cancelled' && inR
        return o.stage === 'delivered' && inR
      }
      if (todayNew) return new Date(o.createdAt).toDateString() === new Date().toDateString()
      if (stage === 'active') return !['delivered', 'cancelled', 'returned'].includes(o.stage)
      if (stage === 'pending-docs') return o.stage === 'delivered' && !o.docsReturned   // delivered, awaiting the signed DO/SI back
      if (stage === 'completed') return o.stage === 'delivered' && !!o.docsReturned       // delivered + signed docs returned
      if (stage === 'finance') return o.stage === 'finance' || (o.stage === 'cold' && !o.hold && !(o.payment && o.payment.confirmed))  // Finance's queue runs parallel with Cold
      if (stage === 'all') return true
      return o.stage === stage
    })
    // search covers the ITEMS too — "who ordered wagyu this week" works ("wagyu" matches line names)
    .filter((o) => (o.customerName + ' ' + o.no + ' ' + (o.lines || []).map((l) => l.name).join(' ')).toLowerCase().includes(q.toLowerCase()))
  const listTitle = ret ? ((RETURN_BUCKETS.find((b) => b.key === ret) || {}).label || 'Returns') : (dfrom && dto) ? (dtype === 'cancelled' ? 'Cancelled Orders' : 'Delivered Orders') : todayNew ? "Today's Orders" : stage === 'all' ? 'All orders' : stage === 'active' ? 'In progress' : stage === 'pending-docs' ? 'Signed DO/SI not returned yet' : stage === 'completed' ? 'Completed' : STAGE_LABEL[stage]
  const exportCSV = () => downloadText(`ipp-orders-${new Date().toISOString().slice(0, 10)}.csv`, ordersToCSV(filtered, user.role, settings))

  return (
    <>
      <PageHead title={t('Orders')}>
        {can(user.role, 'exportCSV', settings) && <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={!filtered.length}><Download size={14} /> {t('Export')}</button>}
      </PageHead>
      <div className="page">
        <div className="flex items gap mb">
          <select className="input" style={{ maxWidth: 190, flexShrink: 0 }} value={stage} onChange={(e) => setParams(e.target.value === 'all' ? {} : { stage: e.target.value })}>
            <option value="all">{t('All stages')}</option>
            <option value="active">{t('In progress')}</option>
            <option value="pending-docs">{t('Signed DO/SI not returned yet')}</option>
            <option value="completed">{t('Completed')}</option>
            {STAGE_FILTERS.map((s) => <option key={s} value={s}>{t(STAGE_LABEL[s])}</option>)}
          </select>
          <div className="grow" style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input className="input" style={{ paddingLeft: 36, width: '100%' }} placeholder={t('Search # or customer…')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <OrderList orders={filtered} title={listTitle} />
      </div>
    </>
  )
}
