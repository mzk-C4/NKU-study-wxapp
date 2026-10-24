// Live v1 contract. Missing/invalid data is unavailable, never a fake zero.
function counts(raw) {
  if (!raw || !Number.isSafeInteger(raw.flowers) || raw.flowers < 0 || !Number.isSafeInteger(raw.coins) || raw.coins < 0) return null
  return { flowers: raw.flowers, coins: raw.coins }
}
function publicStats(raw) {
  const value = counts(raw)
  if (!value || raw.version !== 1 || raw.enabled !== true || raw.review_rule !== 'approved' || !Number.isSafeInteger(raw.revision) || raw.revision < 0) return null
  return { ...value, revision: raw.revision, version: 1, enabled: true, review_rule: 'approved', download_reporting: raw.download_reporting === true, personal_stats: raw.personal_stats === true }
}
function personalStats(raw) {
  const value = counts(raw)
  if (!value) return null
  const completed = Math.floor(Math.min(value.flowers, value.coins) / 10)
  const target = (completed + 1) * 10
  return { ...value, level: completed + 1, target,
    flowersNeeded: Math.max(0, target - value.flowers), coinsNeeded: Math.max(0, target - value.coins),
    flowerProgress: Math.min(10, value.flowers - completed * 10) * 10,
    coinProgress: Math.min(10, value.coins - completed * 10) * 10 }
}
function countLabel(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '—'
  if (value >= 100000000) return (value / 100000000).toFixed(1).replace(/\.0$/, '') + '亿'
  if (value >= 10000) return (value / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return String(value)
}
function downloadEvent(raw) {
  const text = value => typeof value === 'string' && value.length <= 200 && !/[\x00-\x1f]/.test(value) ? value.trim() : ''
  if (!raw || !/^[a-zA-Z0-9_-]{16,96}$/.test(raw.event_id || '')) return null
  if (!['resource', 'guide_source'].includes(raw.kind) || !text(raw.resource_id)) return null
  if (raw.kind === 'resource' && !text(raw.course_id)) return null
  if (raw.kind === 'guide_source' && text(raw.course_id)) return null
  return { event_id: raw.event_id, kind: raw.kind, resource_id: text(raw.resource_id), course_id: text(raw.course_id), attribution: raw.attribution === 'account' ? 'account' : 'community' }
}
module.exports = { counts, publicStats, personalStats, countLabel, downloadEvent }
