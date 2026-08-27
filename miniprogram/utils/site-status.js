const DAY_MS = 24 * 60 * 60 * 1000
// 兼容网站 startedAt 字段上线前的旧响应；字段上线后始终以服务端配置为准。
const VERIFIED_STARTED_AT = '2026-07-14T16:00:00+08:00'

function formatVisitCount(value) {
  return String(Math.floor(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatRuntime(startedAt, nowMs) {
  const startedMs = new Date(String(startedAt || '')).getTime()
  if (!Number.isFinite(startedMs) || !Number.isFinite(nowMs) || startedMs > nowMs) return ''
  const totalDays = Math.floor((nowMs - startedMs) / DAY_MS)
  if (totalDays < 1) return '不足1天'
  if (totalDays < 365) return `${totalDays}天`
  const years = Math.floor(totalDays / 365)
  const days = totalDays % 365
  return days ? `${years}年${days}天` : `${years}年`
}

function buildSiteStatus(stats, nowMs = Date.now()) {
  if (!stats || typeof stats !== 'object') return null
  const total = Number(stats.total)
  if (!Number.isFinite(total) || total < 0) return null
  const runtimeValue = formatRuntime(stats.startedAt || VERIFIED_STARTED_AT, nowMs)
  if (!runtimeValue) return null
  return {
    runtimeValue,
    visitValue: formatVisitCount(total)
  }
}

module.exports = { buildSiteStatus, formatRuntime, formatVisitCount }
