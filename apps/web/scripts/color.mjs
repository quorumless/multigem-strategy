// ---- color math (sRGB hex <-> OKLCH) ----
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLin = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
export const lum = (h) => { const [r, g, b] = rgb(h).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
export function toOklch(h) {
  const [r, g, b] = rgb(h).map(toLin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360]
}
export function fromOklch(L, C, H) {
  // reduce chroma until in gamut
  for (let c = C; c >= 0; c -= 0.002) {
    const a = c * Math.cos(H * Math.PI / 180), b = c * Math.sin(H * Math.PI / 180)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return '#' + lin.map((v) => Math.round(Math.min(1, Math.max(0, fromLin(Math.max(0, v)))) * 255).toString(16).padStart(2, '0')).join('')
  }
  return '#000000'
}
/** Nudge `h` lightness away from the backgrounds until it has `min` contrast on all of them. */
export function ensure(h, bgs, min) {
  let [L, C, H] = toOklch(h)
  const dir = bgs.every((b) => lum(b) > 0.4) ? -1 : 1
  while (!bgs.every((b) => contrast(h, b) >= min) && L > 0 && L < 1) { L += dir * 0.005; h = fromOklch(L, C, H) }
  return h
}

