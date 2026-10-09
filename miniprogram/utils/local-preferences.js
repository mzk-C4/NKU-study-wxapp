// These conveniences stay on this device; they are not cloud course favorites.
const KEYS = Object.freeze({ search: 'nkustudy_search_history_v1', favorites: 'nkustudy_map_favorites_v1', recent: 'nkustudy_map_recent_v1' })

function cleanList(value, normalize, limit) {
  const source = Array.isArray(value) ? value.slice(0, Math.max(200, limit)) : []
  const seen = new Set()
  return source.map(normalize).filter(item => {
    if (item === null || item === '') return false
    const key = typeof item === 'string' ? item.normalize('NFKC').toLowerCase() : item
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, limit)
}
function readList(key, normalize, limit) {
  try {
    const raw = wx.getStorageSync(key)
    return raw && raw.version === 1 ? cleanList(raw.items, normalize, limit) : []
  } catch (_) { return [] }
}
function writeList(key, items) {
  try { wx.setStorageSync(key, { version: 1, items }); return true } catch (_) { return false }
}
function searchText(value) { return typeof value === 'string' ? value.trim().slice(0, 80) : '' }
function readHistory() { return readList(KEYS.search, searchText, 10) }
function recordHistory(query, previous) {
  const items = cleanList([searchText(query), ...previous], searchText, 10)
  return { items, saved: writeList(KEYS.search, items) }
}
function placeId(value) { return Number.isSafeInteger(value) && value > 0 ? value : null }
function readPlaces(kind, validIds) { return readList(KEYS[kind], value => validIds.has(value) ? placeId(value) : null, kind === 'recent' ? 12 : validIds.size) }
function savePlaces(kind, items, maximum = 200) { return writeList(KEYS[kind], cleanList(items, placeId, kind === 'recent' ? 12 : maximum)) }
module.exports = { KEYS, cleanList, readHistory, recordHistory, writeList, readPlaces, savePlaces }
