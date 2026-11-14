/**
 * ESPN headshot helpers.
 * Prefer the CDN combiner with explicit width/height so list rows fetch ~4–16KB
 * crops instead of full-resolution player PNGs, and so the service worker can
 * cache a stable URL per size bucket.
 */

export type HeadshotSize = 'sm' | 'md' | 'lg'

/** CSS-pixel display size → request width (2× for retina). */
const REQUEST_PX: Record<HeadshotSize, number> = {
  sm: 72,
  md: 96,
  lg: 128,
}

const DISPLAY_PX: Record<HeadshotSize, number> = {
  sm: 36,
  md: 48,
  lg: 64,
}

const pathFromEspnUrl = (url: string): string | null => {
  try {
    const u = new URL(url)
    if (!/espncdn\.com$/i.test(u.hostname) && !/\.espncdn\.com$/i.test(u.hostname)) {
      return null
    }
    // Already a combiner URL — extract img= path if present
    if (u.pathname.includes('/combiner/')) {
      const img = u.searchParams.get('img')
      return img?.startsWith('/') ? img : img ? `/${img.replace(/^\/?/, '')}` : null
    }
    return u.pathname.startsWith('/') ? u.pathname : `/${u.pathname}`
  } catch {
    return null
  }
}

/** Build a sized, crop-stable ESPN headshot URL for caching + bandwidth. */
export function optimizeHeadshotUrl(
  src: string | null | undefined,
  size: HeadshotSize = 'md'
): string | undefined {
  if (!src) return undefined
  const path = pathFromEspnUrl(src)
  if (!path) return src // non-ESPN: pass through unchanged
  const w = REQUEST_PX[size]
  // Combiner: crop to square headshot at requested size
  return `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(path)}&w=${w}&h=${w}&scale=crop&cquality=80&location=origin`
}

export function headshotDisplayPx(size: HeadshotSize): number {
  return DISPLAY_PX[size]
}
