const test = require('node:test')
const assert = require('node:assert/strict')
const auth = require('../miniprogram/utils/auth-session')
const local = require('../miniprogram/utils/local-preferences')
const drafts = require('../miniprogram/utils/form-draft')
const api = require('../miniprogram/services/public-api')
const feedbackApi = require('../miniprogram/utils/feedback-api')

function environment(t, account = 1) {
  const storage = new Map()
  const original = global.wx
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: key => storage.delete(key),
    showToast() {}, showModal(options) { options.success?.({ confirm: true }) },
    navigateBack() {}, switchTab() {}, navigateTo() {}
  }
  function login(id) {
    if (!id) { storage.delete(auth.STORAGE_KEY); return }
    storage.set(auth.STORAGE_KEY, { token: `testaccount${id}abcdefghijklmnop`, expires_at: Date.now() + 86400000, user: { id } })
  }
  login(account)
  t.after(() => { global.wx = original })
  return { storage, login }
}
function instance(definition) {
  return { ...definition, data: structuredClone(definition.data), setData(patch, done) { Object.assign(this.data, patch); done?.() } }
}
function page(name) {
  let definition
  const old = global.Page
  global.Page = value => { definition = value }
  const path = require.resolve(`../miniprogram/pages/${name}/index`)
  delete require.cache[path]
  const exported = require(path)
  global.Page = old
  return { page: instance(definition), exported }
}
function override(t, object, key, value) {
  const old = object[key]
  object[key] = value
  t.after(() => { object[key] = old })
}
function review(t, submitReview = async () => ({})) {
  const { exported } = page('write-review')
  const api = { getHome: async () => ({}), getCourse: async id => ({ id, name: id, teacher_groups: [] }), getReviewGroups: async () => ({ items: [] }), submitReview }
  const value = instance(exported.createWriteReviewPage(api))
  t.after(() => value.onUnload())
  return value
}
function feedback(t) {
  override(t, feedbackApi, 'listFeedback', async () => ({ items: [] }))
  override(t, api.publicApi, 'getMyFeedback', async () => ({ items: [] }))
  const { page: value } = page('feedback')
  t.after(() => value.onUnload())
  return value
}
const input = value => ({ detail: { value } })

test('history sanitizes malformed data, deduplicates NFKC and caps 10 words of 80 characters', t => {
  const { storage } = environment(t)
  storage.set(local.KEYS.search, { version: 1, items: [null, {}, ' ＡＢＣ ', 'abc', ...Array.from({ length: 15 }, (_, i) => `课程${i}`)] })
  const history = local.readHistory()
  assert.equal(history.length, 10)
  assert.equal(history.filter(x => x.normalize('NFKC').toLowerCase() === 'abc').length, 1)
  const result = local.recordHistory('x'.repeat(100), history)
  assert.equal(result.items[0].length, 80)
  assert.equal(local.readHistory().length, 10)
  global.wx.getStorageSync = () => { throw Error('unavailable') }
  assert.deepEqual(local.readHistory(), [])
})

test('search only records deliberate searches, replays locally and clears on confirmation', async t => {
  environment(t)
  let calls = 0
  override(t, api, 'getSearchIndex', async () => { calls++; return { version: 'v1', items: [], generated_at: '' } })
  override(t, api, 'getCourses', async () => ({ items: [], facets: {} }))
  const value = page('search').page
  t.after(() => value.onUnload())
  await value.onLoad()
  value.input(input('高等数学')); value.cancelSearchTimer()
  assert.deepEqual(local.readHistory(), [])
  await value.submit()
  assert.deepEqual(local.readHistory(), ['高等数学'])
  value.clearQuery()
  await value.chooseHistory({ currentTarget: { dataset: { query: '高等数学' } } })
  assert.equal(calls, 1)
  assert.equal(value.data.query, '高等数学')
  value.clearHistory()
  assert.deepEqual(local.readHistory(), [])
})

