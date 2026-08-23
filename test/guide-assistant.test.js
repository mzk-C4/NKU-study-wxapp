const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const navigation = require('../miniprogram/utils/navigation')

const projectRoot = path.resolve(__dirname, '..')

function capturePage(relativePath) {
  const modulePath = require.resolve(path.join(projectRoot, relativePath))
  const previousPage = global.Page
  let definition
  global.Page = value => { definition = value }
  delete require.cache[modulePath]
  try {
    require(modulePath)
  } finally {
    delete require.cache[modulePath]
    if (previousPage === undefined) delete global.Page
    else global.Page = previousPage
  }
  return definition
}

function createPage(definition, data = {}) {
  const page = {
    ...definition,
    data: { ...JSON.parse(JSON.stringify(definition.data)), ...data },
    _isUnloaded: false,
    _setDataCalls: []
  }
  page.setData = function setData(patch, callback) {
    this._setDataCalls.push(patch)
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return page
}

function installWx(t, implementation = {}) {
  const hadWx = Object.hasOwn(global, 'wx')
  const previousWx = global.wx
  global.wx = {
    getWindowInfo() { return { statusBarHeight: 22 } },
    getStorageSync() { return null },
    setStorageSync() {},
    onNetworkStatusChange() {},
    offNetworkStatusChange() {},
    getNetworkType(options) { options.success({ networkType: 'wifi' }) },
    navigateTo() {},
    navigateBack() {},
    switchTab() {},
    setClipboardData(options) { options.success() },
    showModal() {},
    showToast() {},
    ...implementation
  }
  t.after(() => {
    if (hadWx) global.wx = previousWx
    else delete global.wx
  })
}

const assistantDefinition = capturePage('miniprogram/pages/guide-assistant/index.js')
const guidesDefinition = capturePage('miniprogram/pages/guides/index.js')

test('AI assistant offline page is registered and matches the approved recovery structure', () => {
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.json'), 'utf8'))
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.wxss'), 'utf8')
  const source = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.js'), 'utf8')

  assert.ok(app.pages.includes('pages/guide-assistant/index'))
  assert.equal(config.navigationStyle, 'custom')
  assert.match(template, /学习指南针 AI 问答/)
  assert.match(template, /对话记录/)
  assert.match(template, /新开话题/)
  assert.match(template, /bindtap="openConversationHistory"/)
  assert.match(template, /bindtap="startNewTopic"/)
  assert.match(template, /class="history-drawer"/)
  assert.match(template, /placeholder="搜索对话内容\.\.\."/)
  assert.match(template, /bindtap="toggleHistoryPin"/)
  assert.match(template, /bindlongpress="openHistoryActions"/)
  assert.match(template, /class="history-action-card"/)
  assert.match(template, /bindtap="openHistoryRename"/)
  assert.match(template, /bindtap="chooseHistoryPin"/)
  assert.match(template, /bindtap="chooseHistoryDelete"/)
  assert.match(template, /重命名会话/)
  assert.match(template, /class="history-pin-mark"/)
  assert.doesNotMatch(template, /★|☆/)
  assert.match(template, /bindfocus="focusComposer"/)
  assert.match(template, /bindblur="blurComposer"/)
  assert.match(template, /没有找到相关对话/)
  assert.match(template, /学习指南针回答/)
  assert.match(template, /《南开大学本科课程考试与成绩管理规定》/)
  assert.match(template, /bindtap="openAnswerSource"/)
  assert.match(template, /当前第1\/10轮/)
  assert.match(source, /请检查网络或重试/)
  assert.match(template, /浏览知识库/)
  assert.match(template, /去普通搜索/)
  assert.match(template, /给学习指南针发送消息/)
  assert.match(template, /内容由 AI 生成，请仔细甄别/)
  assert.match(template, /bindtap="retryNetwork"/)
  assert.match(template, /bindtap="copyQuestion"/)
  assert.match(template, /bindtap="editQuestion"/)
  assert.match(template, /class="question-bubble question-editor"/)
  assert.match(template, /focus="{{focusQuestionEditor}}"/)
  assert.match(template, /bindtap="cancelQuestionEdit"/)
  assert.match(template, /bindtap="submitEditedQuestion"/)
  assert.match(styles, /\.question-state\s*\{[^}]*padding-left:\s*184rpx/s)
  assert.match(styles, /\.assistant-actions\s*\{[^}]*justify-content:\s*space-between/s)
  assert.match(styles, /\.history-drawer\s*\{[^}]*left:\s*0[^}]*width:\s*86%/s)
  assert.match(styles, /\.history-pin-mark\s*\{[^}]*transform:\s*rotate\(28deg\)/s)
  assert.match(styles, /\.history-action-card,[\s\S]*position:\s*absolute/s)
  assert.match(styles, /\.history-action-row--danger\s*\{[^}]*#E64949/s)
  assert.match(styles, /\.paperclip-icon::before,[\s\S]*\.paperclip-icon::after/)
  assert.match(styles, /\.answer-question-bubble\s*\{[^}]*width:\s*74%/s)
  assert.match(styles, /\.answer-card\s*\{[^}]*border-radius:\s*30rpx/s)
  assert.match(styles, /\.assistant-content\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s)
  assert.match(styles, /\.continue-section\s*\{[^}]*margin-top:\s*auto/s)
  assert.match(styles, /\.continue-card\s*\{[^}]*width:\s*100%\s*!important/s)
  assert.match(styles, /\.composer-area\s*\{[^}]*position:\s*fixed/s)
  assert.doesNotMatch(source, /public-api|wx\.request|guide-assistant\/answers/)
  assert.doesNotMatch(source, /showActionSheet/)
})

test('loading the assistant while offline restores the question and registers network recovery', async t => {
  let listener
  let removed
  installWx(t, {
    getNetworkType(options) { options.success({ networkType: 'none' }) },
    onNetworkStatusChange(callback) { listener = callback },
    offNetworkStatusChange(callback) { removed = callback }
  })
  const page = createPage(assistantDefinition)
  const question = '我对一门课程的成绩有异议，应该怎么申请复核？'

  await page.onLoad({ question: encodeURIComponent(question) })

  assert.equal(page.data.statusBarHeight, 22)
  assert.equal(page.data.lastQuestion, question)
  assert.equal(page.data.networkError, true)
  assert.equal(page.data.networkConnected, false)
  assert.equal(page.data.networkHint, '请检查网络或重试')
  assert.equal(typeof listener, 'function')

  listener({ isConnected: true, networkType: 'wifi' })
  assert.equal(page.data.networkConnected, true)
  assert.equal(page.data.networkError, true)
  assert.equal(page.data.networkHint, '网络已恢复，可以重新尝试')

  page.onUnload()
  assert.equal(removed, listener)
})

test('sending while offline preserves the question without calling an AI endpoint', async t => {
  const saved = []
  installWx(t, {
    getNetworkType(options) { options.success({ networkType: 'none' }) },
    setStorageSync(key, value) { saved.push({ key, value }) }
  })
  const page = createPage(assistantDefinition, {
    draft: '  我对一门课程的成绩有异议，应该怎么申请复核？  ',
    canSend: true
  })

  assert.equal(await page.sendQuestion(), true)
  assert.equal(page.data.lastQuestion, '我对一门课程的成绩有异议，应该怎么申请复核？')
  assert.equal(page.data.draft, '')
  assert.equal(page.data.canSend, false)
  assert.equal(page.data.networkError, true)
  assert.equal(saved.at(-1).value.lastQuestion, page.data.lastQuestion)
})

test('composer keeps focus while consecutive characters update the draft', t => {
  const saved = []
  installWx(t, { setStorageSync(key, value) { saved.push({ key, value }) } })
  const page = createPage(assistantDefinition)

  page.focusComposer()
  page.inputQuestion({ detail: { value: '成' } })
  page.inputQuestion({ detail: { value: '成绩' } })

  assert.equal(page.data.focusInput, true)
  assert.equal(page.data.draft, '成绩')
  assert.equal(page.data.canSend, true)
  assert.equal(saved.at(-1).value.draft, '成绩')

  page.blurComposer()
  assert.equal(page.data.focusInput, false)
})

test('assistant recovery controls copy, edit in place, browse and search without leaking diagnostics', async t => {
  const copied = []
  const toasts = []
  const tabs = []
  const searches = []
  const originalOpenSearch = navigation.openSearch
  navigation.openSearch = query => searches.push(query)
  t.after(() => { navigation.openSearch = originalOpenSearch })
  installWx(t, {
    setClipboardData(options) { copied.push(options.data); options.success() },
    showToast(options) { toasts.push(options) },
    switchTab(options) { tabs.push(options.url) }
  })
  const question = '成绩复核怎么申请？'
  const page = createPage(assistantDefinition, {
    lastQuestion: question,
    draft: '底部输入框原有草稿',
    canSend: true,
    networkError: true
  })

  assert.equal(await page.copyQuestion(), true)
  page.editQuestion()
  page.openLibrary()
  page.openSearch()
  page.showAttachmentUnavailable()

  assert.deepEqual(copied, [question])
  assert.equal(page.data.draft, '底部输入框原有草稿')
  assert.equal(page.data.focusInput, false)
  assert.equal(page.data.editingQuestion, true)
  assert.equal(page.data.editingQuestionValue, question)
  assert.equal(page.data.focusQuestionEditor, true)
  assert.deepEqual(tabs, ['/pages/guides/index'])
  assert.deepEqual(searches, [question])
  assert.deepEqual(toasts.map(item => item.title), ['问题已复制', '暂不支持附件'])
  assert.doesNotMatch(toasts.map(item => item.title).join(' '), /provider|stack|request id|token/i)
})

test('conversation drawer searches, groups, pins and restores a local answer', t => {
  const saved = []
  installWx(t, {
    setStorageSync(key, value) { saved.push({ key, value }) }
  })
  const now = Date.now()
  const todayStart = new Date(now).setHours(0, 0, 0, 0)
  const question = '我对一门课程的成绩有异议，应该怎么申请复核？'
  const yesterdayQuestion = '休学期满后如何申请复学？'
  const page = createPage(assistantDefinition, {
    lastQuestion: question,
    previewMode: true,
    previewState: 'answer',
    answerMode: true,
    history: [
      { question, state: 'answer', updatedAt: now, pinned: false },
      { question: yesterdayQuestion, state: 'network-error', updatedAt: todayStart - 60 * 60 * 1000, pinned: false }
    ]
  })

  page.openConversationHistory()

  assert.equal(page.data.historyDrawerOpen, true)
  assert.deepEqual(page.data.historyGroups.map(group => group.label), ['今天', '昨天'])
  assert.equal(page.data.historyGroups[0].items[0].title, question.slice(0, 50))

  page.inputHistorySearch({ detail: { value: '复学' } })
  assert.deepEqual(page.data.historyGroups.map(group => group.label), ['昨天'])
  assert.equal(page.data.historyGroups[0].items[0].question, yesterdayQuestion)

  page.toggleHistoryPin({ currentTarget: { dataset: { question: yesterdayQuestion } } })
  assert.equal(page.data.historyGroups[0].label, '置顶')
  assert.equal(page.data.historyGroups[0].items[0].pinned, true)
  assert.equal(saved.at(-1).value.history.find(item => item.question === yesterdayQuestion).pinned, true)

  page.selectHistory({ currentTarget: { dataset: { question: yesterdayQuestion } } })
  assert.equal(page.data.historyDrawerOpen, false)
  assert.equal(page.data.lastQuestion, yesterdayQuestion)
  assert.equal(page.data.answerMode, false)
  assert.equal(page.data.networkError, true)

  page.startNewTopic()

  assert.equal(page.data.lastQuestion, '')
  assert.equal(page.data.answerMode, false)
  assert.equal(page.data.newTopicMode, true)
  assert.equal(page.data.focusInput, true)
  assert.equal(page.data.history[0].question, yesterdayQuestion)
  assert.equal(page.data.history[0].state, 'network-error')
  assert.equal(page.data.history[0].pinned, true)
  assert.equal(saved.at(-1).value.history[0].question, yesterdayQuestion)
})

test('long pressing a conversation opens custom rename, pin and delete actions', t => {
  const modals = []
  const toasts = []
  installWx(t, {
    showModal(options) {
      modals.push({ title: options.title, content: options.content })
      options.success({ confirm: true })
    },
    showToast(options) { toasts.push(options.title) }
  })
  const now = Date.now()
  const pinnedQuestion = '成绩复核怎么申请？'
  const deletedQuestion = '休学后如何复学？'
  const page = createPage(assistantDefinition, {
    lastQuestion: deletedQuestion,
    previewMode: true,
    previewState: 'network-error',
    networkError: true,
    history: [
      { question: pinnedQuestion, state: 'answer', updatedAt: now, pinned: false },
      { question: deletedQuestion, state: 'network-error', updatedAt: now - 1000, pinned: false }
    ]
  })

  page.openConversationHistory()
  page.openHistoryActions({ currentTarget: { dataset: { question: pinnedQuestion } } })
  assert.equal(page.data.historyActionQuestion, pinnedQuestion)
  assert.equal(page.data.historyRenameMode, false)

  page.openHistoryRename({ currentTarget: { dataset: { question: pinnedQuestion } } })
  assert.equal(page.data.historyRenameMode, true)
  assert.equal(page.data.focusHistoryRename, true)
  page.inputHistoryRename({ detail: { value: '   ' } })
  assert.equal(page.saveHistoryRename(), false)
  page.inputHistoryRename({ detail: { value: '课程成绩复核流程' } })
  assert.equal(page.saveHistoryRename(), true)
  assert.equal(page.data.history.find(item => item.question === pinnedQuestion).title, '课程成绩复核流程')
  assert.equal(page.data.history.find(item => item.title === '课程成绩复核流程').question, pinnedQuestion)
  page.inputHistorySearch({ detail: { value: '课程成绩' } })
  assert.equal(page.data.historyGroups[0].items[0].title, '课程成绩复核流程')
  page.inputHistorySearch({ detail: { value: '' } })

  page.openHistoryActions({ currentTarget: { dataset: { question: pinnedQuestion } } })
  page.chooseHistoryPin({ currentTarget: { dataset: { question: pinnedQuestion } } })
  assert.equal(page.data.history.find(item => item.question === pinnedQuestion).pinned, true)

  page.openHistoryActions({ currentTarget: { dataset: { question: deletedQuestion } } })
  page.chooseHistoryDelete({ currentTarget: { dataset: { question: deletedQuestion } } })
  assert.equal(page.data.history.some(item => item.question === deletedQuestion), false)
  assert.equal(page.data.lastQuestion, '')
  assert.equal(page.data.newTopicMode, true)
  assert.equal(page.data.historyDrawerOpen, false)
  assert.equal(page.data.focusInput, true)
  assert.deepEqual(modals, [{
    title: '删除这条会话？',
    content: '删除后无法从本机会话记录中恢复。'
  }])
  assert.deepEqual(toasts, ['会话名称不能为空', '会话已重命名', '已置顶', '会话已删除'])
})

test('conversation history keeps only entries from the latest 30 days', async t => {
  const now = Date.now()
  const recentQuestion = '最近的问题'
  installWx(t, {
    getStorageSync() {
      return {
        lastQuestion: recentQuestion,
        draft: '',
        updatedAt: now,
        history: [
          { question: recentQuestion, state: 'answer', updatedAt: now - 2 * 24 * 60 * 60 * 1000 },
          { question: '超过30天的问题', state: 'answer', updatedAt: now - 31 * 24 * 60 * 60 * 1000 }
        ]
      }
    }
  })
  const page = createPage(assistantDefinition)

  await page.onLoad({})
  page.openConversationHistory()

  assert.deepEqual(page.data.history.map(item => item.question), [recentQuestion])
  assert.equal(page.data.historyGroups[0].label, '7天内')
})

test('answer preview renders locally without checking the network or calling an AI endpoint', async t => {
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) }
  })
  const page = createPage(assistantDefinition)
  const question = '我对一门课程的成绩有异议，应该怎么申请复核？'

  await page.onLoad({ preview: 'answer', question: encodeURIComponent(question) })

  assert.equal(networkChecks, 0)
  assert.equal(page.data.previewMode, true)
  assert.equal(page.data.previewState, 'answer')
  assert.equal(page.data.answerMode, true)
  assert.equal(page.data.networkError, false)
  assert.equal(page.data.lastQuestion, question)
  assert.equal(page.data.history[0].state, 'answer')
})

