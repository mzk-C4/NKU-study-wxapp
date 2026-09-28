const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { SEEN_KEY, NKUCS_URL, announcementView, createAnnouncementReader } = require('../miniprogram/features/home-announcement')
const { publicApi } = require('../miniprogram/services/public-api')
const feedbackApi = require('../miniprogram/utils/feedback-api')
const auth = require('../miniprogram/utils/auth-session')
function page(name) {
  let result
  const old = global.Page
  global.Page = value => { result = value }
  const target = require.resolve('../miniprogram/pages/' + name + '/index')
  try { delete require.cache[target]; require(target) } finally { global.Page = old }
  result.data = structuredClone(result.data)
  result.setData = patch => { for (const [key, value] of Object.entries(patch)) {
    const [first, second] = key.split('.')
    if (second) result.data[first][second] = value
    else result.data[first] = value
  } }
  return result
}

test('announcement dismissal persists only for exact content and storage failures are non-blocking', () => {
  const store = new Map()
  const storage = { getStorageSync: k => store.get(k), setStorageSync: (k, v) => store.set(k, v) }
  let reader = createAnnouncementReader(storage)
  const first = announcementView('内测公告 第一版')
  assert.equal(reader.isUnread(first), true)
  reader.dismiss(first)
  assert.equal(store.get(SEEN_KEY), first.revision)
  reader = createAnnouncementReader(storage)
  assert.equal(reader.isUnread(first), false)
  assert.equal(reader.isUnread(announcementView('内测公告 第二版')), true)
  assert.equal(reader.isUnread(null), false)
  const broken = createAnnouncementReader({ getStorageSync() { throw Error() }, setStorageSync() { throw Error() } })
  assert.equal(broken.isUnread(first), true)
  broken.dismiss(first)
  assert.equal(broken.isUnread(first), false)
})

test('announcement renders only NKUCS as a trusted clickable destination', () => {
  assert.equal(announcementView('  '), null)
  const notice = announcementView(`感谢[NKUCS.ICU](${NKUCS_URL})授权\n[x](https://evil.example)`)
  assert.deepEqual(notice.parts.filter(x => x.link).map(x => x.text), ['NKUCS.ICU'])
  assert.ok(notice.parts.some(x => x.text.includes('https://evil.example')))
  assert.equal(notice.preview.includes('[NKUCS'), false)
  const markup = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/home/index.wxml'), 'utf8')
  assert.ok(markup.indexOf('announcement-bar') < markup.indexOf('class="hero"'))
  assert.match(markup, /!announcementOpen/)
  assert.match(markup, /bindtap="openNkuCs"/)
})

test('home refresh deduplicates, shows changed notices, keeps content on transient failures', async t => {
  const original = global.wx
  const map = new Map()
  global.wx = { getStorageSync: k => map.get(k), setStorageSync: (k, v) => map.set(k, v) }
  t.after(() => { global.wx = original })
  const home = page('home')
  home.announcementReader = createAnnouncementReader(global.wx)
  let resolve
  t.mock.method(publicApi, 'getHome', () => new Promise(r => { resolve = r }))
  const pending = home.loadHome()
  assert.equal(home.loadHome(), pending)
  resolve({ announcement: '第一条内测公告', latest_updates: [] })
  await pending
  assert.equal(home.data.announcementOpen, true)
  home.closeAnnouncement()
  t.mock.method(publicApi, 'getHome', async () => ({ announcement: '第一条内测公告', latest_updates: [] }))
  await home.loadHome(true)
  assert.equal(home.data.announcementOpen, false)
  t.mock.method(publicApi, 'getHome', async () => ({ announcement: '第二条内测公告', latest_updates: [] }))
  await home.loadHome(true)
  assert.equal(home.data.announcementOpen, true)
  t.mock.method(publicApi, 'getHome', async () => { throw Error('offline') })
  await home.loadHome(true)
  assert.equal(home.data.error, '')
  assert.equal(home.data.announcement.revision, '第二条内测公告')
})

