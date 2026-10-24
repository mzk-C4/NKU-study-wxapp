const navigation = require('../../utils/navigation')
const { registerPage: registerThemedPage } = require('../../utils/theme')
const conversationStorage = require('../../features/guide-assistant/storage')
const settings = require('../../features/guide-assistant/settings')
const learningProfile = require('../../utils/learning-profile')
const assistantRuntime = require('../../features/guide-assistant/runtime')
const {
  MAX_ROUNDS,
  normalizeCompletedMessages,
  completedRounds,
  lastCompletedExchange
} = require('../../features/guide-assistant/controller')
const { createSourceOpener } = require('../../utils/source-opener')
const { parseMarkdown, validHttpsUrl } = require('../../utils/markdown')

const MAX_QUESTION_LENGTH = 1000
const MAX_HISTORY_TITLE_LENGTH = 50
const LOCAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const ANSWER_PREVIEW_QUESTION = '我对一门课程的成绩有异议，应该怎么申请复核？'
const REFUSAL_PREVIEW_QUESTION = '宿舍晚上几点断电？'
const NEW_TOPIC_EXAMPLES = Object.freeze([
  '对课程成绩有异议，如何申请复核？',
  '休学期满后如何申请复学？',
  '本科课程作业中如何规范使用 AI 工具？'
])
const GENERATING_DOTS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const ANSWER_CLIPBOARD_TEXT = [
  '你可以在下一学期开学3周内，向开课单位提出书面申请。开课单位受理后会组织人员复议，并给出复议意见；超过时限，开课单位可以不予受理。',
  '如果复议后确需更改成绩，任课教师不能直接修改。应由任课教师填写成绩更改申请，经开课单位审批、系统提交并由教务部批准后完成更改。',
  '来源：《南开大学本科课程考试与成绩管理规定》（教字〔2024〕2号）第十四条、第十五条。'
].join('\n\n')

function boundedQuestion(value) {
  return String(value == null ? '' : value).trim().slice(0, MAX_QUESTION_LENGTH)
}

function boundedHistoryTitle(value) {
  return String(value == null ? '' : value).trim().slice(0, MAX_HISTORY_TITLE_LENGTH)
}

function decodeQuestion(value) {
  const source = String(value == null ? '' : value)
  try {
    return boundedQuestion(decodeURIComponent(source))
  } catch (_) {
    return boundedQuestion(source)
  }
}

function normalizeHistory(value, now = Date.now()) {
  if (!Array.isArray(value)) return []
  return value.map(item => {
    const messages = normalizeCompletedMessages(item && item.messages)
    const exchange = lastCompletedExchange(messages)
    const question = boundedQuestion(item && item.question) || boundedQuestion(exchange && exchange.question)
    const latestQuestion = boundedQuestion(item && item.latestQuestion) || boundedQuestion(exchange ? exchange.question : question)
    const state = ['answer', 'refusal', 'network-error'].includes(item && item.state)
      ? item.state
      : (exchange && exchange.response.refused ? 'refusal' : exchange ? 'answer' : 'network-error')
    return {
      question,
      latestQuestion,
      title: boundedHistoryTitle(item && item.title) || boundedHistoryTitle(question),
      state,
      updatedAt: Number(item && item.updatedAt) || now,
      pinned: Boolean(item && item.pinned),
      messages,
      rounds: completedRounds(messages),
      readOnly: Boolean(question && !messages.length)
    }
  }).filter(item => (
    item.question &&
    item.updatedAt <= now &&
    now - item.updatedAt <= LOCAL_RETENTION_MS
  )).sort((left, right) => right.updatedAt - left.updatedAt)
}

function addHistoryEntry(history, question, state, details = {}) {
  const normalizedQuestion = boundedQuestion(question)
  if (!normalizedQuestion) return normalizeHistory(history)
  const normalizedHistory = normalizeHistory(history)
  const previous = normalizedHistory.find(item => item.question === normalizedQuestion)
  const messages = normalizeCompletedMessages(details.messages || (previous && previous.messages))
  return [
    {
      question: normalizedQuestion,
      latestQuestion: boundedQuestion(details.latestQuestion) || boundedQuestion(lastCompletedExchange(messages)?.question) || normalizedQuestion,
      title: previous ? previous.title : boundedHistoryTitle(normalizedQuestion),
      state: ['answer', 'refusal'].includes(state) ? state : 'network-error',
      updatedAt: Date.now(),
      pinned: Boolean(previous && previous.pinned),
      messages,
      rounds: completedRounds(messages),
      readOnly: Boolean(normalizedQuestion && !messages.length)
    },
    ...normalizedHistory.filter(item => item.question !== normalizedQuestion)
  ]
}

function startOfLocalDay(timestamp) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function buildHistoryGroups(history, search = '', now = Date.now()) {
  const query = boundedQuestion(search).toLocaleLowerCase()
  const today = startOfLocalDay(now)
  const definitions = [
    { key: 'pinned', label: '置顶', matches: item => item.pinned },
    { key: 'today', label: '今天', matches: item => !item.pinned && item.updatedAt >= today },
    { key: 'yesterday', label: '昨天', matches: item => !item.pinned && item.updatedAt >= today - DAY_MS && item.updatedAt < today },
    { key: 'seven-days', label: '7天内', matches: item => !item.pinned && item.updatedAt >= today - 7 * DAY_MS && item.updatedAt < today - DAY_MS },
    { key: 'thirty-days', label: '30天内', matches: item => !item.pinned && item.updatedAt < today - 7 * DAY_MS }
  ]
  const filtered = normalizeHistory(history, now).filter(item => (
    !query ||
    item.title.toLocaleLowerCase().includes(query) ||
    item.question.toLocaleLowerCase().includes(query)
  ))
  return definitions.map(group => ({
    key: group.key,
    label: group.label,
    items: filtered.filter(group.matches).map(item => ({
      ...item,
      pinAriaLabel: item.pinned ? `取消置顶：${item.title}` : `置顶：${item.title}`
    }))
  })).filter(group => group.items.length)
}

