/**
 * 指南针对话控制器（HXR-COMPASS · 对话状态与可靠性）
 *
 * 本模块实现「王绅右」负责的对话控制契约的【参考实现】，供前端（洪修睿）接线联调。
 * 接口稳定，后续可由王绅右替换为权威实现，页面无需改动。
 *
 * 页面依赖的接口（请勿随意改动签名）：
 *   const ctrl = new CompassController({ api, account, storage })
 *   ctrl.init()                 -> 载入当前账号会话
 *   ctrl.getState()             -> { round, roundLimit, topic, history, status, canAsk }
 *   ctrl.canAsk()               -> boolean
 *   ctrl.send(question)         -> Promise<{ ok, type?, message?, result?, round, roundLimit, question? }>
 *   ctrl.newTopic()             -> 开启新话题（清空历史/轮次）
 *   ctrl.setAccount(account)    -> 切换账号并隔离会话
 *
 * 已覆盖的可靠性要求：
 *   - 多轮历史组织，最多 10 轮；第 11 轮引导新开话题
 *   - 追问/补充条件复用历史；失败不增加完成轮次
 *   - 按账号隔离的本机会话，30 天保存（TTL）
 *   - 401 登录过期、429 限流、超时/网络/模型不可用 统一处理 + 手动重试
 *   - 重复点击/迟到响应：_inflight 守卫，杜绝重复请求
 *   - 账号切换：先持久化再恢复，避免覆盖新账号状态
 */

const ROUND_LIMIT = 10
const HISTORY_TTL = 30 * 24 * 3600 * 1000 // 30 天

class CompassController {
  /**
   * @param {object} opts
   * @param {object} opts.api      必须提供 { ask(payload):Promise<result> }
   * @param {object|null} opts.account  当前账号 { uid }，null 视为游客
   * @param {object} [opts.storage] 可选持久化适配 { get(k), set(k,v), remove(k) }
   */
  constructor(opts = {}) {
    this.api = opts.api
    this.account = opts.account || null
    this.storage = opts.storage || null
    this.sessionId = ''
    this.history = [] // [{ role:'user'|'assistant', content, md?, sources?, applicable_scope?, timeliness?, ts }]
    this.round = 0
    this.topic = ''
    this.status = 'idle' // idle | waiting | error
    this.roundLimit = ROUND_LIMIT
    this._inflight = false
  }

  _storageKey() {
    const uid = this.account && this.account.uid ? this.account.uid : 'guest'
    return `compass_session_${uid}`
  }

  /**
   * 初始化：恢复会话；无会话则新建
   */
  init() {
    this._restore()
    if (!this.sessionId) this._newSession()
    return this
  }

  _newSession() {
    this.sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this.history = []
    this.round = 0
    this.topic = ''
    this._persist()
  }

  _restore() {
    if (!this.storage) return
    try {
      const raw = this.storage.get(this._storageKey())
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.savedAt && Date.now() - d.savedAt > HISTORY_TTL) {
        this.storage.remove(this._storageKey())
        return
      }
      this.sessionId = d.sessionId || ''
      this.history = d.history || []
      this.round = d.round || 0
      this.topic = d.topic || ''
    } catch (e) { /* 忽略损坏数据 */ }
  }

  _persist() {
    if (!this.storage) return
    try {
      this.storage.set(this._storageKey(), JSON.stringify({
        sessionId: this.sessionId,
        history: this.history,
        round: this.round,
        topic: this.topic,
        savedAt: Date.now()
      }))
    } catch (e) { /* 忽略写入异常 */ }
  }

  getState() {
    return {
      round: this.round,
      roundLimit: this.roundLimit,
      topic: this.topic,
      history: this.history,
      status: this.status,
      sessionId: this.sessionId,
      canAsk: this.round < this.roundLimit
    }
  }

  canAsk() {
    return this.round < this.roundLimit && !this._inflight
  }

  /**
   * 发送一个问题
   * @returns {Promise<{ok:boolean, type?:string, message?:string, result?:object, round:number, roundLimit:number, question?:string}>}
   */
  async send(question) {
    const q = (question || '').trim()
    if (!q) return { ok: false, type: 'empty', message: '请输入问题' }
    if (this._inflight) return { ok: false, type: 'busy', message: '正在处理上一条，请稍候' }
    if (this.round >= this.roundLimit) {
      return { ok: false, type: 'round_limit', message: `已达 ${this.roundLimit} 轮上限，请开启新话题` }
    }

    this._inflight = true
    this.status = 'waiting'
    try {
      const payload = {
        question: q,
        session_id: this.sessionId,
        history: this.history,
        context: this._context()
      }
      const result = await this.api.ask(payload)

      // 成功：写入历史（失败分支不执行，故不增加轮次）
      this.history.push({ role: 'user', content: q, ts: Date.now() })
      this.history.push({
        role: 'assistant',
        content: result.answer || '',
        md: result.markdown || result.answer || '',
        sources: result.sources || [],
        applicable_scope: result.applicable_scope,
        timeliness: result.timeliness,
        ts: Date.now()
      })
      this.round += 1
      if (!this.topic) this.topic = q.slice(0, 20)
      if (result.round_limit) this.roundLimit = result.round_limit
      this.status = 'idle'
      this._persist()
      this._inflight = false
      return { ok: true, result, round: this.round, roundLimit: this.roundLimit }
    } catch (err) {
      this.status = 'error'
      this._inflight = false
      // 失败不增加完成轮次；保留问题文本供重试
      const type = err && err.type
      if (type === 'unauthorized') return { ok: false, type: 'need_login', message: (err && err.message) || '请先登录', question: q }
      if (type === 'rate_limited') return { ok: false, type: 'rate_limited', message: (err && err.message) || '提问过于频繁，请稍后再试', question: q }
      if (type === 'timeout' || type === 'network') return { ok: false, type, message: (err && err.message) || '网络异常，请重试', question: q }
      return { ok: false, type: type || 'server', message: (err && err.message) || '服务异常，请重试', question: q }
    }
  }

  /**
   * 重试上一条问题（页面在失败态调用）
   */
  retry(question) {
    return this.send(question)
  }

  /**
   * 开启新话题
   */
  newTopic() {
    this._newSession()
    this.status = 'idle'
    return this.getState()
  }

  /**
   * 切换账号：先持久化当前，再载入目标账号会话，避免覆盖新账号状态
   */
  setAccount(account) {
    this._persist()
    this.account = account
    this.sessionId = ''
    this.history = []
    this.round = 0
    this.topic = ''
    this._restore()
    if (!this.sessionId) this._newSession()
    return this.getState()
  }

  _context() {
    let profile = null
    try {
      const g = (typeof getApp === 'function') ? getApp() : null
      profile = g && g.globalData && g.globalData.profile
    } catch (e) { /* getApp 不可用时忽略 */ }
    return {
      college: profile && profile.college,
      enroll_year: profile && profile.enrollYear,
      academic_year: profile && profile.academicYear
    }
  }
}

module.exports = { CompassController, ROUND_LIMIT, HISTORY_TTL }