test('map common places persist with campus/category filtering and selection survives removal', t => {
  environment(t)
  const value = page('campus-map').page
  value.onLoad()
  const place = value.data.places[0]
  value.selectById(place.markerId); value.toggleFavorite(); value.toggleDetail()
  assert.equal(value.data.selectedFavorite, true)
  assert.equal(value.data.detailExpanded, true)
  const next = page('campus-map').page
  next.onLoad(); next.changePlaceMode({ currentTarget: { dataset: { mode: 'favorites' } } })
  assert.deepEqual(next.data.places.map(x => x.markerId), [place.markerId])
  next.selectById(place.markerId); next.toggleFavorite()
  assert.equal(next.data.selected.markerId, place.markerId)
  assert.equal(next.data.selectedFavorite, false)
  next.closeDetail(); assert.equal(next.data.places.length, 0)
  next.changeCampus({ currentTarget: { dataset: { id: 'j' } } })
  assert.ok(next.data.places.every(x => x.campusId === 'j'))
})

test('map recent IDs are bounded, unique, valid and newest-first after remount', t => {
  const { storage } = environment(t)
  storage.set(local.KEYS.recent, { version: 1, items: [999999, -1, '1', null] })
  const value = page('campus-map').page
  value.onLoad(); assert.equal(value.data.recentIds.length, 0)
  const source = value.data.places.slice(0, 15)
  for (const place of source) value.selectById(place.markerId)
  value.selectById(source[14].markerId)
  const next = page('campus-map').page
  next.onLoad(); next.changePlaceMode({ currentTarget: { dataset: { mode: 'recent' } } })
  assert.equal(next.data.places.length, 12)
  assert.equal(next.data.places[0].markerId, source[14].markerId)
  assert.equal(new Set(next.data.recentIds).size, 12)
})

test('unavailable storage leaves search and map usable with an honest warning', t => {
  environment(t)
  global.wx.setStorageSync = () => { throw Error('quota') }
  assert.equal(local.recordHistory('南开', []).saved, false)
  const value = page('campus-map').page
  value.onLoad(); value.selectById(value.data.places[0].markerId); value.toggleFavorite()
  assert.ok(value.data.selected)
  assert.equal(value.data.selectedFavorite, true)
  assert.match(value.data.storageNotice, /暂不可用/)
})

test('draft entries expire after 7 days, ignore corrupt fields and never store session credentials', t => {
  const { storage } = environment(t)
  const value = instance({ data: { teacher: '教师', body: '内容', rating: 5 } })
  const controller = drafts.createFormDraft(value, { kind: 'review', context: 'course:one' })
  controller.flush()
  const raw = storage.get(drafts.key('user_1'))
  assert.doesNotMatch(JSON.stringify(raw), /token|expires_at|nickname|avatar/)
  raw.entries.push({ kind: 'review', context: 'old', updatedAt: Date.now() - drafts.TTL, fields: {} })
  raw.entries.push({ kind: '__proto__', context: 'bad', updatedAt: Date.now(), fields: {} })
  raw.entries[0].fields.body = 'x'.repeat(2000)
  raw.entries[0].fields.rating = 99
  const clean = drafts.read('user_1')
  assert.equal(clean.length, 1)
  assert.equal(clean[0].fields.body.length, 800)
  assert.equal(clean[0].fields.rating, 0)
})

test('review saves on hide, restores per-course and per-account, and retains old courses when switching', async t => {
  const { login } = environment(t)
  const value = review(t)
  value.setData({ courseId: 'one' }); await value.prepare()
  value.inputTeacher(input('张老师')); value.inputBody(input('课程一的评价草稿')); value.setRating({ currentTarget: { dataset: { score: 4 } } })
  value.onHide()
  value.reselectCourse()
  assert.equal(drafts.read('user_1')[0].fields.body, '课程一的评价草稿')
  value.setData({ courseId: 'two' }); await value.prepare()
  assert.equal(value.data.body, '')
  value.inputBody(input('课程二草稿')); value.onHide()
  value.setData({ courseId: 'one' }); await value.prepare()
  assert.equal(value.data.body, '课程一的评价草稿')
  login(2); value.onShow()
  assert.equal(value.data.body, '')
  value.inputBody(input('账号二草稿')); value.onHide()
  login(1); value.onShow()
  assert.equal(value.data.body, '课程一的评价草稿')
  assert.equal(drafts.read('user_2')[0].fields.body, '账号二草稿')
})

