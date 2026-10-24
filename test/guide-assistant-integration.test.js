const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const auth = require('../miniprogram/utils/auth-session')
const storage = require('../miniprogram/features/guide-assistant/storage')
const settings = require('../miniprogram/features/guide-assistant/settings')
const runtime = require('../miniprogram/features/guide-assistant/runtime')
const authBridge = require('../miniprogram/features/guide-assistant/auth-bridge')
const { publicApi } = require('../miniprogram/services/public-api')

function harness(t) {
  const previous = global.wx, previousPage = global.Page
  const values = new Map(), calls = []
  let env = 'release', definition
  global.wx = { getStorageSync: key => values.get(key), setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: key => values.delete(key), getAccountInfoSync: () => ({ miniProgram: { envVersion: env } }),
    getNetworkType: options => options.success({ networkType: 'wifi' }), getWindowInfo: () => ({ statusBarHeight: 20 }),
    onNetworkStatusChange() {}, offNetworkStatusChange() {}, showToast() {},
    request: options => calls.push(options) }
  global.Page = value => { definition = value }
  const file = require.resolve('../miniprogram/pages/guide-assistant/index')
  delete require.cache[file]; require(file); delete require.cache[file]
  global.Page = previousPage
  t.after(() => { global.wx = previous; global.Page = previousPage })
  const page = { ...definition, data: structuredClone(definition.data), setData(patch, done) { Object.assign(this.data, patch); if (done) done() } }
  return { values, calls, page, env: value => { env = value }, login: id => {
    if (!id) { values.delete(auth.STORAGE_KEY); return }
    values.set(auth.STORAGE_KEY, { token: `test-user-${id}-token-000000`, expires_at: Date.now() + 600000, user: { id } })
  } }
}

test('mock is opt-in, develop-only and visibly separate from real model results', async t => {
  const h = harness(t)
  h.values.set(settings.MODE_KEY, 'mock')
  for (const env of ['release', 'trial', '']) { h.env(env); assert.equal(settings.isMock(), false) }
  h.env('develop'); assert.equal(settings.isMock(), true)
  await h.page.onLoad()
  h.page.inputQuestion({ detail: { value: '成绩复核怎么申请？' } })
  assert.equal(await h.page.sendQuestion(), true)
  assert.equal(h.page.data.mockMode, true)
  assert.match(h.page.data.responseAnswer, /模拟回答/)
  assert.equal(h.calls.length, 0)
  assert.equal(storage.owner(), 'mock')
  assert.equal(h.values.has(storage.PREFIX + 'mock'), true)
  h.page.startNewTopic()
  h.page.inputQuestion({ detail: { value: '[429]' } })
  await h.page.sendQuestion()
  assert.equal(h.page.data.assistantState, 'rate-limited')
  assert.equal(h.page.data.completedRoundCount, 0)
  assert.equal(h.page.prepareManualRetry(), true)
  h.page.onUnload()
})

test('real requests require a session before contacting AI; release ignores preview parameters', async t => {
  const h = harness(t)
  await h.page.onLoad({ preview: 'answer', question: encodeURIComponent('原问题') })
  assert.equal(h.page.data.previewMode, false)
  assert.equal(h.page.data.responseAnswer, '')
  await h.page.sendQuestion()
  assert.equal(h.page.data.assistantState, 'auth-required')
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.lastQuestion, '原问题')
  h.page.onUnload()
})

test('account storage ignores unowned legacy records, isolates users and rejects stale writes', t => {
  const h = harness(t)
  h.values.set('nkustudy_guide_assistant_local_state', { draft: '旧版无归属记录' })
  h.login(1)
  assert.equal(storage.read(), null)
  assert.equal(storage.save(storage.owner(), { draft: 'A问题' }), true)
  h.login(2)
  assert.equal(storage.read(), null)
  assert.equal(storage.save('user-1', { draft: '迟到写入' }), false)
  storage.save(storage.owner(), { draft: 'B问题' })
  h.login(1)
  assert.equal(storage.read().draft, 'A问题')
  h.login(0)
  assert.equal(storage.save('', { draft: '游客' }), false)
  assert.equal(h.values.has('nkustudy_guide_assistant_local_state'), true)
})

test('a late login response cannot replace a newer account session', async t => {
  const h = harness(t)
  wx.login = options => options.success({ code: 'test-login-code' })
  let resolveLogin
  t.mock.method(publicApi, 'loginWechat', () => new Promise(resolve => { resolveLogin = resolve }))
  const pending = authBridge.ensureLogin()
  await new Promise(resolve => setImmediate(resolve))
  h.login(2)
  resolveLogin({ token: 'test-user-1-token-000000', expires_in: 3600, user: { id: 1 } })
  assert.equal((await pending).id, 2)
  assert.equal(auth.readSession().user.id, 2)
})

