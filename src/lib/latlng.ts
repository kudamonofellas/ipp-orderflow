import type { LatLng } from '../types/directus';

/**
 * Accepts a plain "lat, lng" pair or a pasted Google Maps URL containing
 * coordinates (the "@lat,lng,zoomz" form or a "?q=lat,lng" query param).
 * Returns null for anything else — including a URL with no coordinates in
 * it (e.g. a shortened maps.app.goo.gl link), which needs the full/desktop
 * link instead.
 */
export function parseLatLng(raw: string): LatLng | null {
  const s = raw.trim();
  if (!s) return null;
  const patterns = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export function formatLatLng(g: LatLng | null | undefined): string {
  return g ? `${g.lat}, ${g.lng}` : '';
}