test('answer actions copy the approved response while source stays a future navigation entry', async t => {
  const copied = []
  const toasts = []
  installWx(t, {
    setClipboardData(options) { copied.push(options.data); options.success() },
    showToast(options) { toasts.push(options.title) }
  })
  const page = createPage(assistantDefinition, { answerMode: true })

  assert.equal(await page.copyAnswer(), true)
  assert.equal(await page.openAnswerSource(), false)
  page.rateAnswer({ currentTarget: { dataset: { value: 'helpful' } } })

  assert.match(copied[0], /下一学期开学3周内/)
  assert.equal(copied.length, 1)
  assert.equal(page.data.answerFeedback, 'helpful')
  assert.deepEqual(toasts, ['回答已复制', '原文跳转正在建设中', '感谢反馈'])
})

test('inline question editing can cancel or send in the approved offline preview', async t => {
  const saved = []
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) },
    setStorageSync(key, value) { saved.push({ key, value }) }
  })
  const page = createPage(assistantDefinition, {
    lastQuestion: '原问题',
    draft: '底部草稿保持不变',
    canSend: true,
    previewMode: true,
    networkError: true,
    networkConnected: false
  })

  page.editQuestion()
  page.inputEditedQuestion({ detail: { value: '取消的修改' } })
  page.cancelQuestionEdit()
  assert.equal(page.data.lastQuestion, '原问题')
  assert.equal(page.data.draft, '底部草稿保持不变')
  assert.equal(page.data.editingQuestion, false)

  page.editQuestion()
  page.inputEditedQuestion({ detail: { value: '  修改后的问题  ' } })
  assert.equal(await page.submitEditedQuestion(), true)
  assert.equal(networkChecks, 0)
  assert.equal(page.data.lastQuestion, '修改后的问题')
  assert.equal(page.data.draft, '底部草稿保持不变')
  assert.equal(page.data.editingQuestion, false)
  assert.equal(page.data.focusQuestionEditor, false)
  assert.equal(page.data.networkError, true)
  assert.equal(saved.at(-1).value.lastQuestion, '修改后的问题')
  assert.equal(saved.at(-1).value.draft, '底部草稿保持不变')
})

