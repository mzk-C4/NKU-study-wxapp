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
  return { values, calls, page, freshPage: () => ({ ...definition, data: structuredClone(definition.data), setData: page.setData }), env: value => { env = value }, login: id => {
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
  const saved = storage.read().history[0]
  assert.deepEqual(saved.messages, [])
  assert.equal(saved.pending.question, '问题')
  assert.ok(saved.pending.id)
  assert.equal(saved.rounds, 0)
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

function restartPage(h) {
  return h.freshPage()
}

function realAnswer(answer = '依据已发布原文作答。', extra = {}) {
  return { answer, refused: false, citations: [{ id: 'SRC-004', title: 'AI使用规范', official_page_url: 'https://jwc.nankai.edu.cn/test-rules' }], ...extra }
}

async function deliver(h, text, answer, index = h.calls.length) {
  h.page.inputQuestion({ detail: { value: text } })
  const pending = h.page.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  h.calls[index].success({ statusCode: 200, data: { code: 0, data: answer } })
  await pending
}

test('pending first question survives unload/reopen without resending or counting a round', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  h.page.inputQuestion({ detail: { value: '作业使用AI有哪些限制？' } })
  const pending = h.page.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  const id = storage.read().history[0].pending.id
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.equal(reopened.data.lastQuestion, '作业使用AI有哪些限制？')
  assert.equal(reopened.data.draft, '作业使用AI有哪些限制？')
  assert.equal(reopened.data.previewMode, false)
  assert.equal(reopened.data.requestPending, false)
  assert.equal(reopened.data.completedRoundCount, 0)
  assert.equal(reopened.data.assistantState, 'service-error')
  assert.equal(storage.read().history[0].pending.id, id)
  assert.equal(h.calls.length, 1)
  h.calls[0].success({ statusCode: 200, data: { code: 0, data: realAnswer('迟到答案') } })
  await pending
  assert.equal(reopened.data.responseAnswer, '')
  assert.equal(storage.read().history[0].messages.length, 0)
  reopened.onUnload()
})

test('interrupted follow-up restores prior pairs and manual retry sends them exactly once', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, '作业如何规范使用AI？', realAnswer('遵守课程要求。'))
  h.page.inputQuestion({ detail: { value: '还有哪些具体要求？' } })
  const pending = h.page.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.equal(reopened.data.lastQuestion, '还有哪些具体要求？')
  assert.equal(reopened.data.completedRoundCount, 1)
  assert.equal(reopened.data.previousTurns.length, 1)
  assert.equal(reopened.data.responseAnswer, '')
  reopened.selectHistory({ currentTarget: { dataset: { question: '作业如何规范使用AI？' } } })
  assert.equal(reopened.data.draft, '还有哪些具体要求？')
  assert.equal(reopened.data.previousTurns.length, 1)
  const retry = reopened.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  const sent = h.calls[2].data
  assert.equal(sent.question, '还有哪些具体要求?')
  assert.equal(sent.history.length, 2)
  assert.equal(sent.history[0].content, '作业如何规范使用AI?')
  h.calls[2].success({ statusCode: 200, data: { code: 0, data: realAnswer('第二次回答') } })
  assert.equal(await retry, true)
  assert.equal(reopened.data.completedRoundCount, 2)
  assert.equal(storage.read().history[0].pending, null)
  h.calls[1].fail({ errMsg: 'request:fail timeout' }); await pending
  assert.equal(storage.read().history[0].messages.length, 4)
  reopened.onUnload()
})

test('completed restored conversation includes all pairs in the next summary request', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, '本科作业如何用AI？', realAnswer('遵守课程要求。'))
  await deliver(h, '还有哪些限制？', realAnswer('注意使用范围。'))
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.equal(reopened.data.completedRoundCount, 2)
  reopened.inputQuestion({ detail: { value: '总结一下上文' } })
  const summary = reopened.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.calls[2].data.history.length, 4)
  assert.ok(h.calls[2].data.history[3].content.includes('注意使用范围'))
  h.calls[2].success({ statusCode: 200, data: { code: 0, data: { answer: '我们讨论了作业使用AI及其限制。', refused: false, answer_kind: 'conversation_summary', citations: [] } } })
  assert.equal(await summary, true)
  assert.equal(reopened.data.answerMode, true)
  assert.equal(reopened.data.completedRoundCount, 3)
  assert.deepEqual(reopened.data.followUpQuestions, [])
  reopened.onUnload()
})

