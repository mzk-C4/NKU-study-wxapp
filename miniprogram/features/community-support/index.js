const { publicApi } = require('../../services/public-api')
const auth = require('../../utils/auth-session')
const contract = require('./contract')

function createCommunitySupport(api = publicApi, session = auth) {
  let stats = null, checkedAt = 0, fetching = null, sequence = 0, muted = false
  let latestRevision = -1, availabilityEpoch = 0
  const listeners = new Set(), notices = []
  const emit = () => listeners.forEach(fn => { try { fn() } catch (_) {} })
  function setPublic(value) {
    const next = contract.publicStats(value)
    if (next && next.revision < latestRevision) return
    if (next) latestRevision = next.revision
    else availabilityEpoch++
    stats = next; checkedAt = Date.now(); emit()
  }
  async function capability() {
    if (checkedAt && Date.now() - checkedAt < 60000) return stats
    if (!fetching) {
      const epoch = availabilityEpoch
      fetching = api.getHome().then(home => {
        if (epoch === availabilityEpoch) setPublic(home.community_support)
      }).catch(() => {
        if (epoch === availabilityEpoch) setPublic(null)
      }).finally(() => { fetching = null })
    }
    await fetching
    return stats
  }
  function enqueue(notice) {
    if (muted) { if (notice.onClose) notice.onClose(); return }
    // Bound UI queue only; these are not accounting records or an offline ledger.
    if (notices.length >= 10) { const old = notices.shift(); if (old.onClose) old.onClose() }
    notices.push({ ...notice, id: ++sequence })
    emit()
  }
  async function downloaded(resource, kind = 'resource', originalToken = session.getToken()) {
    const event = contract.downloadEvent({
      event_id: `mp_${Date.now().toString(36)}_${(++sequence).toString(36)}_${Math.random().toString(36).slice(2, 14)}`,
      kind, resource_id: String(resource.id || ''), course_id: String(resource.course_id || ''),
      attribution: originalToken ? 'account' : 'community'
    })
    let state = 'unavailable'
    try {
      const config = await capability()
      if (event && config && config.download_reporting) {
        // Compare the session captured before transfer, not the account at completion.
        const currentToken = session.getToken()
        // An expired/cleared account session must not silently turn into an anonymous write.
        if (originalToken && !currentToken) throw Object.assign(new Error('登录状态已失效'), { code: 'AUTH_REQUIRED' })
        if (currentToken !== originalToken) event.attribution = 'community'
        const epoch = availabilityEpoch
        const result = await api.recordCommunityDownload(event)
        if (result && result.event_id === event.event_id && result.recorded === true) {
          state = 'recorded'
          if (epoch === availabilityEpoch) setPublic(result.community_support)
        } else state = 'failed'
      }
    } catch (error) {
      state = 'failed'
      if (error && error.code === 'SUPPORT_UNAVAILABLE') setPublic(null)
    }
    enqueue({ kind: 'flower', title: '谢谢你，让知识流动起来',
      message: state === 'recorded' ? '下载成功，你已为社区添了一朵鲜花。' : state === 'failed' ? '资料已下载。本次支持记录暂未同步，不影响文件使用，请稍后查看统计。' : '资料已下载，感谢你的使用与分享。当前暂无可用的鲜花统计，请稍后查看。',
      action: state === 'recorded' ? '送上这朵花，继续学习' : '继续学习', state })
    return state
  }
  function reviewSubmitted(result, onClose, warning = '') {
    // The live contract records coins in moderation, not in submission receipts.
    enqueue({ kind: 'coin', title: '谢谢你，让选课多一份参考',
      message: '评价已提交，感谢你丰富我们的社区。审核通过并公开后将计入一枚硬币，可在“我的”查看贡献。' + warning,
      action: '继续探索', state: 'pending', onClose })
    checkedAt = 0
  }
  async function loadPersonal() {
    const token = session.getToken()
    if (!token) return null
    const config = await capability()
    if (session.getToken() !== token || !config || !config.personal_stats) return null
    try {
      const result = await api.getMyCommunitySupport()
      return session.getToken() === token && stats && stats.personal_stats ? contract.personalStats(result) : null
    } catch (error) {
      if (session.getToken() === token && error && error.code === 'SUPPORT_UNAVAILABLE') setPublic(null)
      return null
    }
  }
  return { setPublic, snapshot: () => stats, capability, downloaded, reviewSubmitted, loadPersonal,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    takeNotice() { return notices.shift() || null },
    finishNotice(notice) { if (notice && notice.onClose) notice.onClose() },
    mute() { muted = true; while (notices.length) { const notice = notices.shift(); if (notice.onClose) notice.onClose() } }
  }
}
module.exports = Object.assign(createCommunitySupport(), { createCommunitySupport })