test('inline question editing rejects empty text and stays editable', async t => {
  const toasts = []
  installWx(t, { showToast(options) { toasts.push(options) } })
  const page = createPage(assistantDefinition, {
    lastQuestion: '原问题',
    editingQuestion: true,
    editingQuestionValue: '   ',
    canSendEditedQuestion: false,
    previewMode: true,
    networkError: true
  })

  assert.equal(await page.submitEditedQuestion(), false)
  assert.equal(page.data.editingQuestion, true)
  assert.equal(page.data.lastQuestion, '原问题')
  assert.deepEqual(toasts.map(item => item.title), ['问题不能为空'])
})

test('manual retry only leaves the offline state after a confirmed connection', async t => {
  const types = ['none', 'wifi']
  const toasts = []
  installWx(t, {
    getNetworkType(options) { options.success({ networkType: types.shift() }) },
    showToast(options) { toasts.push(options) }
  })
  const page = createPage(assistantDefinition, {
    lastQuestion: '成绩复核怎么申请？',
    networkError: true,
    networkConnected: false
  })

  assert.equal(await page.retryNetwork(), false)
  assert.equal(page.data.networkError, true)
  assert.equal(page.data.networkHint, '请检查网络或重试')

  assert.equal(await page.retryNetwork(), true)
  assert.equal(page.data.networkError, false)
  assert.equal(page.data.networkConnected, true)
  assert.deepEqual(toasts.map(item => item.title), ['网络已恢复'])
})