test('supported follow-ups come from the response and hide for old servers, refusals and new topics', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  assert.deepEqual(h.page.data.followUpQuestions, [])
  await deliver(h, '作业如何用AI？', realAnswer('依据原文。', { follow_up_questions: ['关于AI课程作业，哪些使用范围被鼓励？'] }))
  assert.deepEqual(h.page.data.followUpQuestions, ['关于AI课程作业，哪些使用范围被鼓励？'])
  h.page.startNewTopic()
  assert.deepEqual(h.page.data.followUpQuestions, [])
  await deliver(h, '旧服务回答', realAnswer())
  assert.deepEqual(h.page.data.followUpQuestions, [])
  await deliver(h, '无证据的问题', { answer: '不能回答', refused: true, reason: 'INSUFFICIENT_EVIDENCE', follow_up_questions: ['不要展示'] })
  assert.deepEqual(h.page.data.followUpQuestions, [])
  h.page.onUnload()
})

test('internal refusal marker in mixed answer is a single safe refusal in UI and persisted history', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, '成绩复核怎么申请？', realAnswer('可以直接修改成绩。 REFUSE_INSUFFICIENT'))
  assert.equal(h.page.data.answerMode, false)
  assert.equal(h.page.data.previewState, 'refusal')
  assert.ok(!h.page.data.responseAnswer.includes('可以直接'))
  assert.ok(!JSON.stringify(h.page.data.responseBlocks).includes('REFUSE_'))
  assert.deepEqual(h.page.data.responseCitations, [])
  assert.ok(!JSON.stringify(storage.read()).includes('REFUSE_'))
  h.page.onUnload()
})

test('offline send and provider failure keep the unanswered question across restart without adding rounds', async t => {
  for (const offline of [true, false]) {
    const h = harness(t); h.login(1)
    await h.page.onLoad()
    if (offline) wx.getNetworkType = options => options.success({ networkType: 'none' })
    h.page.inputQuestion({ detail: { value: offline ? '断网的问题' : '服务失败的问题' } })
    const pending = h.page.sendQuestion()
    if (!offline) {
      await new Promise(resolve => setImmediate(resolve))
      h.calls[0].fail({ errMsg: 'request:fail timeout' })
    }
    await pending
    h.page.onUnload()
    const reopened = restartPage(h)
    await reopened.onLoad()
    assert.equal(reopened.data.completedRoundCount, 0)
    assert.equal(reopened.data.lastQuestion, offline ? '断网的问题' : '服务失败的问题')
    assert.equal(storage.read().history[0].pending.state, 'retry')
    assert.equal(h.calls.length, offline ? 0 : 1)
    reopened.onUnload()
  }
})

test('legacy mixed refusal is normalized before rendering restored history', async t => {
  const h = harness(t); h.login(1)
  const question = '历史问题'
  storage.save(storage.owner(), { updatedAt: Date.now(), lastQuestion: question, history: [{
    question, state: 'answer', updatedAt: Date.now(), messages: [
      { role: 'user', content: question }, { role: 'assistant', content: '正常结论 REFUSE_INSUFFICIENT', refused: false, citations: [] }
    ]
  }] })
  await h.page.onLoad()
  assert.equal(h.page.data.answerMode, false)
  assert.equal(h.page.data.previewState, 'refusal')
  assert.ok(!h.page.data.responseAnswer.includes('REFUSE_'))
  assert.ok(!h.page.data.responseAnswer.includes('正常结论'))
  h.page.onUnload()
})

test('offline follow-up keeps the previously completed exchange visible and uncounted pending', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, '作业如何用AI？', realAnswer('已有的回答'))
  wx.getNetworkType = options => options.success({ networkType: 'none' })
  h.page.inputQuestion({ detail: { value: '请列出具体步骤' } })
  await h.page.sendQuestion()
  assert.equal(h.page.data.previousTurns.length, 1)
  assert.equal(h.page.data.previousTurns[0].answer, '已有的回答')
  assert.equal(h.page.data.completedRoundCount, 1)
  assert.equal(h.calls.length, 1)
  h.page.onUnload()
})

test('deleting the active pending conversation invalidates late success and late failure', async t => {
  for (const fails of [false, true]) {
    const h = harness(t); h.login(1)
    await h.page.onLoad()
    h.page.inputQuestion({ detail: { value: '删除中的问题' } })
    const request = h.page.sendQuestion()
    await new Promise(resolve => setImmediate(resolve))
    const id = h.page.data.activeConversationId
    assert.equal(h.page.deleteHistoryByQuestion(id), true)
    assert.equal(h.page.data.requestPending, false)
    assert.equal(h.page.data.activeConversationId, '')
    const deleted = structuredClone(storage.read())
    if (fails) h.calls[0].fail({ errMsg: 'request:fail timeout' })
    else h.calls[0].success({ statusCode: 200, data: { code: 0, data: realAnswer('迟到答案') } })
    await request
    assert.deepEqual(storage.read(), deleted)
    assert.deepEqual(h.page.data.history, [])
    assert.equal(h.page.data.responseAnswer, '')
    await deliver(h, '删除后重新提问', realAnswer('新答案'))
    assert.equal(h.page.data.responseAnswer, '新答案')
    assert.equal(h.page.data.history.length, 1)
    h.page.onUnload()
  }
})