test('native submission requires a valid session and reports actual content-feedback acceptance', async t => {
  const old = global.wx
  const stored = new Map()
  global.wx = { showToast() {}, setStorageSync: (k, v) => stored.set(k, v), removeStorageSync: k => stored.delete(k) }
  t.after(() => { global.wx = old })
  const form = page('submit-resource')
  form.data.form = { courseName: '高数', title: '复习笔记', type: '笔记', platform: '百度网盘', url: 'https://pan.baidu.com/s/test', code: 'abcd', description: '本人整理的复习笔记' }
  let session = null, calls = 0, resolve
  t.mock.method(auth, 'readSession', () => session)
  t.mock.method(feedbackApi, 'submitFeedback', async body => { calls++; assert.equal(body.type, 'content'); assert.match(body.content, /课程：高数/); return new Promise(r => { resolve = r }) })
  await form.submit()
  assert.equal(calls, 0)
  assert.match(form.data.submitError, /登录/)
  session = { user: { id: 1 } }
  const pending = form.submit()
  await form.submit()
  assert.equal(calls, 1)
  resolve({ statusCode: 200, data: { ok: true } })
  await pending
  assert.equal(form.data.submitted, true)
  assert.equal(form.data.submitting, false)
  assert.equal(form.data.form.title, '')
  assert.equal(stored.has('nkustudy_submissions'), false)
})

test('native submission preserves bounded drafts on rejection and never assumes malformed responses succeeded', async t => {
  const old = global.wx
  const stored = new Map()
  global.wx = { showToast() {}, setStorageSync: (k, v) => stored.set(k, v) }
  t.after(() => { global.wx = old })
  t.mock.method(auth, 'readSession', () => ({ user: { id: 1 } }))
  const form = page('submit-resource')
  form.data.form = { courseName: '高数', title: '笔记', type: '笔记', platform: '百度网盘', url: 'https://pan.baidu.com/s/test', code: '', description: '' }
  t.mock.method(feedbackApi, 'submitFeedback', async () => ({ statusCode: 200, data: {} }))
  await form.submit()
  assert.equal(form.data.submitted, false)
  assert.equal(form.data.form.title, '笔记')
  assert.match(form.data.submitError, /未确认提交成功/)
  assert.equal(stored.get('nkustudy_resource_draft').title, '笔记')
  form.onInput({ currentTarget: { dataset: { field: '__proto__' } }, detail: { value: 'bad' } })
  assert.equal(Object.prototype.bad, undefined)
  for (const url of ['javascript:alert(1)', 'https://user@host.test/file', 'not a link']) {
    form.data.form.url = url
    assert.equal(form.validate(), false)
  }
})

test('beta card preserves supplied QR bytes and NKUCS route ignores arbitrary inputs', t => {
  const crypto = require('node:crypto')
  const bytes = fs.readFileSync(path.join(__dirname, '../miniprogram/assets/home/beta-group.jpg'))
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '7b58f70086705a6ed229c367b26f34196d674c0f80101c9033799bb856a4f2c2')
  const old = global.wx
  t.after(() => { global.wx = old })
  let copied
  global.wx = { setClipboardData: options => { copied = options.data } }
  const target = page('nkucs-web')
  assert.equal(target.data.url, NKUCS_URL)
  target.failed()
  assert.equal(target.data.failed, true)
  target.copyLink()
  assert.equal(copied, NKUCS_URL)
  target.retry()
  assert.equal(target.data.failed, false)
})

test('warm resume on another page announces a new notice without discarding that page', async t => {
  const old = { wx: global.wx, App: global.App, pages: global.getCurrentPages }
  t.after(() => { global.wx = old.wx; global.App = old.App; global.getCurrentPages = old.pages })
  global.App = () => {}
  const { createApp } = require('../miniprogram/app')
  const storage = new Map()
  let route = 'pages/submit-resource/index', modal, calls = 0, switched = ''
  global.getCurrentPages = () => [{ route }]
  global.wx = { getStorageSync: k => storage.get(k), setStorageSync: (k, v) => storage.set(k, v), showModal: options => { modal = options }, switchTab: options => { switched = options.url } }
  let content = '更新一'
  const app = createApp({ getHome: async () => { calls++; return { announcement: content } } })
  await app.onShow()
  assert.equal(modal.content, '更新一')
  assert.equal(switched, '')
  modal.success({ cancel: true }); modal.complete()
  modal = null
  await app.onShow()
  assert.equal(modal, null)
  content = '更新二'
  await app.onShow()
  modal.success({ confirm: true }); modal.complete()
  assert.equal(switched, '/pages/home/index')
  route = 'pages/home/index'
  await app.onShow()
  assert.equal(calls, 3)
})