test('guide AI entry stays honest online and opens the approved fallback offline', t => {
  const routes = []
  const toasts = []
  const originalOpenAssistant = navigation.openGuideAssistant
  navigation.openGuideAssistant = (question = '') => routes.push(question)
  t.after(() => { navigation.openGuideAssistant = originalOpenAssistant })
  let networkType = 'wifi'
  installWx(t, {
    getNetworkType(options) { options.success({ networkType }) },
    showToast(options) { toasts.push(options) }
  })
  const page = createPage(guidesDefinition)

  page.openAssistant()
  networkType = 'none'
  page.openAssistant()

  assert.deepEqual(toasts.map(item => item.title), ['AI问答正在建设中'])
  assert.deepEqual(routes, [''])
})

test('develop opens the approved answer preview without changing trial or release behavior', t => {
  const calls = []
  const originalOpenAssistant = navigation.openGuideAssistant
  navigation.openGuideAssistant = (question, options) => calls.push({ question, options })
  t.after(() => { navigation.openGuideAssistant = originalOpenAssistant })
  installWx(t, {
    getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } },
    getNetworkType() { assert.fail('develop visual preview must not depend on live network state') }
  })
  const page = createPage(guidesDefinition)

  page.openAssistant()

  assert.deepEqual(calls, [{
    question: '我对一门课程的成绩有异议，应该怎么申请复核？',
    options: { previewAnswer: true }
  }])
})

