const auth = require('./auth-session')
const TTL = 7 * 24 * 60 * 60 * 1000
const FIELDS = Object.freeze({ review: { teacher: 100, body: 800 }, feedback: { title: 120, content: 2000, contact: 120, reportUrl: 300, reportTarget: 120 } })
const TYPES = ['bug', 'feature', 'content', 'report', 'complaint']
function owner(allowGuest) {
  const session = auth.readSession()
  return session && session.user.id > 0 ? `user_${session.user.id}` : (allowGuest ? 'guest' : '')
}
function key(account) { return `nkustudy_form_drafts_v1_${account}` }
function fields(kind, value = {}) {
  value = value && typeof value === 'object' ? value : {}
  const result = {}
  for (const [name, limit] of Object.entries(FIELDS[kind])) result[name] = typeof value[name] === 'string' ? value[name].slice(0, limit) : ''
  if (kind === 'review') result.rating = Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5 ? value.rating : 0
  else result.type = TYPES.includes(value.type) ? value.type : 'bug'
  return result
}
function meaningful(kind, value) { return Object.keys(FIELDS[kind]).some(name => value[name].trim()) || (kind === 'review' && value.rating > 0) }
function read(account, now = Date.now()) {
  try {
    const raw = wx.getStorageSync(key(account))
    if (!raw || raw.version !== 1 || !Array.isArray(raw.entries)) return []
    const seen = new Set()
    return raw.entries.slice(0, 40).filter(entry => {
      if (!entry || !Object.prototype.hasOwnProperty.call(FIELDS, entry.kind) || typeof entry.context !== 'string' || !entry.context || entry.context.length > 2200 || !Number.isSafeInteger(entry.updatedAt) || entry.updatedAt > now || now - entry.updatedAt >= TTL) return false
      const id = `${entry.kind}:${entry.context}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }).map(entry => ({ kind: entry.kind, context: entry.context, updatedAt: entry.updatedAt, fields: fields(entry.kind, entry.fields) })).slice(0, 20)
  } catch (_) { return [] }
}
function write(account, entries) { try { wx.setStorageSync(key(account), { version: 1, entries: entries.slice(0, 20) }); return true } catch (_) { return false } }

// Capture the account and form context, never a bearer token. A late save must
// not put the previous account's content into the newly logged-in account.
function createFormDraft(page, { kind, context, allowGuest = false }) {
  const account = owner(allowGuest)
  let timer = null
  let submitted = false
  const stop = () => { if (timer) clearTimeout(timer); timer = null }
  const matches = entry => entry.kind === kind && entry.context === context
  const controller = {
    account, context, stop,
    restore() {
      const entry = account && read(account).find(matches)
      page.setData({ ...(entry ? entry.fields : {}), hasDraft: Boolean(entry), draftNotice: entry ? '已恢复本机草稿 · 保存 7 天' : '草稿仅存本机，保留 7 天，不自动提交。' })
    },
    flush() {
      stop()
      if (!account || !context || submitted) return
      const value = fields(kind, page.data)
      const entries = read(account).filter(entry => !matches(entry))
      const hasDraft = Boolean(meaningful(kind, value))
      if (hasDraft) entries.unshift({ kind, context, updatedAt: Date.now(), fields: value })
      const saved = write(account, entries)
      page.setData({ hasDraft, draftNotice: saved ? (hasDraft ? '已保存本机草稿 · 保存 7 天' : '草稿仅存本机，保留 7 天，不自动提交。') : '草稿保存失败，请勿退出；可继续填写或提交。' })
      return saved
    },
    changed() {
      submitted = false
      stop()
      page.setData({ hasDraft: true, draftNotice: '正在保存本机草稿…' })
      timer = setTimeout(() => controller.flush(), 350)
    },
    clear() {
      stop()
      const saved = !account || write(account, read(account).filter(entry => !matches(entry)))
      if (saved) submitted = true
      return saved
    },
    submitted() {
      const saved = controller.clear()
      // Never recreate an accepted submission on unload, even on quota errors.
      submitted = true
      return saved
    }
  }
  return controller
}
module.exports = { TTL, FIELDS, owner, key, fields, read, createFormDraft }