test('announcement restored after another revision is new, and failed writes suppress repeats in-session', () => {
  let seen
  const reader = createAnnouncementReader({ getStorageSync: () => seen, setStorageSync: (_, value) => { seen = value } })
  const a = announcementView('公告A'), b = announcementView('公告B')
  reader.dismiss(a)
  reader.dismiss(b)
  assert.equal(reader.isUnread(a), true)
  const broken = createAnnouncementReader({ getStorageSync: () => '', setStorageSync() { throw Error('quota') } })
  broken.dismiss(a)
  assert.equal(broken.isUnread(a), false)
  assert.equal(broken.isUnread(b), true)
})

test('cold deep-link launch waits for a mounted page; hiding cancels presentation', async t => {
  const old = { wx: global.wx, App: global.App, pages: global.getCurrentPages }
  t.after(() => { global.wx = old.wx; global.App = old.App; global.getCurrentPages = old.pages })
  global.App = () => {}
  const { createApp } = require('../miniprogram/app')
  let pages = [], queued, modalCount = 0
  global.getCurrentPages = () => pages
  global.wx = { getStorageSync: () => '', showModal: () => { modalCount++ } }
  t.mock.method(global, 'setTimeout', fn => { queued = fn; return 123 })
  const cleared = t.mock.method(global, 'clearTimeout', () => {})
  const app = createApp({ getHome: async () => ({ announcement: '分享入口公告' }) })
  await app.onShow({ path: 'pages/course-overview/index' })
  assert.equal(modalCount, 0)
  assert.equal(typeof queued, 'function')
  pages = [{ route: 'pages/course-overview/index' }]
  queued()
  assert.equal(modalCount, 1)
  app.noticeModal = false
  pages = []
  await app.onShow({ path: 'pages/course-overview/index' })
  app.onHide()
  pages = [{ route: 'pages/course-overview/index' }]
  queued()
  assert.equal(modalCount, 1)
  assert.ok(cleared.mock.calls.length)
})

test('late responses from an old foreground visit never announce stale content', async t => {
  const old = { wx: global.wx, App: global.App, pages: global.getCurrentPages }
  t.after(() => { global.wx = old.wx; global.App = old.App; global.getCurrentPages = old.pages })
  global.App = () => {}
  const { createApp } = require('../miniprogram/app')
  global.getCurrentPages = () => [{ route: 'pages/profile/index' }]
  const displayed = [], resolves = []
  global.wx = { getStorageSync: () => '', showModal: options => displayed.push(options.content) }
  const app = createApp({ getHome: () => new Promise(resolve => resolves.push(resolve)) })
  const first = app.onShow()
  app.onHide()
  const second = app.onShow()
  resolves[1]({ announcement: '新公告' }); await second
  resolves[0]({ announcement: '旧公告' }); await first
  assert.deepEqual(displayed, ['新公告'])
})

test('submission freezes edited fields in-flight and does not leave when saving draft fails', t => {
  const old = global.wx
  t.after(() => { global.wx = old })
  let navigated = false
  global.wx = { setStorageSync() { throw Error('quota') }, showToast() {}, switchTab() { navigated = true } }
  const form = page('submit-resource')
  form.data.form.title = '正在提交的笔记'
  form.data.submitting = true
  form.onInput({ currentTarget: { dataset: { field: 'title' } }, detail: { value: '另一份笔记' } })
  form.onTypeChange({ detail: { value: 0 } })
  form.onPlatformChange({ detail: { value: 0 } })
  assert.equal(form.data.form.title, '正在提交的笔记')
  assert.equal(form.data.form.type, '')
  assert.equal(form.data.form.platform, '')
  form.data.submitting = false
  form.goLogin()
  assert.equal(navigated, false)
})