function getStatusBarHeight() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (Number.isFinite(Number(info.statusBarHeight))) return Number(info.statusBarHeight)
    }
    if (typeof wx.getSystemInfoSync === 'function') {
      const info = wx.getSystemInfoSync()
      if (Number.isFinite(Number(info.statusBarHeight))) return Number(info.statusBarHeight)
    }
  } catch (_) {
    // 使用稳定默认值；布局不会因系统信息读取失败而阻塞。
  }
  return 20
}

function readLocalState(account) {
  try {
    if (typeof wx.getStorageSync !== 'function') return null
    const value = conversationStorage.read(account)
    if (!value || typeof value !== 'object') return null
    const updatedAt = Number(value.updatedAt)
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > LOCAL_RETENTION_MS) return null
    return {
      lastQuestion: boundedQuestion(value.lastQuestion),
      draft: boundedQuestion(value.draft),
      history: normalizeHistory(value.history)
    }
  } catch (_) {
    return null
  }
}

function saveLocalState(account, lastQuestion, draft, history = []) {
  try {
    if (typeof wx.setStorageSync !== 'function') return
    conversationStorage.save(account, {
      lastQuestion: boundedQuestion(lastQuestion),
      draft: boundedQuestion(draft),
      history: normalizeHistory(history),
      updatedAt: Date.now()
    })
  } catch (_) {
    // 本机保存失败不影响断网恢复入口。
  }
}

function getNetworkType() {
  return new Promise(resolve => {
    if (typeof wx.getNetworkType !== 'function') {
      resolve('unknown')
      return
    }
    wx.getNetworkType({
      success(result) {
        resolve(String(result && result.networkType || 'unknown'))
      },
      fail() {
        resolve('unknown')
      }
    })
  })
}

function hasConnection(networkType) {
  return Boolean(networkType && networkType !== 'none' && networkType !== 'unknown')
}

