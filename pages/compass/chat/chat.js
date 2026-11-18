/**
 * 指南针问答页（HXR-COMPASS · 页面呈现与接口接线）
 * 职责：
 *  - 输入 / 发送 / 等待 / 整段回答展示
 *  - 连接王绅右提供的对话控制器（CompassController）
 *  - 答案 Markdown、适用范围、时效提醒、引用来源卡片
 *  - 来源原文打开 / 打开失败提示 / 安全链接复制
 *  - 浅色·深色、大字体检查；登录过期与重试处理
 */
const compassApi = require('../../../utils/compass-api')
const { CompassController } = require('../../../utils/compass-controller')
const { parseMarkdown } = require('../../../utils/markdown')
const config = require('../../../config/index')

// 持久化适配（注入控制器，便于按账号隔离与 30 天保存）
const storage = {
  get: (k) => { try { return wx.getStorageSync(k) } catch (e) { return null } },
  set: (k, v) => { try { wx.setStorageSync(k, v) } catch (e) {} },
  remove: (k) => { try { wx.removeStorageSync(k) } catch (e) {} }
}

let uid = 0
const nextId = () => 'm' + (++uid)

Page({
  data: {
    draft: '',
    draftHint: false,        // 从搜索带入的草稿提示
    messages: [],            // 渲染消息列表
    waiting: false,          // 是否正在等待回答
    showWelcome: true,       // 欢迎态
    suggestions: config.COMPASS ? config.COMPASS.SUGGESTIONS : [],
    round: 0,
    roundLimit: config.COMPASS ? config.COMPASS.ROUND_LIMIT : 10,
    reachLimit: false,       // 已达轮次上限
    theme: 'light',          // light | dark
    largeFont: false,
    loginRequired: false,    // 需要登录
    scrollTo: ''             // 滚动锚点
  },

  onLoad(options) {
    // 1) 会话控制器初始化（注入 api / storage / account）
    const account = this._getAccount()
    this.ctrl = new CompassController({ api: compassApi, account, storage })
    this.ctrl.init()
    const st = this.ctrl.getState()
    this.setData({
      round: st.round,
      roundLimit: st.roundLimit,
      reachLimit: st.round >= st.roundLimit
    })
    // 恢复历史消息（如有）
    if (st.history && st.history.length) {
      this._rebuildFromHistory(st.history)
    }

    // 2) 主题 / 字体偏好
    const theme = storage.get('compass_theme') || 'light'
    const largeFont = storage.get('compass_large') === true
    this.setData({ theme, largeFont })

    // 3) 搜索词带入草稿（只带入，不自动发送 / 不混入旧话题）
    if (options && options.draft) {
      const draft = decodeURIComponent(options.draft)
      this.setData({ draft, draftHint: true, showWelcome: false })
    }
  },

  _getAccount() {
    try {
      const g = getApp()
      if (g && g.globalData && g.globalData.account) return g.globalData.account
    } catch (e) {}
    return null
  },

  // 依据控制器历史重建消息列表
  _rebuildFromHistory(history) {
    const messages = []
    history.forEach(m => {
      if (m.role === 'user') {
        messages.push({ id: nextId(), role: 'user', text: m.content })
      } else {
        messages.push({
          id: nextId(), role: 'ai',
          raw: m.md || m.content || '',
          nodes: parseMarkdown(m.md || m.content || ''),
          scope: m.applicable_scope || '',
          timeliness: m.timeliness || '',
          sources: m.sources || []
        })
      }
    })
    this.setData({ messages, showWelcome: false, scrollTo: 'msg-bottom' })
  },

  onInput(e) {
    this.setData({ draft: e.detail.value })
  },

  onClearDraft() {
    this.setData({ draft: '', draftHint: false })
  },

  // 发送
  async onSend() {
    const question = (this.data.draft || '').trim()
    if (!question) {
      wx.showToast({ title: '请输入问题', icon: 'none' })
      return
    }
    if (this.data.waiting) return // 防止重复点击

    // 本地先渲染用户消息 + 等待气泡
    const userMsg = { id: nextId(), role: 'user', text: question }
    const waitingMsg = { id: nextId(), role: 'ai', status: 'waiting' }
    this.setData({
      messages: [...this.data.messages, userMsg, waitingMsg],
      draft: '',
      draftHint: false,
      showWelcome: false,
      waiting: true,
      scrollTo: 'msg-bottom'
    })

    try {
      const res = await this.ctrl.send(question)
      if (res.ok) {
        const r = res.result
        const aiMsg = {
          id: nextId(), role: 'ai',
          raw: r.markdown || r.answer || '',
          nodes: parseMarkdown(r.markdown || r.answer || ''),
          scope: r.applicable_scope || '',
          timeliness: r.timeliness || '',
          sources: r.sources || []
        }
        this._replaceWaiting(aiMsg)
        this.setData({
          waiting: false,
          round: res.round,
          roundLimit: res.roundLimit,
          reachLimit: res.round >= res.roundLimit,
          scrollTo: 'msg-bottom'
        })
      } else {
        this._handleSendError(res)
      }
    } catch (err) {
      this._handleSendError({ ok: false, type: 'unknown', message: '出错了，请重试', question })
    }
  },

  _replaceWaiting(aiMsg) {
    const list = this.data.messages.slice()
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].status === 'waiting') { list[i] = aiMsg; break }
    }
    this.setData({ messages: list })
  },

  _handleSendError(res) {
    let errorMsg = res.message || '出错了，请重试'
    let errorType = res.type || 'unknown'
    if (errorType === 'round_limit') {
      errorMsg = res.message || `已达 ${this.data.roundLimit} 轮上限，请开启新话题`
    }
    if (errorType === 'need_login') {
      this.setData({ loginRequired: true })
    }
    const errMsg = {
      id: nextId(), role: 'ai', status: 'error',
      errorType, errorMsg, question: res.question || (this.data.draft || '')
    }
    this._replaceWaiting(errMsg)
    this.setData({ waiting: false, scrollTo: 'msg-bottom' })
  },

  // 重试失败的问题
  onRetry(e) {
    const q = e.currentTarget.dataset.q || ''
    if (!q) return
    this.setData({ draft: q }, () => this.onSend())
  },

  // 开启新话题
  onNewTopic() {
    this.ctrl.newTopic()
    this.setData({
      messages: [], waiting: false, showWelcome: true,
      round: 0, reachLimit: false, loginRequired: false,
      draft: '', draftHint: false, scrollTo: ''
    })
  },

  // 主题切换
  onToggleTheme() {
    const theme = this.data.theme === 'light' ? 'dark' : 'light'
    storage.set('compass_theme', theme)
    this.setData({ theme })
  },

  // 大字体切换
  onToggleFont() {
    const largeFont = !this.data.largeFont
    storage.set('compass_large', largeFont)
    this.setData({ largeFont })
  },

  // 来源卡片：打开原文
  onSourceOpen(e) {
    const source = e.detail.source
    if (!source || !source.url) {
      wx.showToast({ title: '暂无原文链接', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/compass/source/source?url=' + encodeURIComponent(source.url) + '&title=' + encodeURIComponent(source.title || '来源原文')
    })
  },

  // 来源卡片：复制安全链接
  onSourceCopy(e) {
    const source = e.detail.source
    if (!source || !source.url) {
      wx.showToast({ title: '暂无链接', icon: 'none' })
      return
    }
    this._copySafeLink(source.url)
  },

  // 答案内联链接：复制安全链接
  onLinkTap(e) {
    const url = e.detail.url
    if (url) this._copySafeLink(url)
  },

  _copySafeLink(url) {
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '安全链接已复制', icon: 'success' })
    })
  },

  // 登录提示（need_login 时）
  onLogin() {
    // 实际登录由王绅右的登录模块接管；此处仅引导并清除登录要求
    this.setData({ loginRequired: false })
    wx.showToast({ title: '请先完成微信登录', icon: 'none' })
  },

  onSuggestion(e) {
    const q = e.currentTarget.dataset.q || ''
    this.setData({ draft: q, draftHint: false }, () => this.onSend())
  }
})
