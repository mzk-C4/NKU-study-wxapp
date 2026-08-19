/**
 * 小程序访问统计上报。
 * 端点与命名规则见 docs/mp-visit-reporting.md：
 * POST https://nkustudy.top/visit-api/hit，body {"path":"/mp/<页面名>"}。
 * 页面名只允许小写字母、数字和中括线；不上报任何用户标识。
 */
const VISIT_ENDPOINT = 'https://nkustudy.top/visit-api/hit'
const PATH_PATTERN = /^\/mp\/[a-z0-9-]+$/

function reportVisit(path) {
  if (typeof path !== 'string' || !PATH_PATTERN.test(path)) return
  if (typeof wx === 'undefined' || !wx || typeof wx.request !== 'function') return
  wx.request({
    url: VISIT_ENDPOINT,
    method: 'POST',
    data: { path },
    header: { 'content-type': 'application/json' },
    fail() { /* 统计失败不影响页面，静默丢弃 */ }
  })
}

module.exports = { reportVisit }