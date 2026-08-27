/**
 * 小程序访问统计上报。
 * 端点与命名规则见 docs/mp-visit-reporting.md：
 * POST https://nkustudy.top/visit-api/hit，body {"path":"/mp/<页面名>"}。
 * 页面名只允许小写字母、数字和中括线；不上报任何用户标识。
 */
const VISIT_HIT_ENDPOINT = 'https://nkustudy.top/visit-api/hit'
const VISIT_STATS_ENDPOINT = 'https://nkustudy.top/visit-api/stats'
const PATH_PATTERN = /^\/mp\/[a-z0-9-]+$/

function requestStats(options) {
  if (typeof wx === 'undefined' || !wx || typeof wx.request !== 'function') return Promise.resolve(null)
  return new Promise(resolve => {
    wx.request({
      timeout: 8000,
      ...options,
      success(response) {
        const data = response && response.data
        const statusCode = Number(response && response.statusCode)
        const stats = data && data.stats
        if (statusCode < 200 || statusCode >= 300 || !data || data.ok !== true || !stats || !Number.isFinite(stats.total) || stats.total < 0) {
          resolve(null)
          return
        }
        const publicStats = {
          total: stats.total,
          today: Number.isFinite(stats.today) && stats.today >= 0 ? stats.today : 0,
          updatedAt: typeof stats.updatedAt === 'string' ? stats.updatedAt : '',
          startedAt: typeof stats.startedAt === 'string' ? stats.startedAt : ''
        }
        if (typeof stats.counted === 'boolean') publicStats.counted = stats.counted
        resolve(publicStats)
      },
      fail() { resolve(null) }
    })
  })
}

function reportVisit(path) {
  if (typeof path !== 'string' || !PATH_PATTERN.test(path)) return Promise.resolve(null)
  return requestStats({
    url: VISIT_HIT_ENDPOINT,
    method: 'POST',
    data: { path },
    header: { 'content-type': 'application/json' }
  })
}

function getVisitStats() {
  return requestStats({
    url: VISIT_STATS_ENDPOINT,
    method: 'GET'
  })
}

module.exports = { reportVisit, getVisitStats }
