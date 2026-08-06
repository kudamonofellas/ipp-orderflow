import { useState } from 'react'
import { Beef } from 'lucide-react'

// Tries your real logo first (public/logo.png), then a branded placeholder (public/logo.svg),
// then falls back to an icon. Drop your PNG at public/logo.png and it appears everywhere.
const SRCS = ['/logo.png', '/logo.svg']

export function Logo({ size = 22 }) {
  const [i, setI] = useState(0)
  if (i >= SRCS.length) return <Beef size={size} style={{ color: 'var(--c-cold)' }} />
  return <img src={SRCS[i]} alt="IPP" onError={() => setI((n) => n + 1)}
    style={{ height: size, width: 'auto', objectFit: 'contain', display: 'block' }} />
}
