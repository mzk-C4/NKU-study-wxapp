export function validBuildingId(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : ''
}

export function entryBuildingId(href: string): string {
  return validBuildingId(new URL(href).searchParams.get('buildingId'))
}

export function selectionUrl(href: string, buildingId?: string): string {
  const url = new URL(href)
  const id = validBuildingId(buildingId)
  if (id) url.searchParams.set('buildingId', id)
  else url.searchParams.delete('buildingId')
  return url.toString()
}

export function modeUrl(href: string, mode: '2d' | '3d'): string {
  const url = new URL(href)
  if (mode === '2d') url.searchParams.set('mode', mode)
  else url.searchParams.delete('mode')
  return url.toString()
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