test('network-error preview renders the approved state even while the developer machine is online', async t => {
  let networkChecks = 0
  installWx(t, {
    getNetworkType(options) { networkChecks += 1; options.success({ networkType: 'wifi' }) }
  })
  const page = createPage(assistantDefinition)

  await page.onLoad({
    preview: 'network-error',
    question: encodeURIComponent('我对一门课程的成绩有异议，应该怎么申请复核？')
  })

  assert.equal(networkChecks, 0)
  assert.equal(page.data.previewMode, true)
  assert.equal(page.data.networkError, true)
  assert.equal(page.data.networkConnected, false)
  assert.equal(page.data.networkHint, '请检查网络或重试')
})

test('assistant navigation encodes a bounded question in the stable route', t => {
  const routes = []
  installWx(t, { navigateTo(options) { routes.push(options.url) } })
  navigation.openGuideAssistant('成绩复核 / 下一步？')
  navigation.openGuideAssistant('成绩复核？', { previewNetworkError: true })
  navigation.openGuideAssistant('成绩复核？', { previewAnswer: true })
  assert.deepEqual(routes, [
    '/pages/guide-assistant/index?question=%E6%88%90%E7%BB%A9%E5%A4%8D%E6%A0%B8%20%2F%20%E4%B8%8B%E4%B8%80%E6%AD%A5%EF%BC%9F',
    '/pages/guide-assistant/index?question=%E6%88%90%E7%BB%A9%E5%A4%8D%E6%A0%B8%EF%BC%9F&preview=network-error',
    '/pages/guide-assistant/index?question=%E6%88%90%E7%BB%A9%E5%A4%8D%E6%A0%B8%EF%BC%9F&preview=answer'
  ])
})
