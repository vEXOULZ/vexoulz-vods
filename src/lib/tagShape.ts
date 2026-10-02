// A drawn tag's SVG (TagMark), in its own colors except one: the parts drawn in `currentColor` take the tag's color,
// or, in an SVG that never uses currentColor, the black parts (explicit, or the default fill) do. It's shown as an
// <img> from a data: URL, so nothing in the file can run, and only the parts meant to follow the tag change color.

const PAINT = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color']
const BLACK = /^(#000|#000f|#000000|#000000ff|black|rgba?\(\s*0[\s,]+0[\s,]+0\s*(?:[,/]\s*(?:1|100%)\s*)?\))$/i
const BLACK_IN_CSS = /((?:^|[;{\s])(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*)(#000000ff|#000000|#000f|#000|black|rgba?\(\s*0[\s,]+0[\s,]+0\s*(?:[,/]\s*(?:1|100%)\s*)?\))(?=\s*(?:;|}|!|$))/gi

/** The SVG with its tag-colored parts in `color` (a resolved CSS color; var() doesn't reach inside an <img>). */
export function tintSvg(svg: string, color: string): string | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null
  if (!/currentcolor/i.test(svg)) {
    for (const el of [root, ...Array.from(root.getElementsByTagName('*'))]) {
      for (const a of PAINT) {
        const v = el.getAttribute(a)
        if (v && BLACK.test(v.trim())) el.setAttribute(a, 'currentColor')
      }
      const style = el.getAttribute('style')
      if (style) el.setAttribute('style', style.replace(BLACK_IN_CSS, '$1currentColor'))
      if (el.localName === 'style' && el.textContent) el.textContent = el.textContent.replace(BLACK_IN_CSS, '$1currentColor')
    }
    // Shapes with no fill of their own are black by default: they follow the tag too.
    if (!root.hasAttribute('fill')) root.setAttribute('fill', 'currentColor')
  }
  root.setAttribute('color', color)
  // Scale to the tag's box: a viewBox from the file's own size, if it only has width and height.
  const w = parseFloat(root.getAttribute('width') ?? '')
  const h = parseFloat(root.getAttribute('height') ?? '')
  if (!root.hasAttribute('viewBox') && w > 0 && h > 0) root.setAttribute('viewBox', `0 0 ${w} ${h}`)
  root.removeAttribute('width')
  root.removeAttribute('height')
  return new XMLSerializer().serializeToString(doc)
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

const files = new Map<string, Promise<string | null>>()
/** The SVG's text, fetched once per URL (shape URLs are versioned); null if it can't be had. */
export function shapeText(url: string, fetcher: typeof fetch = (...a) => fetch(...a)): Promise<string | null> {
  let p = files.get(url)
  if (!p) {
    p = fetcher(url)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
    p.then((t) => t === null && files.delete(url))
    files.set(url, p)
  }
  return p
}
