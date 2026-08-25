const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const learningProfile = require('../miniprogram/utils/learning-profile')

const projectRoot = path.resolve(__dirname, '..')

function installWx(t, implementation = {}) {
  const hadWx = Object.hasOwn(global, 'wx')
  const previousWx = global.wx
  global.wx = implementation
  t.after(() => {
    if (hadWx) global.wx = previousWx
    else delete global.wx
  })
}

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
    _requestId: 0
  }
  page.setData = function setData(patch, callback) {
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return page
}

const profileDefinition = capturePage('miniprogram/pages/profile/index.js')
const guidesDefinition = capturePage('miniprogram/pages/guides/index.js')
const assistantDefinition = capturePage('miniprogram/pages/guide-assistant/index.js')

test('learning profile normalizes only admission year and major and formats every partial state', () => {
  const now = new Date('2026-08-25T00:00:00.000Z')
  assert.deepEqual(learningProfile.validate({}, now), {
    ok: true,
    field: '',
    error: '',
    value: { admission_year: '', major: '' }
  })
  assert.deepEqual(learningProfile.validate({
    admission_year: ' ２０２５ ',
    major: '  ＡＩ工程  ',
    name: '不应保存',
    openid: '不应保存'
  }, now).value, {
    admission_year: '2025',
    major: 'AI工程'
  })
  assert.equal(learningProfile.formatLabel({}), '年级未设置 · 专业未设置')
  assert.equal(learningProfile.formatLabel({ admission_year: '2025' }), '2025级 · 专业未设置')
  assert.equal(learningProfile.formatLabel({ major: '历史学' }), '年级未设置 · 历史学')
  assert.equal(learningProfile.formatLabel({ admission_year: '2025', major: '历史学' }), '2025级 · 历史学')
})

test('learning profile rejects invalid years and majors longer than 100 Unicode characters', () => {
  const now = new Date('2026-08-25T00:00:00.000Z')
  for (const admissionYear of ['25', 'abcd', '1999', '2028']) {
    const result = learningProfile.validate({ admission_year: admissionYear }, now)
    assert.equal(result.ok, false)
    assert.equal(result.field, 'admission_year')
    assert.match(result.error, /入学年份/)
  }
  const majorResult = learningProfile.validate({ major: '学'.repeat(101) }, now)
  assert.equal(majorResult.ok, false)
  assert.equal(majorResult.field, 'major')
  assert.match(majorResult.error, /最多填写 100 个字/)
})

test('learning profile storage is versioned, safely falls back, and clear removes only its own key', t => {
  const store = new Map([
    ['browse_history', [{ id: 'course-id' }]],
    ['nkustudy_guide_assistant_local_state', { history: [{ question: '原会话' }] }]
  ])
  const removed = []
  installWx(t, {
    getStorageSync(key) { return store.get(key) },
    setStorageSync(key, value) { store.set(key, value) },
    removeStorageSync(key) { removed.push(key); store.delete(key) }
  })

  const saved = learningProfile.save({ admission_year: '２０２５', major: '  化学  ', extra: 'drop' })
  assert.equal(saved.ok, true)
  assert.deepEqual(store.get(learningProfile.STORAGE_KEY), {
    version: 1,
    admission_year: '2025',
    major: '化学'
  })
  assert.deepEqual(learningProfile.read(), { admission_year: '2025', major: '化学' })

  assert.equal(learningProfile.clear().ok, true)
  assert.deepEqual(removed, [learningProfile.STORAGE_KEY])
  assert.deepEqual(store.get('browse_history'), [{ id: 'course-id' }])
  assert.deepEqual(store.get('nkustudy_guide_assistant_local_state'), { history: [{ question: '原会话' }] })
  assert.deepEqual(learningProfile.read(), { admission_year: '', major: '' })
})

test('learning profile storage exceptions never block page use', t => {
  installWx(t, {
    getStorageSync() { throw new Error('storage unavailable') },
    setStorageSync() { throw new Error('storage unavailable') },
    removeStorageSync() { throw new Error('storage unavailable') }
  })
  assert.deepEqual(learningProfile.read(), { admission_year: '', major: '' })
  assert.equal(learningProfile.save({ admission_year: '2025' }).ok, false)
  assert.equal(learningProfile.clear().ok, false)
})