const definition = {
  data: {
    statusBarHeight: 20,
    lastQuestion: '',
    activeConversationQuestion: '',
    draft: '',
    canSend: false,
    focusInput: false,
    editingQuestion: false,
    editingQuestionValue: '',
    canSendEditedQuestion: false,
    focusQuestionEditor: false,
    previewMode: false,
    previewState: '',
    answerMode: false,
    requestPending: false,
    assistantState: 'idle',
    messages: [],
    previousTurns: [],
    completedRoundCount: 0,
    roundLabel: '0/10',
    roundLimitReached: false,
    inputError: '',
    statusMessage: '',
    responseAnswer: '',
    responseBlocks: parseMarkdown(''),
    responseScope: '',
    responseFreshness: '',
    responseReason: '',
    responseCitations: [],
    recoveryTitle: '',
    recoveryCopy: '',
    authRecovering: false,
    mockMode: false,
    showRecoveryActions: false,
    learningProfileLabel: learningProfile.formatLabel(learningProfile.emptyProfile()),
    exampleQuestions: NEW_TOPIC_EXAMPLES,
    followUpQuestions: ['请列出具体步骤和需要准备的材料', '哪些要求会因年级、专业不同而变化？', '哪些信息确定，哪些还需要向学校确认？'],
    generatingDots: GENERATING_DOTS,
    newTopicMode: false,
    history: [],
    historyDrawerOpen: false,
    historySearch: '',
    historyGroups: [],
    historyActionQuestion: '',
    historyRenameMode: false,
    historyRenameValue: '',
    canSaveHistoryRename: false,
    focusHistoryRename: false,
    answerFeedback: '',
    networkError: false,
    networkConnected: true,
    retrying: false,
    networkHint: '请检查网络或重试'
  },

  async onLoad(options = {}) {
    this._isUnloaded = false
    this._recoveryOwner = ''
    this._conversationOwner = conversationStorage.owner()
    this._assistantController = assistantRuntime.createController()
    this._sourceOpener = createSourceOpener()
    this._networkListener = this.handleNetworkChange.bind(this)
    const stored = readLocalState(this._conversationOwner) || {}
    const currentLearningProfile = learningProfile.read()
    const optionQuestion = decodeQuestion(options.question)
    const requestedPreview = String(options.preview || '')
    const previewState = settings.environment() === 'develop' && ['answer', 'network-error', 'new-topic', 'generating', 'refusal'].includes(requestedPreview)
      ? requestedPreview
      : ''
    const previewMode = Boolean(previewState)
    const storedConversation = !optionQuestion && normalizeHistory(stored.history).find(item => (
      item.question === boundedQuestion(stored.lastQuestion) ||
      item.latestQuestion === boundedQuestion(stored.lastQuestion)
    ))
    const storedMessages = storedConversation ? storedConversation.messages : []
    const storedExchange = lastCompletedExchange(storedMessages)
    const answerMode = previewState === 'answer' || (!previewMode && storedConversation && storedConversation.state === 'answer')
    const restoredState = !previewMode && storedConversation ? storedConversation.state : ''
    const visualQuestion = previewState === 'generating'
      ? optionQuestion || ANSWER_PREVIEW_QUESTION
      : previewState === 'refusal'
        ? optionQuestion || REFUSAL_PREVIEW_QUESTION
        : ''
    const lastQuestion = previewState === 'new-topic' || (optionQuestion && !previewMode)
      ? ''
      : optionQuestion || visualQuestion || (previewState === 'answer' ? ANSWER_PREVIEW_QUESTION : storedExchange ? storedExchange.question : stored.lastQuestion || '')
    const draft = optionQuestion && !previewMode ? optionQuestion : previewMode ? '' : stored.draft || ''
    const history = ['answer', 'network-error'].includes(previewState) && lastQuestion
      ? addHistoryEntry(stored.history, lastQuestion, previewState)
      : normalizeHistory(stored.history)
    const restoredResponse = !previewMode && storedExchange ? storedExchange.response : null
    const completedRoundCount = ['answer', 'refusal'].includes(previewState) ? 1 : completedRounds(storedMessages)
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      mockMode: assistantRuntime.isMock(),
      lastQuestion,
      activeConversationQuestion: storedConversation ? storedConversation.question : lastQuestion,
      draft,
      previewMode,
      previewState: previewState || restoredState,
      answerMode,
      assistantState: previewState || (storedConversation ? storedConversation.state : 'idle'),
      messages: storedMessages,
      previousTurns: this.presentPreviousTurns(storedMessages),
      completedRoundCount,
      roundLabel: `${completedRoundCount}/${MAX_ROUNDS}`,
      roundLimitReached: completedRoundCount >= MAX_ROUNDS,
      responseAnswer: restoredResponse ? restoredResponse.content : '',
      responseBlocks: parseMarkdown(restoredResponse ? restoredResponse.content : ''),
      responseScope: restoredResponse ? restoredResponse.applicable_scope : '',
      responseFreshness: restoredResponse ? restoredResponse.freshness_notice : '',
      responseReason: restoredResponse ? restoredResponse.reason : '',
      responseCitations: restoredResponse ? this.presentCitations(restoredResponse.citations) : [],
      learningProfileLabel: learningProfile.formatLabel(currentLearningProfile),
      newTopicMode: previewState === 'new-topic' || (!previewState && !lastQuestion),
      history,
      canSend: Boolean(boundedQuestion(draft))
    })
    this.saveConversationState(lastQuestion, draft, history)
    if (typeof wx.onNetworkStatusChange === 'function') wx.onNetworkStatusChange(this._networkListener)
    if (answerMode) {
      this.setData({
        networkConnected: true,
        networkError: false,
        retrying: false,
        networkHint: ''
      })
      return
    }
    if (previewState === 'network-error') {
      this.setData({
        networkConnected: false,
        networkError: true,
        retrying: false,
        networkHint: '请检查网络或重试'
      })
      return
    }
    if (['new-topic', 'generating', 'refusal'].includes(this.data.previewState)) {
      this.setData({
        networkConnected: true,
        networkError: false,
        retrying: false,
        networkHint: ''
      })
      return
    }
    await this.refreshNetworkState()
  },

  onShow() {
    if (this._isUnloaded) return
    this.syncConversationOwner()
    const learningProfileLabel = learningProfile.formatLabel(learningProfile.read())
    if (learningProfileLabel !== this.data.learningProfileLabel) this.setData({ learningProfileLabel })
  },

  onUnload() {
    this._isUnloaded = true
    if (this._assistantController) this._assistantController.cancel()
    this.saveConversationState(this.data.lastQuestion, this.data.draft, this.data.history)
    if (this._networkListener && typeof wx.offNetworkStatusChange === 'function') {
      wx.offNetworkStatusChange(this._networkListener)
    }
  },

  handleNetworkChange(result = {}) {
    if (this._isUnloaded) return
    const connected = result.isConnected === true || hasConnection(result.networkType)
    if (!connected) {
      this.setData({
        networkConnected: false,
        networkError: true,
        retrying: false,
        networkHint: '请检查网络或重试'
      })
      return
    }
    this.setData({
      networkConnected: true,
      networkHint: this.data.networkError ? '网络已恢复，可以重新尝试' : ''
    })
  },

  async refreshNetworkState() {
    const networkType = await getNetworkType()
    if (this._isUnloaded) return false
    const connected = hasConnection(networkType)
    this.setData({
      networkConnected: connected,
      networkError: !connected,
      retrying: false,
      networkHint: connected ? '' : '请检查网络或重试'
    })
    return connected
  },

  inputQuestion(event) {
    if (this._isUnloaded || this.data.requestPending || this.data.roundLimitReached || this.data.previewState === 'generating' || (this.data.previewMode && this.data.previewState === 'refusal')) return
    const draft = String(event && event.detail ? event.detail.value : '').slice(0, MAX_QUESTION_LENGTH)
    this.setData({ draft, canSend: Boolean(boundedQuestion(draft)), inputError: '' })
    this.saveConversationState(this.data.lastQuestion, draft, this.data.history)
  },

  chooseExampleQuestion(event) {
    if (this._isUnloaded || this.data.requestPending || this.data.roundLimitReached || this.data.previewState === 'generating') return
    const draft = boundedQuestion(event && event.currentTarget && event.currentTarget.dataset.question)
    if (!draft) return
    this.setData({ draft, canSend: true, focusInput: true })
    this.saveConversationState(this.data.lastQuestion, draft, this.data.history)
  },

  focusComposer() {
    if (this._isUnloaded || this.data.focusInput) return
    this.setData({ focusInput: true })
  },

  blurComposer() {
    if (this._isUnloaded || !this.data.focusInput) return
    this.setData({ focusInput: false })
  },

  async sendQuestion() {
    if (this.syncConversationOwner()) return false
    if (this._isUnloaded || this._checkingNetwork || this.data.requestPending || this.data.roundLimitReached || this.data.assistantState === 'rate-limited') return false
    if (this.data.previewState === 'generating' && !this.data.previewMode) return false
    const question = boundedQuestion(this.data.draft)
    if (!question) {
      this.setData({ inputError: '请输入问题后再发送。' })
      return false
    }
    if (this.data.previewMode && this.data.newTopicMode && !this.data.networkError) {
      this.setData({
        lastQuestion: question,
        draft: '',
        canSend: false,
        focusInput: false,
        previewMode: true,
        previewState: 'generating',
        answerMode: false,
        newTopicMode: false,
        networkConnected: true,
        networkError: false,
        networkHint: ''
      })
      this.saveConversationState(question, '', this.data.history)
      return true
    }
    if (this.data.previewMode) {
      wx.showToast({ title: '当前为视觉预览，不能发送', icon: 'none' })
      return false
    }
    if (this.data.statusMessage) this.setData({ statusMessage: '' })
    this._checkingNetwork = true
    const currentController = this._assistantController
    let networkType
    try { networkType = assistantRuntime.isMock() ? 'mock' : await getNetworkType() } finally {
      if (currentController === this._assistantController) this._checkingNetwork = false
    }
    if (this._isUnloaded || this.syncConversationOwner() || currentController !== this._assistantController) return false
    const connected = hasConnection(networkType)
    if (!connected) {
      const conversationQuestion = this.data.activeConversationQuestion || question
      const history = addHistoryEntry(this.data.history, conversationQuestion, 'network-error', {
        messages: this.data.messages,
        latestQuestion: question
      })
      this.setData({
        lastQuestion: question,
        activeConversationQuestion: conversationQuestion,
        draft: '',
        canSend: false,
        focusInput: false,
        networkConnected: false,
        networkError: true,
        retrying: false,
        answerMode: false,
        assistantState: 'network-error',
        previewState: '',
        newTopicMode: false,
        history,
        showRecoveryActions: true,
        networkHint: '请检查网络或重试'
      })
      this.saveConversationState(question, '', history)
      return true
    }

    this.setData({
      lastQuestion: question,
      activeConversationQuestion: this.data.activeConversationQuestion || question,
      requestPending: true,
      previewMode: false,
      previewState: 'generating',
      assistantState: 'generating',
      answerMode: false,
      responseAnswer: '',
      responseBlocks: parseMarkdown(''),
      responseScope: '',
      responseFreshness: '',
      responseReason: '',
      responseCitations: [],
      newTopicMode: false,
      networkError: false,
      networkConnected: true,
      showRecoveryActions: false,
      recoveryTitle: '',
      recoveryCopy: '',
      statusMessage: '',
      inputError: '',
      canSend: false,
      previousTurns: this.presentPreviousTurns(this.data.messages, true)
    })
    if (!this._assistantController) this._assistantController = assistantRuntime.createController()
    const submittingController = this._assistantController
    const result = await submittingController.submit({
      question,
      messages: this.data.messages,
      profile: learningProfile.read()
    })
    if (this._isUnloaded || submittingController !== this._assistantController || !result) return false
    if (conversationStorage.owner() !== this._conversationOwner) {
      const loggedOut = !conversationStorage.owner()
      const previousOwner = this._conversationOwner
      this.syncConversationOwner(loggedOut ? question : '')
      if (loggedOut) {
        this._recoveryOwner = previousOwner
        this.applyAssistantFailure('auth-required', question)
      }
      return false
    }
    if (result.stale) {
      this.setData({ requestPending: false, previewState: '', assistantState: 'idle', canSend: Boolean(this.data.draft) })
      return false
    }
    this.setData({ requestPending: false })
    if (result.accepted && (result.state === 'answer' || result.state === 'refusal')) {
      const response = result.response || {}
      const messages = normalizeCompletedMessages(result.messages)
      const rounds = completedRounds(messages)
      const conversationQuestion = this.data.activeConversationQuestion || question
      const history = addHistoryEntry(this.data.history, conversationQuestion, result.state, { messages, latestQuestion: question })
      this.setData({
        previewState: result.state,
        assistantState: result.state,
        answerMode: result.state === 'answer',
        draft: '',
        canSend: false,
        messages,
        completedRoundCount: rounds,
        roundLabel: `${rounds}/${MAX_ROUNDS}`,
        roundLimitReached: rounds >= MAX_ROUNDS,
        responseAnswer: response.answer || '',
        responseBlocks: parseMarkdown(response.answer || ''),
        responseScope: response.applicable_scope || '',
        responseFreshness: response.freshness_notice || '',
        responseReason: response.reason || '',
        responseCitations: this.presentCitations(response.citations),
        previousTurns: this.presentPreviousTurns(messages),
        history,
        activeConversationQuestion: conversationQuestion,
        showRecoveryActions: result.state === 'refusal'
      })
      this.saveConversationState(question, '', history)
      return true
    }

    return this.applyAssistantFailure(result.state, question, result.error)
  },

  presentMarkdown(value) { return parseMarkdown(value) },

  openMarkdownLink(event) {
    const href = validHttpsUrl(event && event.currentTarget && event.currentTarget.dataset.href)
    if (!href || typeof wx.setClipboardData !== 'function') return
    wx.setClipboardData({ data: href, success: () => wx.showToast({ title: '安全链接已复制', icon: 'none' }) })
  },

  presentCitations(citations) {
    return (Array.isArray(citations) ? citations : []).map((source, index) => ({
      ...source,
      sourceLabel: `来源${index + 1}`,
      metaLabel: [source.document_no, source.publisher].filter(Boolean).join(' · '),
      opening: false,
      openFailed: false,
      canCopy: Boolean(source.official_page_url || source.file_url)
    }))
  },

  presentPreviousTurns(messages, includeLatest = false) {
    const normalized = normalizeCompletedMessages(messages)
    const turns = []
    const limit = includeLatest ? normalized.length : Math.max(0, normalized.length - 2)
    for (let index = 0; index + 1 < limit; index += 2) {
      const response = normalized[index + 1]
      turns.push({
        key: `turn-${index / 2 + 1}`,
        question: normalized[index].content,
        answer: response.content,
        blocks: parseMarkdown(response.content || ''),
        refused: response.refused,
        scope: response.applicable_scope
      })
    }
    return turns
  },

  applyAssistantFailure(state, question, error) {
    const safeQuestion = boundedQuestion(question)
    this.setData({
      responseAnswer: '',
      responseBlocks: parseMarkdown(''),
      responseScope: '',
      responseFreshness: '',
      responseReason: '',
      responseCitations: []
    })
    if (state === 'invalid-question') {
      this.setData({
        previewState: '',
        assistantState: state,
        lastQuestion: safeQuestion,
        draft: safeQuestion,
        canSend: true,
        inputError: '请检查问题内容后再发送。',
        newTopicMode: this.data.completedRoundCount === 0,
        previousTurns: this.presentPreviousTurns(this.data.messages, true)
      })
      return false
    }
    if (state === 'network-error') {
      const conversationQuestion = this.data.activeConversationQuestion || safeQuestion
      const history = addHistoryEntry(this.data.history, conversationQuestion, 'network-error', {
        messages: this.data.messages,
        latestQuestion: safeQuestion
      })
      this.setData({
        previewState: '',
        assistantState: state,
        lastQuestion: safeQuestion,
        draft: '',
        canSend: false,
        networkConnected: false,
        networkError: true,
        networkHint: '请检查网络或重试',
        showRecoveryActions: true,
        history,
        activeConversationQuestion: conversationQuestion,
        previousTurns: this.presentPreviousTurns(this.data.messages, true)
      })
      this.saveConversationState(safeQuestion, '', history)
      return false
    }
    const recovery = state === 'auth-required'
      ? { title: '需要微信登录', copy: '登录后原问题会保留，请主动再次发送。' }
      : state === 'rate-limited'
        ? { title: '当前使用次数已达限制', copy: '你仍可浏览普通指南和使用搜索。' }
        : { title: 'AI服务暂时不可用', copy: '普通指南、搜索和已完成会话不受影响。' }
    this.setData({
      previewState: '',
      assistantState: state || 'service-error',
      lastQuestion: safeQuestion,
      draft: '',
      canSend: false,
      answerMode: false,
      newTopicMode: false,
      showRecoveryActions: true,
      recoveryTitle: recovery.title,
      recoveryCopy: recovery.copy,
      inputError: '',
      previousTurns: this.presentPreviousTurns(this.data.messages, true)
    })
    return false
  },

  async retryNetwork() {
    if (this._isUnloaded || this.data.retrying) return false
    this.setData({ previewMode: false, previewState: '', retrying: true, networkHint: '正在检查网络...' })
    const networkType = await getNetworkType()
    if (this._isUnloaded) return false
    if (!hasConnection(networkType)) {
      this.setData({
        networkConnected: false,
        networkError: true,
        retrying: false,
        networkHint: '请检查网络或重试'
      })
      return false
    }
    this.setData({
      networkConnected: true,
      networkError: false,
      retrying: false,
      networkHint: '',
      assistantState: 'idle',
      showRecoveryActions: false,
      draft: this.data.lastQuestion,
      canSend: Boolean(this.data.lastQuestion)
    })
    wx.showToast({ title: '网络已恢复，请再次发送', icon: 'success' })
    return true
  },

  async recoverAuthentication() {
    if (this._isUnloaded || this.data.authRecovering) return false
    this.setData({ authRecovering: true })
    const question = this.data.lastQuestion
    const controller = this._assistantController
    const result = await this._assistantController.recoverAuthentication()
    if (this._isUnloaded || controller !== this._assistantController) return false
    if (!result || !result.ok) {
      this.setData({ authRecovering: false })
      wx.showToast({ title: '微信登录未完成', icon: 'none' })
      return false
    }
    const preserveQuestion = !this._recoveryOwner || this._recoveryOwner === conversationStorage.owner()
    this.syncConversationOwner(preserveQuestion ? question : '')
    this._recoveryOwner = ''
    this.setData({
      authRecovering: false,
      assistantState: 'idle',
      recoveryTitle: '',
      recoveryCopy: '',
      showRecoveryActions: false,
      draft: preserveQuestion ? question : '',
      canSend: preserveQuestion && Boolean(question),
      statusMessage: preserveQuestion ? '登录成功，请再次点击发送按钮继续提问。' : '已切换账号，请重新输入问题。'
    })
    return true
  },

  prepareManualRetry() {
    if (this._isUnloaded || this.syncConversationOwner()) return false
    this.setData({
      assistantState: 'idle',
      recoveryTitle: '',
      recoveryCopy: '',
      showRecoveryActions: false,
      draft: this.data.lastQuestion,
      canSend: Boolean(this.data.lastQuestion)
    })
    return true
  },

  copyQuestion() {
    const question = boundedQuestion(this.data.lastQuestion)
    if (!question || typeof wx.setClipboardData !== 'function') return Promise.resolve(false)
    return new Promise(resolve => {
      wx.setClipboardData({
        data: question,
        success() {
          wx.showToast({ title: '问题已复制', icon: 'success' })
          resolve(true)
        },
        fail() {
          wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
          resolve(false)
        }
      })
    })
  },

  openConversationHistory() {
    if (this._isUnloaded) return
    const fallbackState = this.data.answerMode ? 'answer' : 'network-error'
    const history = this.data.history.length
      ? normalizeHistory(this.data.history)
      : addHistoryEntry([], this.data.activeConversationQuestion || this.data.lastQuestion, fallbackState, {
        messages: this.data.messages,
        latestQuestion: this.data.lastQuestion
      })
    this.setData({
      history,
      historyDrawerOpen: true,
      historySearch: '',
      historyGroups: buildHistoryGroups(history),
      historyActionQuestion: '',
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false
    })
  },

  closeConversationHistory() {
    if (this._isUnloaded) return
    this.setData({
      historyDrawerOpen: false,
      historySearch: '',
      historyGroups: [],
      historyActionQuestion: '',
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false
    })
  },

  inputHistorySearch(event) {
    if (this._isUnloaded) return
    const historySearch = boundedQuestion(event && event.detail ? event.detail.value : '')
    this.setData({
      historySearch,
      historyGroups: buildHistoryGroups(this.data.history, historySearch),
      historyActionQuestion: '',
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false
    })
  },

  selectHistory(event) {
    if (this._isUnloaded) return
    const question = boundedQuestion(event && event.currentTarget && event.currentTarget.dataset.question)
    const history = normalizeHistory(this.data.history)
    const item = history.find(entry => entry.question === question)
    if (!item) return
    this.resetAssistantRequest()
    const answerMode = item.state === 'answer'
    const exchange = lastCompletedExchange(item.messages)
    const rounds = completedRounds(item.messages)
    this.setData({
      lastQuestion: exchange ? exchange.question : item.latestQuestion || item.question,
      activeConversationQuestion: item.question,
      draft: '',
      canSend: false,
      focusInput: false,
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false,
      previewMode: item.readOnly,
      previewState: item.state,
      answerMode,
      assistantState: item.state,
      messages: item.messages,
      previousTurns: this.presentPreviousTurns(item.messages),
      completedRoundCount: rounds,
      roundLabel: `${rounds}/${MAX_ROUNDS}`,
      roundLimitReached: rounds >= MAX_ROUNDS,
      responseAnswer: exchange ? exchange.response.content : '',
      responseBlocks: parseMarkdown(exchange ? exchange.response.content : ''),
      responseScope: exchange ? exchange.response.applicable_scope : '',
      responseFreshness: exchange ? exchange.response.freshness_notice : '',
      responseReason: exchange ? exchange.response.reason : '',
      responseCitations: exchange ? this.presentCitations(exchange.response.citations) : [],
      newTopicMode: false,
      historyDrawerOpen: false,
      historySearch: '',
      historyGroups: [],
      historyActionQuestion: '',
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false,
      answerFeedback: '',
      networkConnected: item.state !== 'network-error',
      networkError: item.state === 'network-error',
      retrying: false,
      networkHint: answerMode || item.state === 'refusal' ? '' : '请检查网络或重试',
      showRecoveryActions: item.state !== 'answer',
      history
    })
    this.saveConversationState(item.question, '', history)
  },

  toggleHistoryPinByQuestion(question, notify = false) {
    if (this._isUnloaded) return false
    const normalizedQuestion = boundedQuestion(question)
    const current = normalizeHistory(this.data.history).find(item => item.question === normalizedQuestion)
    if (!current) return false
    const pinned = !current.pinned
    const history = normalizeHistory(this.data.history).map(item => (
      item.question === normalizedQuestion ? { ...item, pinned } : item
    ))
    this.setData({
      history,
      historyGroups: buildHistoryGroups(history, this.data.historySearch)
    })
    this.saveConversationState(this.data.lastQuestion, this.data.draft, history)
    if (notify) wx.showToast({ title: pinned ? '已置顶' : '已取消置顶', icon: 'none' })
    return true
  },

  toggleHistoryPin(event) {
    const question = event && event.currentTarget && event.currentTarget.dataset.question
    const changed = this.toggleHistoryPinByQuestion(question)
    if (changed) this.closeHistoryActions()
    return changed
  },

  openHistoryActions(event) {
    if (this._isUnloaded) return
    const question = boundedQuestion(event && event.currentTarget && event.currentTarget.dataset.question)
    const item = normalizeHistory(this.data.history).find(entry => entry.question === question)
    if (!item) return
    if (this.data.historyActionQuestion === question && !this.data.historyRenameMode) {
      this.closeHistoryActions()
      return
    }
    this.setData({
      historyActionQuestion: question,
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false
    })
  },

  closeHistoryActions() {
    if (this._isUnloaded) return
    this.setData({
      historyActionQuestion: '',
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false
    })
  },

  chooseHistoryPin(event) {
    const question = event && event.currentTarget && event.currentTarget.dataset.question
    const changed = this.toggleHistoryPinByQuestion(question, true)
    if (changed) this.closeHistoryActions()
  },

  chooseHistoryDelete(event) {
    const question = boundedQuestion(event && event.currentTarget && event.currentTarget.dataset.question)
    this.closeHistoryActions()
    this.confirmDeleteHistory(question)
  },

  openHistoryRename(event) {
    if (this._isUnloaded) return
    const question = boundedQuestion(event && event.currentTarget && event.currentTarget.dataset.question)
    const item = normalizeHistory(this.data.history).find(entry => entry.question === question)
    if (!item) return
    this.setData({
      historyActionQuestion: question,
      historyRenameMode: true,
      historyRenameValue: item.title,
      canSaveHistoryRename: Boolean(item.title),
      focusHistoryRename: false
    }, () => {
      if (!this._isUnloaded && this.data.historyRenameMode) this.setData({ focusHistoryRename: true })
    })
  },

  inputHistoryRename(event) {
    if (this._isUnloaded) return
    const historyRenameValue = String(event && event.detail ? event.detail.value : '').slice(0, MAX_HISTORY_TITLE_LENGTH)
    this.setData({
      historyRenameValue,
      canSaveHistoryRename: Boolean(boundedHistoryTitle(historyRenameValue))
    })
  },

  cancelHistoryRename() {
    if (this._isUnloaded) return
    this.setData({
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false
    })
  },

  saveHistoryRename() {
    if (this._isUnloaded) return false
    const question = boundedQuestion(this.data.historyActionQuestion)
    const title = boundedHistoryTitle(this.data.historyRenameValue)
    if (!question || !title) {
      wx.showToast({ title: '会话名称不能为空', icon: 'none' })
      return false
    }
    const previousHistory = normalizeHistory(this.data.history)
    if (!previousHistory.some(item => item.question === question)) return false
    const history = previousHistory.map(item => (
      item.question === question ? { ...item, title } : item
    ))
    this.setData({
      history,
      historyGroups: buildHistoryGroups(history, this.data.historySearch),
      historyActionQuestion: '',
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false
    })
    this.saveConversationState(this.data.lastQuestion, this.data.draft, history)
    wx.showToast({ title: '会话已重命名', icon: 'none' })
    return true
  },

  confirmDeleteHistory(question) {
    if (this._isUnloaded || typeof wx.showModal !== 'function') return
    wx.showModal({
      title: '删除这条会话？',
      content: '删除后无法从本机会话记录中恢复。',
      confirmText: '删除',
      confirmColor: '#B42318',
      success: result => {
        if (!this._isUnloaded && result && result.confirm) this.deleteHistoryByQuestion(question)
      }
    })
  },

  deleteHistoryByQuestion(question) {
    if (this._isUnloaded) return false
    const normalizedQuestion = boundedQuestion(question)
    const previousHistory = normalizeHistory(this.data.history)
    if (!previousHistory.some(item => item.question === normalizedQuestion)) return false
    const history = previousHistory.filter(item => item.question !== normalizedQuestion)
    if (boundedQuestion(this.data.activeConversationQuestion || this.data.lastQuestion) !== normalizedQuestion) {
      this.setData({
        history,
        historyGroups: buildHistoryGroups(history, this.data.historySearch),
        historyActionQuestion: '',
        historyRenameMode: false,
        historyRenameValue: '',
        canSaveHistoryRename: false,
        focusHistoryRename: false
      })
      this.saveConversationState(this.data.lastQuestion, this.data.draft, history)
      wx.showToast({ title: '会话已删除', icon: 'none' })
      return true
    }

    const stayOffline = this.data.networkError && this.data.previewState === 'network-error'
    this.setData({
      lastQuestion: '',
      activeConversationQuestion: '',
      draft: '',
      canSend: false,
      focusInput: false,
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false,
      previewMode: stayOffline,
      previewState: stayOffline ? 'network-error' : '',
      answerMode: false,
      newTopicMode: true,
      historyDrawerOpen: false,
      historySearch: '',
      historyGroups: [],
      historyActionQuestion: '',
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false,
      answerFeedback: '',
      assistantState: stayOffline ? 'network-error' : 'idle',
      messages: [],
      previousTurns: [],
      completedRoundCount: 0,
      roundLabel: `0/${MAX_ROUNDS}`,
      roundLimitReached: false,
      responseAnswer: '',
      responseBlocks: parseMarkdown(''),
      responseScope: '',
      responseFreshness: '',
      responseReason: '',
      responseCitations: [],
      showRecoveryActions: stayOffline,
      networkConnected: !stayOffline,
      networkError: stayOffline,
      retrying: false,
      networkHint: stayOffline ? '请检查网络或重试' : '',
      history
    }, () => {
      if (!this._isUnloaded) this.setData({ focusInput: true })
    })
    this.saveConversationState('', '', history)
    wx.showToast({ title: '会话已删除', icon: 'none' })
    return true
  },

  stopPropagation() {},

  resetAssistantRequest() {
    if (this._assistantController && typeof this._assistantController.cancel === 'function') this._assistantController.cancel()
    this._assistantController = assistantRuntime.createController()
    this._checkingNetwork = false
    this.setData({ requestPending: false })
  },

  saveConversationState(lastQuestion, draft, history) {
    if (this._conversationOwner === undefined) this._conversationOwner = conversationStorage.owner()
    saveLocalState(this._conversationOwner, lastQuestion, draft, history)
  },

  syncConversationOwner(question = '') {
    const account = conversationStorage.owner()
    if (this._conversationOwner === undefined) { this._conversationOwner = account; return false }
    if (account === this._conversationOwner) return false
    this.resetAssistantRequest()
    this._conversationOwner = account
    const stored = readLocalState(account) || {}
    this.setData({ ...JSON.parse(JSON.stringify(definition.data)), mockMode: assistantRuntime.isMock(),
      statusBarHeight: getStatusBarHeight(), history: normalizeHistory(stored.history),
      draft: question || stored.draft || '', canSend: Boolean(question || stored.draft), newTopicMode: true,
      learningProfileLabel: learningProfile.formatLabel(learningProfile.read()) })
    return true
  },

  startNewTopic() {
    if (this._isUnloaded) return
    this._recoveryOwner = ''
    this.resetAssistantRequest()
    const previousState = this.data.previewState === 'refusal'
      ? 'refusal'
      : this.data.answerMode ? 'answer' : 'network-error'
    const history = addHistoryEntry(
      this.data.history,
      this.data.activeConversationQuestion || this.data.lastQuestion,
      previousState,
      { messages: this.data.messages, latestQuestion: this.data.lastQuestion }
    )
    const stayOffline = this.data.networkError && this.data.previewState === 'network-error'
    this.setData({
      lastQuestion: '',
      activeConversationQuestion: '',
      draft: '',
      canSend: false,
      focusInput: false,
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false,
      previewMode: stayOffline,
      previewState: stayOffline ? 'network-error' : '',
      answerMode: false,
      newTopicMode: true,
      historyDrawerOpen: false,
      historySearch: '',
      historyGroups: [],
      historyActionQuestion: '',
      historyRenameMode: false,
      historyRenameValue: '',
      canSaveHistoryRename: false,
      focusHistoryRename: false,
      answerFeedback: '',
      assistantState: stayOffline ? 'network-error' : 'idle',
      messages: [],
      previousTurns: [],
      completedRoundCount: 0,
      roundLabel: `0/${MAX_ROUNDS}`,
      roundLimitReached: false,
      inputError: '',
      responseAnswer: '',
      responseBlocks: parseMarkdown(''),
      responseScope: '',
      responseFreshness: '',
      responseReason: '',
      responseCitations: [],
      showRecoveryActions: stayOffline,
      networkConnected: !stayOffline,
      networkError: stayOffline,
      retrying: false,
      networkHint: stayOffline ? '请检查网络或重试' : '',
      history
    }, () => {
      if (!this._isUnloaded) this.setData({ focusInput: true })
    })
    this.saveConversationState('', '', history)
  },

  copyAnswer() {
    if (this.syncConversationOwner()) return Promise.resolve(false)
    if (!this.data.responseAnswer && !this.data.previewMode) return Promise.resolve(false)
    if (typeof wx.setClipboardData !== 'function') return Promise.resolve(false)
    return new Promise(resolve => {
      wx.setClipboardData({
        data: this.data.responseAnswer || (this.data.previewMode ? ANSWER_CLIPBOARD_TEXT : ''),
        success() {
          wx.showToast({ title: '回答已复制', icon: 'success' })
          resolve(true)
        },
        fail() {
          wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
          resolve(false)
        }
      })
    })
  },

  async regenerateAnswer() {
    if (this._isUnloaded || this.data.requestPending || this.data.previewMode) return false
    const question = boundedQuestion(this.data.lastQuestion)
    if (!question) return false
    const messages = normalizeCompletedMessages(this.data.messages)
    const previousMessages = messages.length >= 2 ? messages.slice(0, -2) : []
    const rounds = completedRounds(previousMessages)
    this.setData({
      messages: previousMessages,
      completedRoundCount: rounds,
      roundLabel: `${rounds}/${MAX_ROUNDS}`,
      roundLimitReached: false,
      draft: question,
      canSend: true,
      previewState: '',
      assistantState: 'idle',
      answerMode: false,
      showRecoveryActions: false,
      responseAnswer: '',
      responseBlocks: parseMarkdown(''),
      responseScope: '',
      responseFreshness: '',
      responseReason: '',
      responseCitations: [],
      previousTurns: this.presentPreviousTurns(previousMessages, true)
    })
    return this.sendQuestion()
  },

  rateAnswer(event) {
    const value = String(event && event.currentTarget && event.currentTarget.dataset.value || '')
    if (value !== 'helpful' && value !== 'unhelpful') return
    this.setData({ answerFeedback: value })
    wx.showToast({ title: value === 'helpful' ? '感谢反馈' : '已记录反馈', icon: 'none' })
  },

  async openAnswerSource(event) {
    if (this.syncConversationOwner()) return false
    const account = this._conversationOwner
    const id = String(event && event.currentTarget && event.currentTarget.dataset.id || '')
    const source = this.data.responseCitations.find(item => item.id === id) || this.data.responseCitations[0]
    if (!source) {
      wx.showToast({ title: '回答中没有可打开的来源', icon: 'none' })
      return false
    }
    return this._sourceOpener.open(source, {
      autoCopyFallback: true,
      onState: state => {
        if (this._isUnloaded || account !== conversationStorage.owner()) return
        const responseCitations = this.data.responseCitations.map(item => (
          item.id === source.id
            ? { ...item, opening: state.phase === 'opening', openFailed: state.phase === 'failed', canCopy: state.canCopy }
            : item
        ))
        this.setData({ responseCitations })
      }
    })
  },

  copyAnswerSource(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset.id || '')
    const source = this.data.responseCitations.find(item => item.id === id)
    return source ? this._sourceOpener.copyFallback(source) : Promise.resolve(false)
  },

  editQuestion() {
    const editingQuestionValue = boundedQuestion(this.data.lastQuestion)
    if (!editingQuestionValue || this._isUnloaded) return
    this.setData({
      editingQuestion: true,
      editingQuestionValue,
      canSendEditedQuestion: true,
      focusQuestionEditor: false
    }, () => {
      if (this._isUnloaded || !this.data.editingQuestion) return
      this.setData({ focusQuestionEditor: true })
    })
  },

  inputEditedQuestion(event) {
    if (this._isUnloaded) return
    const editingQuestionValue = String(event && event.detail ? event.detail.value : '').slice(0, MAX_QUESTION_LENGTH)
    this.setData({
      editingQuestionValue,
      canSendEditedQuestion: Boolean(boundedQuestion(editingQuestionValue))
    })
  },

  cancelQuestionEdit() {
    if (this._isUnloaded) return
    this.setData({
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false
    })
  },

  async submitEditedQuestion() {
    if (this._isUnloaded) return false
    const question = boundedQuestion(this.data.editingQuestionValue)
    if (!question) {
      wx.showToast({ title: '问题不能为空', icon: 'none' })
      return false
    }
    if (this.data.previewMode && this.data.previewState === 'refusal') {
      this.setData({
        lastQuestion: question,
        editingQuestion: false,
        editingQuestionValue: '',
        canSendEditedQuestion: false,
        focusQuestionEditor: false,
        previewMode: true,
        previewState: 'generating',
        answerMode: false,
        newTopicMode: false,
        networkConnected: true,
        networkError: false,
        networkHint: ''
      })
      this.saveConversationState(question, this.data.draft, this.data.history)
      return true
    }

    if (!this.data.previewMode && this.data.previewState === 'refusal') {
      this.setData({
        editingQuestion: false,
        editingQuestionValue: '',
        canSendEditedQuestion: false,
        focusQuestionEditor: false,
        previewState: '',
        assistantState: 'idle',
        draft: question,
        canSend: true
      })
      return this.sendQuestion()
    }

    let connected = false
    if (!this.data.previewMode) {
      const networkType = await getNetworkType()
      if (this._isUnloaded) return false
      connected = hasConnection(networkType)
    }
    if (connected) {
      const messages = normalizeCompletedMessages(this.data.messages)
      const previousMessages = messages.length >= 2 ? messages.slice(0, -2) : []
      const rounds = completedRounds(previousMessages)
      this.setData({
        editingQuestion: false,
        editingQuestionValue: '',
        canSendEditedQuestion: false,
        focusQuestionEditor: false,
        messages: previousMessages,
        completedRoundCount: rounds,
        roundLabel: `${rounds}/${MAX_ROUNDS}`,
        roundLimitReached: false,
        previewState: '',
        assistantState: 'idle',
        answerMode: false,
        draft: question,
        canSend: true,
        previousTurns: this.presentPreviousTurns(previousMessages, true)
      })
      return this.sendQuestion()
    }

    this.setData({
      lastQuestion: question,
      editingQuestion: false,
      editingQuestionValue: '',
      canSendEditedQuestion: false,
      focusQuestionEditor: false,
      networkConnected: false,
      networkError: true,
      retrying: false,
      networkHint: '请检查网络或重试'
    })
    const history = addHistoryEntry(this.data.history, question, 'network-error')
    this.setData({ history })
    this.saveConversationState(question, this.data.draft, history)
    return true
  },

  showAttachmentUnavailable() {
    wx.showToast({ title: '暂不支持附件', icon: 'none' })
  },

  openLearningProfile() {
    wx.switchTab({ url: '/pages/profile/index' })
  },

  openLibrary() {
    wx.switchTab({ url: '/pages/guides/index' })
  },

  openSearch() {
    navigation.openGuideSearch(
      boundedQuestion(this.data.editingQuestionValue) || this.data.lastQuestion || this.data.draft || ''
    )
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.switchTab({ url: '/pages/guides/index' })
      }
    })
  }
}

registerThemedPage(definition)
