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
  assert.match(source, /请检查网络或重试/)
  assert.match(template, /浏览知识库/)
  assert.match(template, /去普通搜索/)
  assert.match(template, /给学习指南针发送消息/)
  assert.match(template, /内容由 AI 生成，请仔细甄别/)
  assert.match(template, /bindtap="retryNetwork"/)
  assert.match(template, /bindtap="copyQuestion"/)
  assert.match(template, /bindtap="editQuestion"/)
  assert.match(styles, /\.question-state\s*\{[^}]*padding-left:\s*184rpx/s)
  assert.match(styles, /\.continue-card\s*\{[^}]*width:\s*100%\s*!important/s)
  assert.match(styles, /\.composer-area\s*\{[^}]*position:\s*fixed/s)
  assert.doesNotMatch(source, /public-api|wx\.request|guide-assistant\/answers/)
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

test('assistant recovery controls copy, edit, browse and search without leaking diagnostics', async t => {
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
  const page = createPage(assistantDefinition, { lastQuestion: question, networkError: true })

  assert.equal(await page.copyQuestion(), true)
  page.editQuestion()
  page.openLibrary()
  page.openSearch()
  page.showAttachmentUnavailable()

  assert.deepEqual(copied, [question])
  assert.equal(page.data.draft, question)
  assert.equal(page.data.focusInput, true)
  assert.deepEqual(tabs, ['/pages/guides/index'])
  assert.deepEqual(searches, [question])
  assert.deepEqual(toasts.map(item => item.title), ['问题已复制', '暂不支持附件'])
  assert.doesNotMatch(toasts.map(item => item.title).join(' '), /provider|stack|request id|token/i)
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

test('develop opens the approved network-error preview without changing trial or release behavior', t => {
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
    options: { previewNetworkError: true }
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
  assert.deepEqual(routes, [
    '/pages/guide-assistant/index?question=%E6%88%90%E7%BB%A9%E5%A4%8D%E6%A0%B8%20%2F%20%E4%B8%8B%E4%B8%80%E6%AD%A5%EF%BC%9F',
    '/pages/guide-assistant/index?question=%E6%88%90%E7%BB%A9%E5%A4%8D%E6%A0%B8%EF%BC%9F&preview=network-error'
  ])
})
