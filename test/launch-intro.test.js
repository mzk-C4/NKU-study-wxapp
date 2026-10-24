const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createLaunchIntroGate, createIntroController, DURATION, FADE_DURATION } = require('../miniprogram/features/launch-intro')

function harness(platform) {
  const pending = new Map(), calls = []
  let elapsed = 0, sequence = 0
  const clock = {
    setTimeout(fn, delay) { const id = ++sequence; pending.set(id, { fn, at: elapsed + delay }); return id },
    clearTimeout(id) { pending.delete(id) }
  }
  const page = { data: {}, setData(patch) { Object.assign(this.data, patch) } }
  const wx = platform || { hideTabBar() { calls.push('hide') }, showTabBar() { calls.push('show') } }
  const controller = createIntroController(page, wx, clock)
  return { page, controller, pending, calls, advance(ms) {
    elapsed += ms
    for (const [id, timer] of [...pending]) if (timer.at <= elapsed) { pending.delete(id); timer.fn() }
  } }
}
test('only cold Home entry is eligible, consumed once; detail and share entries stay untouched', () => {
  for (const options of [{}, { path: 'pages/home/index' }, { path: '/pages/home/index', query: { from: 'share' } }]) {
    const gate = createLaunchIntroGate()
    assert.equal(gate.consume(), false)
    gate.launch(options)
    assert.equal(gate.consume(), true)
    assert.equal(gate.consume(), false)
  }
  for (const route of ['pages/guide-detail/index', 'pages/course-overview/index', 'pages/campus-map-3d/index']) {
    const gate = createLaunchIntroGate()
    gate.launch({ path: route, query: { id: 'original' } })
    assert.equal(gate.consume(), false)
    assert.equal(gate.consume(), false)
  }
})
test('backgrounding cancels an unconsumed intro and a new app has independent state', () => {
  const gate = createLaunchIntroGate(), another = createLaunchIntroGate()
  gate.launch(); gate.cancel()
  assert.equal(gate.consume(), false)
  another.launch()
  assert.equal(another.consume(), true)
})
test('bounded animation fades then removes itself at 1800ms without any network/animation event', () => {
  const h = harness()
  h.controller.start(); h.controller.start()
  assert.equal(h.pending.size, 2)
  assert.equal(h.page.data.introVisible, true)
  assert.deepEqual(h.calls, ['hide'])
  h.advance(DURATION - FADE_DURATION)
  assert.equal(h.page.data.introLeaving, true)
  h.advance(FADE_DURATION)
  assert.equal(h.page.data.introVisible, false)
  assert.equal(h.page.data.introLeaving, false)
  assert.equal(h.pending.size, 0)
  assert.deepEqual(h.calls, ['hide', 'show'])
})
test('skip/hide/unload cleanup is immediate, idempotent and cancels all later callbacks', () => {
  const h = harness()
  h.controller.start()
  h.advance(300)
  h.controller.finish(); h.controller.finish()
  assert.equal(h.page.data.introVisible, false)
  assert.equal(h.pending.size, 0)
  h.advance(5000)
  assert.deepEqual(h.calls, ['hide', 'show'])
})
test('late hideTabBar completion cannot strand the user without navigation', () => {
  let complete, restores = 0
  const h = harness({ hideTabBar(options) { complete = options.success }, showTabBar() { restores++ } })
  h.controller.start(); h.controller.finish(); complete()
  assert.equal(restores, 2)
})
test('missing or throwing native APIs do not block intro completion', () => {
  for (const platform of [{}, { hideTabBar() { throw Error('unsupported') }, showTabBar() { throw Error('unsupported') } }]) {
    const h = harness(platform)
    h.controller.start(); h.advance(DURATION)
    assert.equal(h.page.data.introVisible, false)
    assert.equal(h.pending.size, 0)
  }
})
test('real App and Home lifecycle preserve data loading, theme, notices and warm navigation', async t => {
  const previous = { App: global.App, Page: global.Page, wx: global.wx, getApp: global.getApp }
  t.after(() => Object.assign(global, previous))
  t.mock.timers.enable({ apis: ['setTimeout'] })
  global.App = () => {}
  const { createApp } = require('../miniprogram/app')
  const app = createApp({ getHome: async () => ({}) })
  global.getApp = () => app
  let captured, requests = 0
  global.Page = value => { captured = value }
  global.wx = { getStorageSync: () => true, hideTabBar() {}, showTabBar() {} }
  const target = require.resolve('../miniprogram/pages/home/index')
  delete require.cache[target]; require(target)
  const makePage = () => {
    const p = { ...captured, data: structuredClone(captured.data) }
    p.setData = patch => Object.assign(p.data, patch)
    p.loadSiteStatus = () => {}
    p.loadHome = () => { requests++; return Promise.resolve() }
    return p
  }
  app.onLaunch({ path: 'pages/home/index' })
  const p = makePage()
  p.onLoad(); p.onShow()
  assert.equal(p.data.themeDark, true)
  assert.equal(p.data.introVisible, true)
  assert.ok(requests > 0, 'home requests start while intro is visible')
  p.updateAnnouncement('新公告')
  assert.equal(p.data.announcementOpen, true, 'pending notice is preserved')
  p.skipIntro()
  assert.equal(p.data.introVisible, false)
  assert.equal(p.data.announcementOpen, true)
  p.onHide(); p.onShow()
  assert.equal(p.data.introVisible, false)
  const second = makePage(); second.onLoad()
  assert.equal(second.data.introVisible, false)
  // App onShow (warm resume) does not rearm the consumed gate.
  await app.onShow({ path: 'pages/home/index' })
  assert.equal(app.launchIntro.consume(), false)
  app.onLaunch({ path: 'pages/guide-detail/index', query: { id: 'kept' } })
  const fromDetail = makePage(); fromDetail.onLoad()
  assert.equal(fromDetail.data.introVisible, false)
  app.onLaunch({ path: 'pages/home/index' })
  const interrupted = makePage(); interrupted.onLoad(); interrupted.onHide()
  t.mock.timers.tick(5000)
  assert.equal(interrupted.data.introVisible, false)
  app.onLaunch({ path: 'pages/home/index' })
  const unloaded = makePage(); unloaded.onLoad(); unloaded.onUnload()
  assert.equal(unloaded.data.introVisible, false)
  assert.equal(unloaded.unloaded, true)
})
test('component is local-only, theme-bound, and gates carousel/announcement until dismissed', () => {
  const read = name => fs.readFileSync(path.join(__dirname, '../miniprogram', name), 'utf8')
  const template = read('pages/home/index.wxml')
  assert.match(template, /<launch-intro wx:if="\{\{introVisible\}\}" dark="\{\{themeDark\}\}"/)
  assert.match(template, /announcementOpen && announcement && !introVisible/)
  assert.match(template, /!announcementOpen && !introVisible/)
  const styles = read('components/launch-intro/index.wxss')
  assert.match(styles, /prefers-reduced-motion/)
  assert.doesNotMatch(styles, /infinite|@font-face|https?:|filter:/)
  const componentTemplate = read('components/launch-intro/index.wxml')
  assert.doesNotMatch(componentTemplate, /<video|https?:/)
  assert.match(componentTemplate, /src="\/assets\/branding\/launch-logo.png"/)
  assert.ok(fs.existsSync(path.join(__dirname, '../miniprogram/assets/branding/launch-logo.png')))
  const cfg = JSON.parse(read('pages/home/index.json'))
  assert.equal(cfg.usingComponents['launch-intro'], '../../components/launch-intro/index')
})