for (const status of [200, 401]) {
  test(`account switch ignores late ${status} and preserves the new session`, async t => {
    const h = harness(t); h.login(1)
    await h.page.onLoad()
    h.page.inputQuestion({ detail: { value: 'A私有问题' } })
    const pending = h.page.sendQuestion()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(h.calls.length, 1)
    h.login(2)
    h.calls[0].success({ statusCode: status, data: status === 401 ? { code: 'AUTH_REQUIRED', message: 'private diagnostic' }
      : { code: 0, data: { answer: 'A私有答案', citations: [{ id: 'SRC', title: '测试来源', official_page_url: 'https://jwc.nankai.edu.cn/test-rules' }] } } })
    assert.equal(await pending, false)
    assert.equal(auth.readSession().user.id, 2)
    assert.equal(h.page.data.responseAnswer, '')
    assert.equal(h.page.data.draft, '')
    assert.deepEqual(h.page.data.history, [])
    assert.equal(h.values.has(storage.PREFIX + 'user-2'), false)
    h.page.onUnload()
  })
}

test('expired session preserves only the failed question and never resends on login recovery', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  h.page.inputQuestion({ detail: { value: '原问题' } })
  const pending = h.page.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  h.calls[0].success({ statusCode: 401, data: { code: 'AUTH_REQUIRED', message: 'sensitive details' } })
  await pending
  assert.equal(h.page.data.assistantState, 'auth-required')
  assert.equal(h.page.data.lastQuestion, '原问题')
  h.page._assistantController.recoverAuthentication = async () => { h.login(1); return { ok: true } }
  assert.equal(await h.page.recoverAuthentication(), true)
  assert.equal(h.page.data.draft, '原问题')
  assert.equal(h.calls.length, 1)
  h.page.onUnload()
})

test('recovering into another account does not transfer the previous account question', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  h.page.inputQuestion({ detail: { value: 'A私有问题' } })
  const pending = h.page.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  h.calls[0].success({ statusCode: 401, data: { code: 'AUTH_REQUIRED' } }); await pending
  h.page._assistantController.recoverAuthentication = async () => { h.login(2); return { ok: true } }
  await h.page.recoverAuthentication()
  assert.equal(h.page.data.draft, '')
  assert.equal(h.page.data.lastQuestion, '')
  assert.equal(h.calls.length, 1)
  h.page.onUnload()
})

test('cancelling a real request on unload prevents new state and persisted answers', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  h.page.inputQuestion({ detail: { value: '问题' } })
  const pending = h.page.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  h.page.onUnload()
  const before = structuredClone(h.page.data)
  h.calls[0].fail({ errMsg: 'request:fail timeout' })
  await pending
  assert.deepEqual(h.page.data, before)
  assert.deepEqual(storage.read().history, [])
})

test('knowledge inventory and 50 evaluation drafts reference existing local source guides', () => {
  const root = path.resolve(__dirname, '..')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/guide-assistant/knowledge-manifest.json'), 'utf8'))
  const evaluation = JSON.parse(fs.readFileSync(path.join(root, 'docs/guide-assistant/evaluation-cases.json'), 'utf8'))
  assert.equal(manifest.guides.length, 5)
  for (const guide of manifest.guides) {
    assert.equal(guide.review_status, 'pending')
    const text = fs.readFileSync(path.join(root, guide.local_path), 'utf8')
    assert.ok(text.includes('id: ' + guide.id))
    guide.source_ids.forEach(id => assert.ok(text.includes(id)))
  }
  assert.equal(evaluation.cases.length, 50)
  assert.equal(new Set(evaluation.cases.map(item => item.id)).size, 50)
  for (const [kind, count] of [['normal', 30], ['refusal', 10], ['multi_turn', 10]]) assert.equal(evaluation.cases.filter(item => item.kind === kind).length, count)
  for (const item of evaluation.cases) {
    assert.equal(item.result, 'NOT_RUN'); assert.equal(item.review_status, 'pending')
    if (item.guide_id) assert.ok(manifest.guides.some(guide => guide.id === item.guide_id))
  }
})

test('answer source opens through the shared source opener and copies official-page fallback', async t => {
  const h = harness(t); h.login(1)
  const copied = []
  wx.setClipboardData = options => { copied.push(options.data); options.success() }
  await h.page.onLoad()
  h.page.setData({ responseCitations: [{ id: 'SRC', title: '测试来源', official_page_url: 'https://jwc.nankai.edu.cn/test-rules' }] })
  assert.equal(await h.page.openAnswerSource({ currentTarget: { dataset: { id: 'SRC' } } }), true)
  assert.deepEqual(copied, ['https://jwc.nankai.edu.cn/test-rules'])
  h.page.onUnload()
})
