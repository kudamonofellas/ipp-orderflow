import { useState, useRef, useEffect, useMemo, useId } from 'react'
import { ChevronDown, Check } from 'lucide-react'

// Searchable product picker (replaces a 239-item native <select>). Type to filter — every space-
// separated word must appear somewhere in the product name (or its Accurate name), so a match can be
// at the FRONT, MIDDLE or BACK. Results are ranked best-first (earlier match + word-start wins).
function score(name, accurate, tokens) {
  const hay = (name + '  ' + (accurate || '')).toLowerCase()  // search name + accurate code
  let s = 0
  for (const tk of tokens) {
    const idx = hay.indexOf(tk)
    if (idx === -1) return null                 // a typed word isn't there → not a match at all
    s += idx                                    // earlier in the string = better
    if (idx === 0 || hay[idx - 1] === ' ') s -= 4   // bonus: token starts a word
  }
  if (name.toLowerCase().startsWith(tokens.join(' '))) s -= 8  // strong bonus: name starts with the whole query
  return s + name.length * 0.02                 // tiebreak: shorter names slightly preferred
}

export default function ProductPicker({ value, products, onPick, placeholder = 'Search product…', typed }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(-1)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const lid = useId()
  const optId = (i) => `${lid}-o${i}`

  const selected = products.find((p) => p.id === value)

  const results = useMemo(() => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!tokens.length) return [...products].sort((a, b) => a.name.localeCompare(b.name))
    return products
      .map((p) => ({ p, s: score(p.name, p.accurateName, tokens) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name))
      .map((x) => x.p)
  }, [q, products])

  // close when clicking/tapping outside
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  // What's highlighted when the menu (re)opens or the query changes:
  //  - typing a query → highlight the top match (Enter picks it — typeahead)
  //  - browsing with no query → highlight the CURRENT selection, so it's visible AND a reflexive Enter
  //    re-picks the same product (a no-op) instead of silently grabbing the alphabetically-first one.
  //  - nothing selected + no query → -1 (no highlight; Enter does nothing).
  useEffect(() => { setActive(q.trim() ? 0 : results.findIndex((p) => p.id === value)) }, [q, open, value])
  // keep the highlighted row in view while arrowing
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('.ppick-opt.active')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const choose = (p) => { onPick(p ? p.id : ''); setOpen(false); setQ(''); inputRef.current && inputRef.current.blur() }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { if (open && active >= 0 && results[active]) { e.preventDefault(); choose(results[active]) } }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div className="ppick" ref={boxRef}>
      <div className={'ppick-field' + (open ? ' open' : '')} onClick={() => { setOpen(true); inputRef.current && inputRef.current.focus() }}>
        <input ref={inputRef} className="ppick-input" value={open ? q : (selected ? selected.name : '')}
          placeholder={selected ? selected.name : placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKey}
          role="combobox" aria-expanded={open} aria-controls={lid} aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 && results[active] ? optId(active) : undefined}
          aria-label={selected ? `Product: ${selected.name}` : 'Search product'} />
        <ChevronDown size={16} className="ppick-caret" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>
      {open && (
        <div className="ppick-menu" id={lid} role="listbox" ref={listRef}>
          {typed && <div className="ppick-typed">you typed: <b>{typed}</b></div>}
          <div className="ppick-opt ppick-clear" role="option" aria-selected={!value} onMouseDown={(e) => { e.preventDefault(); choose(null) }}>— keep unmatched (no product) —</div>
          {results.length === 0 && <div className="ppick-empty">No product matches “{q.trim()}”.</div>}
          {results.map((p, i) => (
            <div key={p.id} id={optId(i)} role="option" aria-selected={p.id === value}
              className={'ppick-opt' + (i === active ? ' active' : '') + (p.id === value ? ' sel' : '')}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(p) }}>
              <span className="ppick-name">{p.name}</span>
              {p.id === value && <Check size={14} className="ppick-check" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
