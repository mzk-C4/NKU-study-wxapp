const config = require('./config')
const ids = new Set(require('./place-ids'))
const PAGE = '/pages/campus-map-3d/index'
const NATIVE = '/pages/campus-map/index?campusId=j'

function buildingId(value) {
  return typeof value === 'string' && ids.has(value) ? value : ''
}
function webUrl(value) {
  const id = buildingId(value)
  return `${config.origin}${config.path}?embed=wechat${id ? `&buildingId=${encodeURIComponent(id)}` : ''}`
}
function pagePath(value) {
  const id = buildingId(value)
  return PAGE + (id ? `?buildingId=${encodeURIComponent(id)}` : '')
}
function nativePath(value, reopen = false) {
  const id = buildingId(value)
  return NATIVE + (reopen ? `&open3d=1${id ? `&buildingId=${encodeURIComponent(id)}` : ''}` : '')
}
// Mini-program JS does not require browser URL/URLSearchParams globals.
// A supplied reset/invalid URL must never fall back to the entry ID.
function sharedBuildingId(url, entryId) {
  if (typeof url !== 'string' || !url) return buildingId(entryId)
  const base = config.origin + config.path
  if (url !== base && !url.startsWith(base + '?') && !url.startsWith(base + '#')) return ''
  const withoutHash = url.split('#')[0]
  const query = withoutHash.includes('?') ? withoutHash.slice(withoutHash.indexOf('?') + 1) : ''
  const values = []
  try {
    for (const part of query.split('&')) {
      const split = part.indexOf('=')
      const key = decodeURIComponent(split < 0 ? part : part.slice(0, split))
      if (key === 'buildingId') values.push(decodeURIComponent(split < 0 ? '' : part.slice(split + 1)))
    }
  } catch (_) { return '' }
  return values.length === 1 ? buildingId(values[0]) : ''
}
module.exports = { buildingId, webUrl, pagePath, nativePath, sharedBuildingId }