test('identical opening questions have independent IDs, edits, pins, restores and deletions', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, '同一个首问', realAnswer('第一次回答'))
  const first = h.page.data.activeConversationId
  h.page.startNewTopic()
  await deliver(h, '同一个首问', realAnswer('第二次回答'))
  const second = h.page.data.activeConversationId
  assert.notEqual(first, second)
  assert.equal(h.page.data.history.length, 2)
  const event = id => ({ currentTarget: { dataset: { id } } })
  h.page.openHistoryRename(event(first))
  h.page.inputHistoryRename({ detail: { value: '只改第一个' } })
  h.page.saveHistoryRename()
  h.page.toggleHistoryPin(event(first))
  assert.equal(h.page.data.history.find(item => item.id === first).pinned, true)
  assert.equal(h.page.data.history.find(item => item.id === second).pinned, false)
  assert.equal(h.page.data.history.find(item => item.id === second).title, '同一个首问')
  h.page.selectHistory(event(first))
  assert.equal(h.page.data.responseAnswer, '第一次回答')
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.equal(reopened.data.activeConversationId, first)
  assert.equal(reopened.data.responseAnswer, '第一次回答')
  assert.equal(reopened.deleteHistoryByQuestion(second), true)
  assert.equal(reopened.data.activeConversationId, first)
  assert.equal(reopened.data.responseAnswer, '第一次回答')
  assert.equal(storage.read().history.length, 1)
  reopened.onUnload()
})

test('deleting a different conversation does not cancel the active request', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, '同一个首问', realAnswer('旧答案'))
  const oldId = h.page.data.activeConversationId
  h.page.startNewTopic()
  h.page.inputQuestion({ detail: { value: '同一个首问' } })
  const pending = h.page.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  h.page.deleteHistoryByQuestion(oldId)
  assert.equal(h.page.data.requestPending, true)
  h.calls[1].success({ statusCode: 200, data: { code: 0, data: realAnswer('新答案') } })
  assert.equal(await pending, true)
  assert.equal(h.page.data.history.length, 1)
  assert.equal(h.page.data.responseAnswer, '新答案')
  h.page.onUnload()
})

test('regeneration stages a replacement: failed/reopened retry keeps old pairs until success', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, '第一问', realAnswer('第一答'))
  await deliver(h, '第二问', realAnswer('第二答'))
  const original = structuredClone(h.page.data.messages)
  const pending = h.page.regenerateAnswer()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(h.page.data.messages, original)
  assert.deepEqual(storage.read().history[0].messages, original)
  assert.equal(h.calls[2].data.history.length, 2)
  h.calls[2].fail({ errMsg: 'request:fail timeout' })
  await pending
  assert.deepEqual(h.page.data.messages, original)
  assert.equal(h.page.data.completedRoundCount, 2)
  assert.equal(h.page.data.previousTurns.at(-1).answer, '第二答')
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.deepEqual(reopened.data.messages, original)
  assert.equal(storage.read().history[0].pending.mode, 'replace-last')
  const retry = reopened.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.calls[3].data.history.length, 2)
  assert.equal(h.calls[3].data.question, '第二问')
  h.calls[3].success({ statusCode: 200, data: { code: 0, data: realAnswer('第二答的新版本') } })
  assert.equal(await retry, true)
  assert.equal(reopened.data.completedRoundCount, 2)
  assert.equal(reopened.data.messages.at(-1).content, '第二答的新版本')
  assert.equal(reopened.data.messages[1].content, '第一答')
  assert.equal(storage.read().history[0].pending, null)
  reopened.onUnload()
})

