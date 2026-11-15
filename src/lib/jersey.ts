/** Format a jersey for display. "0" / "00" are treated as missing placeholders. */
export function formatJersey(jersey?: string | number): string {
  if (jersey == null) return ''
  const n = String(jersey).trim()
  if (!n || n === '0' || n === '00') return ''
  return ` · #${n}`
}