test('accepted review clears only its draft and cannot recreate it on unload', async t => {
  environment(t)
  const value = review(t)
  value.setData({ courseId: 'one' }); await value.prepare()
  value.inputTeacher(input('教师')); value.inputBody(input('这门课程的课堂节奏非常清晰值得推荐')); value.setRating({ currentTarget: { dataset: { score: 5 } } })
  await value.submit()
  assert.deepEqual(drafts.read('user_1'), [])
  value.onHide(); value.onUnload()
  assert.deepEqual(drafts.read('user_1'), [])
})

test('failed review retains persisted fields and saving failure has an inline recovery hint', async t => {
  environment(t)
  const value = review(t, async () => { throw Error('提交失败') })
  value.setData({ courseId: 'one' }); await value.prepare()
  value.inputTeacher(input('教师')); value.inputBody(input('这门课程有充分而客观的学习体验')); value.setRating({ currentTarget: { dataset: { score: 3 } } })
  await value.submit()
  assert.equal(drafts.read('user_1')[0].fields.body, value.data.body)
  global.wx.setStorageSync = () => { throw Error('quota') }
  value.inputBody(input('继续修改的内容')); value.onHide()
  assert.match(value.data.draftNotice, /保存失败/)
})

test('feedback prefilled correction is independent of the general draft, including contact and report fields', async t => {
  environment(t)
  const value = feedback(t)
  value.onLoad(); await value.loadFeedback()
  value.inputTitle(input('普通反馈')); value.inputContent(input('普通反馈内容')); value.inputContact(input('测试联系方式'))
  value.chooseType({ currentTarget: { dataset: { value: 'complaint' } } }); value.inputReportTarget(input('反馈123')); value.onHide()
  const correction = feedback(t)
  correction.onLoad({ prefill_title: encodeURIComponent('课程缺失'), prefill_content: encodeURIComponent('补充课程') })
  assert.equal(correction.data.title, '课程缺失')
  assert.equal(correction.data.contact, '')
  correction.inputContent(input('补充课程的具体信息')); correction.onHide()
  const restored = feedback(t)
  restored.onLoad()
  assert.equal(restored.data.title, '普通反馈')
  assert.equal(restored.data.type, 'complaint')
  assert.equal(restored.data.reportTarget, '反馈123')
  assert.equal(restored.data.contact, '测试联系方式')
})

test('feedback false success keeps its draft, accepted response clears it, and account switches isolate data', async t => {
  const { login } = environment(t)
  const value = feedback(t)
  let accepted = false
  override(t, feedbackApi, 'submitFeedback', async () => ({ statusCode: 200, data: { ok: accepted } }))
  value.onLoad(); await value.loadFeedback()
  value.inputTitle(input('测试标题')); value.inputContent(input('测试内容'))
  await value.submit()
  assert.equal(drafts.read('user_1')[0].fields.title, '测试标题')
  login(2); value.onShow(); assert.equal(value.data.title, '')
  login(1); value.onShow(); assert.equal(value.data.title, '测试标题')
  accepted = true; await value.submit(); value.onHide()
  assert.deepEqual(drafts.read('user_1'), [])
})

test('draft clear requires confirmation and preserves content if local removal fails', async t => {
  environment(t)
  const value = feedback(t)
  value.onLoad(); value.inputTitle(input('未提交标题')); value.onHide()
  global.wx.showModal = options => options.success({ confirm: false })
  value.discardDraft(); assert.equal(value.data.title, '未提交标题')
  global.wx.showModal = options => options.success({ confirm: true })
  global.wx.setStorageSync = () => { throw Error('quota') }
  value.discardDraft(); assert.equal(value.data.title, '未提交标题')
  assert.match(value.data.draftNotice, /清除失败/)
})