test('regeneration survives pending unload, ignores the late result and can replace the tenth round', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  for (let i = 1; i <= 10; i++) await deliver(h, `问题${i}`, realAnswer(`答案${i}`))
  assert.equal(h.page.data.completedRoundCount, 10)
  const pending = h.page.regenerateAnswer()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.calls[10].data.history.length, 18)
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.equal(reopened.data.completedRoundCount, 10)
  assert.equal(reopened.data.messages.at(-1).content, '答案10')
  assert.equal(reopened.data.roundLimitReached, false)
  h.calls[10].success({ statusCode: 200, data: { code: 0, data: realAnswer('迟到的替换') } })
  await pending
  assert.equal(storage.read().history[0].messages.at(-1).content, '答案10')
  const retry = reopened.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.calls[11].data.history.length, 18)
  h.calls[11].success({ statusCode: 200, data: { code: 0, data: realAnswer('成功替换10') } })
  assert.equal(await retry, true)
  assert.equal(reopened.data.completedRoundCount, 10)
  assert.equal(reopened.data.roundLimitReached, true)
  assert.equal(reopened.data.messages.at(-1).content, '成功替换10')
  reopened.onUnload()
})

test('offline follow-up editing persists its original conversation and all context on manual retry', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, 'AI作业规范', realAnswer('已完成的回答'))
  const id = h.page.data.activeConversationId
  wx.getNetworkType = options => options.success({ networkType: 'none' })
  h.page.inputQuestion({ detail: { value: '请列具体步骤' } })
  await h.page.sendQuestion()
  h.page.editQuestion()
  h.page.inputEditedQuestion({ detail: { value: '改为解释具体要求' } })
  await h.page.submitEditedQuestion()
  assert.equal(h.calls.length, 1)
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.equal(reopened.data.activeConversationId, id)
  assert.equal(reopened.data.history.length, 1)
  assert.equal(reopened.data.completedRoundCount, 1)
  assert.equal(reopened.data.lastQuestion, '改为解释具体要求')
  assert.equal(storage.read().history[0].pending.question, '改为解释具体要求')
  assert.equal(storage.read().history[0].pending.mode, 'append')
  wx.getNetworkType = options => options.success({ networkType: 'wifi' })
  reopened.editQuestion()
  reopened.inputEditedQuestion({ detail: { value: '联网后修改的追问' } })
  const retry = reopened.submitEditedQuestion()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.calls[1].data.history.length, 2)
  assert.equal(h.calls[1].data.history[1].content, '已完成的回答')
  assert.equal(h.calls[1].data.question, '联网后修改的追问')
  h.calls[1].success({ statusCode: 200, data: { code: 0, data: realAnswer('追问回答') } })
  assert.equal(await retry, true)
  assert.equal(reopened.data.completedRoundCount, 2)
  reopened.onUnload()
})

test('legacy IDs migrate once and array-shaped answers cannot complete a turn', async t => {
  const h = harness(t); h.login(1)
  storage.save(storage.owner(), { updatedAt: Date.now(), lastQuestion: '原提问', history: [{ question: '原提问', state: 'answer', updatedAt: Date.now(), messages: [
    { role: 'user', content: '原提问' }, { role: 'assistant', content: '原答案', refused: false }
  ] }] })
  await h.page.onLoad()
  const id = h.page.data.activeConversationId
  assert.ok(id)
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.equal(reopened.data.activeConversationId, id)
  reopened.inputQuestion({ detail: { value: '追问' } })
  const pending = reopened.sendQuestion()
  await new Promise(resolve => setImmediate(resolve))
  h.calls[0].success({ statusCode: 200, data: { code: 0, data: realAnswer('[{"answer":"资料不足","refused":true}]') } })
  assert.equal(await pending, false)
  assert.equal(reopened.data.assistantState, 'service-error')
  assert.equal(reopened.data.completedRoundCount, 1)
  assert.equal(reopened.data.responseAnswer, '')
  reopened.onUnload()
})

test('a server recap quoting an earlier refusal remains a recap after persistence and restore', async t => {
  const h = harness(t); h.login(1)
  await h.page.onLoad()
  await deliver(h, '没有依据的问题', realAnswer('这个问题我资料库里暂时没有，不敢瞎说。'))
  assert.equal(h.page.data.previewState, 'refusal')
  await deliver(h, '总结一下我们刚才聊了什么', { answer: '此前回答：现有指南没有足够依据回答这个问题。', refused: false, answer_kind: 'conversation_summary', citations: [] })
  assert.equal(h.page.data.previewState, 'answer')
  assert.equal(h.page.data.messages.at(-1).answer_kind, 'conversation_summary')
  h.page.onUnload()
  const reopened = restartPage(h)
  await reopened.onLoad()
  assert.equal(reopened.data.answerMode, true)
  assert.equal(reopened.data.messages.at(-1).refused, false)
  assert.equal(reopened.data.messages.at(-1).answer_kind, 'conversation_summary')
  assert.equal(reopened.data.completedRoundCount, 2)
  reopened.onUnload()
})