test('profile page edits, validates and clears local learning information without clearing other data', t => {
  const store = new Map([
    ['browse_history', [{ id: 'course-id', name: '课程' }]],
    ['nkustudy_guide_assistant_local_state', { history: [{ question: '保留会话' }] }]
  ])
  const toasts = []
  const modals = []
  installWx(t, {
    getStorageSync(key) { return store.get(key) },
    setStorageSync(key, value) { store.set(key, value) },
    removeStorageSync(key) { store.delete(key) },
    showToast(options) { toasts.push(options.title) },
    showModal(options) {
      modals.push({ title: options.title, content: options.content, cancelText: options.cancelText, confirmText: options.confirmText })
      options.success({ confirm: true })
    }
  })
  const page = createPage(profileDefinition)

  page.onShow()
  assert.equal(page.data.learningProfileLabel, '年级未设置 · 专业未设置')
  assert.equal(page.data.history.length, 1)

  page.editLearningProfile()
  page.inputAdmissionYear({ detail: { value: '20' } })
  page.inputMajor({ detail: { value: '数学与应用数学' } })
  assert.equal(page.saveLearningProfile(), false)
  assert.match(page.data.admissionYearError, /四位数字/)
  assert.equal(page.data.editingLearningProfile, true)

  page.inputAdmissionYear({ detail: { value: '２０２５' } })
  assert.equal(page.saveLearningProfile(), true)
  assert.equal(page.data.learningProfileLabel, '2025级 · 数学与应用数学')
  assert.deepEqual(store.get(learningProfile.STORAGE_KEY), {
    version: 1,
    admission_year: '2025',
    major: '数学与应用数学'
  })

  page.editLearningProfile()
  page.inputMajor({ detail: { value: '不保存的修改' } })
  page.cancelLearningProfileEdit()
  assert.equal(page.data.learningMajorLabel, '数学与应用数学')

  page.confirmClearLearningProfile()
  assert.equal(store.has(learningProfile.STORAGE_KEY), false)
  assert.equal(store.has('nkustudy_guide_assistant_local_state'), true)
  assert.equal(page.data.history.length, 1)
  assert.equal(page.data.learningProfileLabel, '年级未设置 · 专业未设置')
  assert.deepEqual(modals, [{
    title: '清除本机学习信息？',
    content: '只会清除入学年份和专业，不会删除 AI 会话、课程浏览历史或指南内容。',
    cancelText: '取消',
    confirmText: '清除'
  }])
  assert.deepEqual(toasts, ['请检查学习信息', '学习信息已保存', '本机学习信息已清除'])
})

test('guide onShow and all five assistant visual states read the same current learning context', async t => {
  const store = new Map([[learningProfile.STORAGE_KEY, {
    version: 1,
    admission_year: '2024',
    major: '软件工程'
  }]])
  let networkChecks = 0
  installWx(t, {
    getWindowInfo() { return { statusBarHeight: 22 } },
    getStorageSync(key) { return store.get(key) },
    setStorageSync(key, value) { store.set(key, value) },
    getNetworkType() { networkChecks += 1 },
    onNetworkStatusChange() {},
    offNetworkStatusChange() {},
    switchTab() {},
    showToast() {}
  })

  const guides = createPage(guidesDefinition)
  guides.onShow()
  assert.equal(guides.data.guideContextLabel, '2024级 · 软件工程')
  store.set(learningProfile.STORAGE_KEY, { version: 1, admission_year: '2025', major: '历史学' })
  guides.onShow()
  assert.equal(guides.data.guideContextLabel, '2025级 · 历史学')

  for (const preview of ['new-topic', 'generating', 'answer', 'refusal', 'network-error']) {
    const assistant = createPage(assistantDefinition)
    await assistant.onLoad({ preview })
    assert.equal(assistant.data.learningProfileLabel, '2025级 · 历史学', preview)
  }
  assert.equal(networkChecks, 0)
})

test('refreshing learning information never rewrites assistant history or adds network calls', async t => {
  const history = [{ question: '原问题', title: '原会话', state: 'answer', updatedAt: Date.now(), pinned: true }]
  const store = new Map([
    [learningProfile.STORAGE_KEY, { version: 1, admission_year: '2025', major: '物理学' }],
    ['nkustudy_guide_assistant_local_state', { lastQuestion: '', draft: '', history, updatedAt: Date.now() }]
  ])
  let assistantWrites = 0
  let networkCalls = 0
  installWx(t, {
    getWindowInfo() { return { statusBarHeight: 22 } },
    getStorageSync(key) { return store.get(key) },
    setStorageSync(key, value) {
      store.set(key, value)
      if (key === 'nkustudy_guide_assistant_local_state') assistantWrites += 1
    },
    getNetworkType() { networkCalls += 1 },
    onNetworkStatusChange() {},
    offNetworkStatusChange() {},
    switchTab() {},
    showToast() {}
  })
  const assistant = createPage(assistantDefinition)
  await assistant.onLoad({ preview: 'new-topic' })
  const historyBeforeRefresh = JSON.parse(JSON.stringify(assistant.data.history))
  const writesBeforeRefresh = assistantWrites

  store.set(learningProfile.STORAGE_KEY, { version: 1, admission_year: '2024', major: '法学' })
  assistant.onShow()

  assert.equal(assistant.data.learningProfileLabel, '2024级 · 法学')
  assert.deepEqual(assistant.data.history, historyBeforeRefresh)
  assert.equal(assistantWrites, writesBeforeRefresh)
  assert.equal(networkCalls, 0)

  const helperSource = fs.readFileSync(path.join(projectRoot, 'miniprogram/utils/learning-profile.js'), 'utf8')
  const assistantSource = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.js'), 'utf8')
  const assistantTemplate = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/guide-assistant/index.wxml'), 'utf8')
  assert.doesNotMatch(helperSource, /wx\.request|public-api|auth_token|openid/i)
  assert.doesNotMatch(assistantSource, /guide-assistant\/answers|wx\.request/)
  assert.doesNotMatch(assistantTemplate, /2025级 · 专业未设置/)
  assert.match(assistantTemplate, /\{\{learningProfileLabel\}\}/)
  assert.match(assistantTemplate, /bindtap="openLearningProfile"/)
})
