import { STAGES, STAGE_LABEL, STAGE_COLOR } from '../lib/domain.js'
import { useState, useEffect } from 'react'
import { useStore } from '../lib/store.jsx'
import { processPhoto } from '../lib/img.js'
import { savePhoto, getPhotoURL } from '../lib/photos.js'
import { ChevronLeft, Camera, CircleCheck, CircleX } from 'lucide-react'

// Renders a stored (IndexedDB) photo by id. Photos are kept full-resolution so they stay
// clear/zoomable; `open` makes a click open the full-size image in a new tab.
export function DbImage({ id, alt, style, open }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    getPhotoURL(id).then((u) => { if (live) setUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [id])
  if (!url) return <span style={{ display: 'inline-block', background: 'var(--surface-2)', borderRadius: 4, ...style }} />
  return <img src={url} alt={alt || ''} style={{ ...style, cursor: open ? 'zoom-in' : undefined }} onClick={open ? () => window.open(url, '_blank') : undefined} />
}

// Opens a stored file (IndexedDB id, or a legacy dataUrl) in a new tab — used for PO PDFs.
export function DbFileLink({ id, dataUrl, className, style, children }) {
  const onClick = (e) => {
    e.preventDefault()
    if (id) getPhotoURL(id).then((u) => u && window.open(u, '_blank'))
    else if (dataUrl) window.open(dataUrl, '_blank')
  }
  return <a href="#" onClick={onClick} className={className} style={style}>{children}</a>
}

// Attach-or-camera photo control. No `capture` attr → phones offer Take Photo / Library / Browse;
// desktop opens the file dialog. Stores a full-res JPEG in IndexedDB and hands back its id.
export function PhotoButton({ value, onPick, label, block }) {
  const onChange = (e) => {
    const f = e.target.files && e.target.files[0]
    // Surface failures (e.g. an iPhone HEIC that this browser can't decode) instead of silently
    // dropping the photo — otherwise the proof just never appears with no explanation.
    if (f) processPhoto(f).then(savePhoto).then(onPick).catch(() => alert("Couldn't read that photo — please use a JPG or PNG (or a screenshot)."))
    e.target.value = ''
  }
  return (
    <label className={'btn btn-secondary' + (block ? ' btn-block mb' : '')}
      style={{ justifyContent: 'flex-start', cursor: 'pointer', ...(value ? { borderColor: 'var(--success)', color: 'var(--success-text)' } : {}) }}>
      {value ? <CircleCheck size={15} /> : <Camera size={15} />}
      <span>{label}</span>
      {value ? <DbImage id={value} style={{ height: 24, width: 'auto', borderRadius: 4, marginLeft: 'auto' }} /> : null}
      {/* Clear a wrong photo (you can also just tap to replace). preventDefault stops the label from
          re-opening the file picker on the same click. */}
      {value ? <CircleX size={17} title="Remove photo" style={{ marginLeft: 6, flexShrink: 0, color: 'var(--text-3)' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(null) }} /> : null}
      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onChange} />
    </label>
  )
}

export function PageHead({ title, sub, back, children }) {
  return (
    <div className="pagehead">
      <div className="pagehead-l">
        {back && <ChevronLeft size={20} style={{ cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }} onClick={back} />}
        <div style={{ minWidth: 0 }}>
          <div className="pagehead-title">{title}</div>
          {sub ? <div className="pagehead-sub">{sub}</div> : null}
        </div>
      </div>
      {children ? <div className="flex items gap" style={{ flexShrink: 0 }}>{children}</div> : null}
    </div>
  )
}

export function StageText({ stage, order }) {
  const { t } = useStore()
  // Dispatch covers two real states — when the order is available, badge the one that's true:
  // still waiting for a courier ("Awaiting pickup") vs actually gone ("Out for delivery").
  const label = stage === 'dispatch' && order
    ? ((order.takenBy || order.pickup || order.thirdParty) ? 'Out for delivery' : 'Awaiting pickup')
    : STAGE_LABEL[stage]
  return (
    <span className="status">
      <span className="dot" style={{ background: STAGE_COLOR[stage] }} />
      {t(label)}
    </span>
  )
}

export function Stepper({ stage }) {
  const i = STAGES.indexOf(stage)
  return (
    <div className="steps">
      {STAGES.map((s, idx) => (
        <div key={s} style={{ display: 'contents' }}>
          <span className={'sdot' + (idx <= i ? ' on' : '')} />
          {idx < STAGES.length - 1 && <span className="sline" style={idx < i ? { background: 'var(--info)' } : null} />}
        </div>
      ))}
    </div>
  )
}

export function Avatar({ name }) {
  return <div className="avatar">{(name || '?').slice(0, 1).toUpperCase()}</div>
}

export function Line({ qty, unit, name, ordered }) {
  return (
    <div className="line">
      <span className="qty">{qty} {unit}</span>
      <span className="name">{name}{ordered ? <span className="qty-ref"> · {ordered}</span> : null}</span>
    </div>
  )
}