test('favorites exposes loading, failure/retry, signed-out empty action and ignores stale account results', async t => {
  const { login } = environment(t)
  let resolve
  override(t, api.publicApi, 'getFavorites', () => new Promise(done => { resolve = done }))
  const value = page('favorites').page
  const pending = value.load()
  assert.equal(value.data.loading, true)
  login(0)
  await value.load()
  resolve({ items: [{ course_id: 'private-course' }] }); await pending
  assert.equal(value.data.loggedIn, false)
  assert.deepEqual(value.data.favorites, [])
  login(1)
  api.publicApi.getFavorites = async () => { throw Error('收藏暂不可用') }
  await value.load(); assert.match(value.data.error, /暂不可用/)
  api.publicApi.getFavorites = async () => ({ items: [{ course_id: 'course-one', favorited_at: '2026-10-01T00:00:00Z' }] })
  await value.load(); assert.equal(value.data.error, ''); assert.equal(value.data.favorites.length, 1)
})

test('late accepted review clears the old account only, and a late 401 cannot log out the new account', async t => {
  const { login } = environment(t)
  let complete, reject
  const value = review(t, () => new Promise((done, denied) => { complete = done; reject = denied }))
  value.setData({ courseId: 'one' }); await value.prepare()
  const fill = body => { value.inputTeacher(input('教师')); value.inputBody(input(body)); value.setRating({ currentTarget: { dataset: { score: 5 } } }) }
  fill('账号一这门课程的客观评价内容')
  const pending = value.submit()
  login(2); value.onShow()
  assert.equal(value.data.body, '')
  complete({}); await pending
  fill('账号二这门课程的客观评价内容'); value.onHide()
  assert.equal(drafts.read('user_2')[0].fields.body, value.data.body)
  assert.deepEqual(drafts.read('user_1'), [])
  const denied = value.submit()
  login(3); value.onShow()
  reject({ statusCode: 401, code: 'AUTH_REQUIRED' }); await denied
  assert.equal(auth.readSession().user.id, 3)
  assert.equal(value.data.body, '')
})

test('catalog and historical group drafts use distinct identifiers and survive reselecting a course', async t => {
  environment(t)
  const value = review(t)
  value.setData({ loading: false, pickerFiltered: [
    { type: 'catalog', catalogCourseId: 'cat-one', name: '课程', teachers: ['教师'] },
    { type: 'group', name: '课程', teachers: ['教师'] }
  ] })
  value.tapPickerEntry({ currentTarget: { dataset: { index: 0 } } })
  value.inputBody(input('目录课程草稿')); value.onHide()
  value.reselectCourse(); await value.prepare()
  value.setData({ pickerFiltered: [{ type: 'group', name: '课程', teachers: [] }] })
  value.tapPickerEntry({ currentTarget: { dataset: { index: 0 } } }); await value.prepare()
  assert.equal(value.data.body, '')
  value.inputBody(input('历史组草稿')); value.onHide()
  assert.deepEqual(new Set(drafts.read('user_1').map(x => x.context)), new Set(['catalog:cat-one', 'group:课程']))
})

test('draft cache keeps at most 20 forms and guest feedback never becomes another account draft', async t => {
  const { login } = environment(t, 0)
  const value = feedback(t)
  value.onLoad(); value.inputTitle(input('未登录的草稿')); value.onHide()
  login(1); value.onShow()
  assert.equal(value.data.title, '')
  assert.equal(drafts.read('guest')[0].fields.title, '未登录的草稿')
  for (let i = 0; i < 25; i++) {
    const form = instance({ data: { teacher: '', body: `draft ${i}`, rating: 0 } })
    drafts.createFormDraft(form, { kind: 'review', context: `course:${i}` }).flush()
  }
  assert.equal(drafts.read('user_1').length, 20)
  assert.equal(drafts.read('user_1')[0].context, 'course:24')
})
