const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const config = require('../miniprogram/features/campus-map-3d/config')
const links = require('../miniprogram/features/campus-map-3d/links')
const LIBRARY = 'osm-building-616829077'
const MONUMENT = 'reference-monument-zhou-enlai'

// Exercise the actual JS-only mini-program modules with isolated platform APIs.
function harness({ enabled = true, realConfig = false, envVersion = 'develop', route = 'campus-map-3d', options = {}, standalone = false, dark = false, previousRoute = 'pages/campus-map/index' } = {}) {
  let definition
  const calls = [], ticks = [], patches = [], cache = new Map()
  const pages = standalone ? [{ route: `pages/${route}/index` }] : [{ route: previousRoute }, { route: `pages/${route}/index` }]
  const wx = { getStorageSync: key => key === 'nkustudy_theme_dark' ? dark : '', nextTick: fn => ticks.push(fn) }
  wx.getAccountInfoSync = () => ({ miniProgram: { envVersion } })
  for (const method of ['navigateTo', 'navigateBack', 'redirectTo', 'showToast']) wx[method] = options => calls.push({ method, ...options })
  const context = vm.createContext({ wx, getCurrentPages: () => pages, Page: value => { definition = value } })
  function load(file) {
    const target = path.resolve(file + (path.extname(file) ? '' : '.js'))
    if (!realConfig && target.endsWith(path.join('campus-map-3d', 'config.js'))) return { ...config, enabled, isEnabled: () => enabled }
    if (cache.has(target)) return cache.get(target).exports
    const module = { exports: {} }; cache.set(target, module)
    const factory = vm.runInContext(`(function(require,module,exports){${fs.readFileSync(target, 'utf8')}\n})`, context, { filename: target })
    factory(request => { assert.ok(request.startsWith('.')); return load(path.resolve(path.dirname(target), request)) }, module, module.exports)
    return module.exports
  }
  load(path.resolve(__dirname, `../miniprogram/pages/${route}/index.js`))
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch, done) {
    Object.assign(this.data, patch); patches.push(patch); if (done) done()
  } }
  if (page.onLoad) page.onLoad(options)
  return { page, calls, pages, patches, ticks, flush() { while (ticks.length) ticks.shift()() } }
}

test('public map entry is enabled in every build without depending on account-info availability', () => {
  assert.equal(config.enabled, true)
  const source = fs.readFileSync(path.resolve(__dirname, '../miniprogram/features/campus-map-3d/config.js'), 'utf8')
  function allowed(wx) {
    const context = { module: { exports: {} }, wx }
    vm.runInNewContext(source, context)
    return context.module.exports.isEnabled()
  }
  for (const envVersion of ['develop', 'trial', 'release', '', undefined]) {
    assert.equal(allowed({ getAccountInfoSync: () => ({ miniProgram: { envVersion } }) }), true)
  }
  for (const wx of [undefined, {}, { getAccountInfoSync: () => ({}) }, { getAccountInfoSync: () => { throw new Error('unavailable') } }]) {
    assert.equal(allowed(wx), true)
  }
})

test('disabled feature still prevents direct links and native bootstrap from opening the web-view', () => {
  const h = harness({ enabled: false, standalone: true, options: { buildingId: LIBRARY, url: 'https://example.com' } })
  h.page.retry(); h.flush()
  assert.equal(h.page.data.available, false)
  assert.equal(h.page.data.webVisible, false)
  assert.equal(h.page.data.url, '')
  assert.equal(h.calls.length, 0)
  const native = harness({ enabled: false, route: 'campus-map', options: { campusId: 'j', open3d: '1' } })
  native.page.onReady(); native.page.open3d()
  assert.equal(native.calls.length, 0)
})

test('actual production config enables both the chooser and web-view in develop, trial and release', () => {
  for (const envVersion of ['develop', 'trial', 'release']) {
    const chooser = harness({ realConfig: true, envVersion, route: 'campus-map-select' })
    chooser.page.onShow(); chooser.page.openCampus3d()
    assert.equal(chooser.page.data.map3dAvailable, true, envVersion)
    assert.equal(chooser.calls[0].url, links.pagePath(), envVersion)
    const web = harness({ realConfig: true, envVersion, previousRoute: 'pages/campus-map-select/index' })
    web.flush()
    assert.equal(web.page.data.available, true, envVersion)
    assert.equal(web.page.data.webVisible, true, envVersion)
    assert.equal(web.page.data.url, 'https://nkustudy.top/campus-map/?embed=wechat', envVersion)
  }
})

test('guide map entry opens the chooser; choices navigate independently and respect the release gate', () => {
  const calls = []
  const context = { module: { exports: {} }, wx: { navigateTo: options => calls.push(options) } }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/utils/navigation.js'), 'utf8'), context)
  context.module.exports.openCampusMap()
  assert.equal(calls[0].url, '/pages/campus-map-select/index')
  const h = harness({ route: 'campus-map-select', dark: true })
  h.page.onShow()
  assert.equal(h.page.data.themeDark, true)
  assert.equal(h.page.data.map3dAvailable, true)
  h.page.openTencent(); h.page.openCampus3d()
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].url, '/pages/campus-map/index')
  h.calls[0].complete()
  h.page.openCampus3d()
  assert.equal(h.calls[1].url, links.pagePath())
  h.calls[1].fail(); h.calls[1].complete()
  assert.equal(h.calls[2].method, 'showToast')
  h.page.openCampus3d()
  assert.equal(h.calls[3].url, links.pagePath())
  const closed = harness({ route: 'campus-map-select', enabled: false })
  closed.page.onShow(); closed.page.openCampus3d()
  assert.equal(closed.page.data.map3dAvailable, false)
  assert.equal(closed.calls[0].method, 'showToast')
  closed.page.openTencent()
  assert.equal(closed.calls[1].url, '/pages/campus-map/index')
})

test('web page entered through the chooser returns to it after a load failure', () => {
  const h = harness({ previousRoute: 'pages/campus-map-select/index' })
  h.flush()
  assert.equal(h.page.data.fromSelection, true)
  assert.equal(h.page.data.url, links.webUrl())
  h.page.webFailed(); h.page.returnToMap()
  assert.equal(h.calls[0].method, 'navigateBack')
})

test('web URL is fixed; only catalog IDs survive hostile or unknown inputs', () => {
  assert.equal(links.webUrl(LIBRARY), `https://nkustudy.top/campus-map/?embed=wechat&buildingId=${LIBRARY}`)
  for (const value of ['missing-building', 'javascript:alert(1)', '../x', ['x'], {}, null]) {
    assert.equal(links.buildingId(value), '')
    assert.equal(links.webUrl(value), 'https://nkustudy.top/campus-map/?embed=wechat')
  }
  assert.equal(links.sharedBuildingId(`https://nkustudy.top/campus-map/?buildingId=${LIBRARY}`, MONUMENT), LIBRARY)
  for (const url of [
    `https://nkustudy.top.evil.test/campus-map/?buildingId=${LIBRARY}`,
    `https://nkustudy.top@evil.test/campus-map/?buildingId=${LIBRARY}`,
    `http://nkustudy.top/campus-map/?buildingId=${LIBRARY}`,
    `https://nkustudy.top/campus-map/../?buildingId=${LIBRARY}`,
    `https://nkustudy.top/campus-map/?buildingId=${LIBRARY}&buildingId=${MONUMENT}`,
    'https://nkustudy.top/campus-map/?buildingId=%E0%A4%A',
    'https://nkustudy.top/campus-map/?buildingId=unknown',
    'https://nkustudy.top/campus-map/?embed=wechat',
    `https://nkustudy.top/campus-map/#?buildingId=${LIBRARY}`
  ]) assert.equal(links.sharedBuildingId(url, MONUMENT), '', url)
})

test('shares use current selection and clear a reset URL; absent webViewUrl uses entry ID', () => {
  const h = harness({ options: { buildingId: LIBRARY } }); h.flush()
  assert.equal(h.page.onShareAppMessage().path, links.pagePath(LIBRARY))
  assert.equal(h.page.onShareAppMessage({ webViewUrl: links.webUrl(MONUMENT) }).path, links.pagePath(MONUMENT))
  assert.equal(h.page.onShareAppMessage({ webViewUrl: links.webUrl('') }).path, links.pagePath(''))
  assert.equal(h.page.onShareAppMessage({ webViewUrl: 'https://example.com' }).path, links.pagePath(''))
  assert.equal(harness({ options: { buildingId: 'unknown' } }).page.onShareAppMessage().path, links.pagePath(''))
})

test('failure removes the web-view; retry really remounts, guards duplicate taps and unload', () => {
  const h = harness({ options: { buildingId: LIBRARY }, dark: true }); h.flush()
  assert.equal(h.page.data.themeDark, true)
  assert.equal(h.page.data.webVisible, true)
  h.page.webFailed()
  assert.equal(h.page.data.webVisible, false)
  assert.equal(h.page.data.failed, true)
  h.page.retry(); h.page.retry()
  assert.equal(h.ticks.length, 1)
  assert.equal(h.page.data.webVisible, false)
  h.flush()
  assert.equal(h.page.data.webVisible, true)
  assert.equal(h.page.data.failed, false)
  assert.equal(h.page.data.url, links.webUrl(LIBRARY))
  h.page.webFailed(); h.page.retry(); h.page.onUnload()
  const count = h.patches.length
  h.flush(); h.page.webFailed(); h.page.retry(); h.page.returnToMap()
  assert.equal(h.patches.length, count)
  assert.equal(h.page.data.webVisible, false)
})

test('return to previous native map uses navigateBack without altering its state', () => {
  const native = harness({ route: 'campus-map', options: { campusId: 'j' } })
  native.page.search({ detail: { value: '图书馆' } })
  native.page.selectById(native.page.data.places[0].markerId)
  const state = JSON.stringify(native.page.data)
  const h = harness(); h.pages[0] = { ...native.page, route: 'pages/campus-map/index' }; h.flush()
  h.page.returnToMap(); h.page.returnToMap()
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].method, 'navigateBack')
  assert.equal(JSON.stringify(native.page.data), state)
  native.page.onShow()
  assert.equal(JSON.stringify(native.page.data), state)
  h.calls[0].fail()
  assert.equal(h.calls[1].url, links.nativePath())
})

test('late errors from a replaced web-view cannot dismiss a new attempt', () => {
  const h = harness(); h.flush()
  const first = h.page.data.attempt
  h.page.webFailed({ currentTarget: { dataset: { attempt: first } } })
  h.page.retry(); h.flush()
  h.page.webFailed({ currentTarget: { dataset: { attempt: first } } })
  assert.equal(h.page.data.webVisible, true)
  assert.equal(h.page.data.failed, false)
  h.page.retry()
  h.page.webFailed()
  h.flush()
  assert.equal(h.page.data.webVisible, false)
  assert.equal(h.page.data.failed, true)
})

test('standalone sharing seeds Jinnan under the web page, once, with a valid place', () => {
  const shared = harness({ standalone: true, options: { buildingId: MONUMENT } })
  assert.equal(shared.page.data.webVisible, false)
  assert.equal(shared.calls[0].method, 'redirectTo')
  assert.equal(shared.calls[0].url, links.nativePath(MONUMENT, true))
  const native = harness({ route: 'campus-map', options: { campusId: 'j', open3d: '1', buildingId: MONUMENT } })
  assert.equal(native.page.data.campusId, 'j')
  assert.ok(native.page.data.places.every(place => place.campusId === 'j'))
  native.page.onReady(); native.page.onReady()
  assert.equal(native.calls.length, 1)
  assert.equal(native.calls[0].url, links.pagePath(MONUMENT))
  assert.equal(harness({ route: 'campus-map', options: { campusId: 'invalid' } }).page.data.campusId, 'n')
})

test('standalone errors can retry bootstrap or return directly to Jinnan', () => {
  const h = harness({ standalone: true }); h.calls[0].fail()
  assert.equal(h.page.data.failed, true)
  h.page.retry()
  assert.equal(h.calls[1].url, links.nativePath('', true))
  h.page.returnToMap()
  assert.equal(h.calls[2].url, links.nativePath())
  h.calls[2].fail()
  h.page.returnToMap()
  assert.equal(h.calls.at(-1).method, 'redirectTo')
})

test('native entry only opens for Jinnan, ignores tap events as IDs, preserves search/selection', () => {
  const h = harness({ route: 'campus-map' })
  h.page.open3d(); assert.equal(h.calls.length, 0)
  h.page.changeCampus({ currentTarget: { dataset: { id: 'j' } } })
  h.page.search({ detail: { value: '图书馆' } }); h.page.selectById(h.page.data.places[0].markerId)
  const before = JSON.stringify(h.page.data)
  h.page.open3d({ type: 'tap' }); h.page.open3d()
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].url, links.pagePath(''))
  assert.equal(JSON.stringify(h.page.data), before)
  h.calls[0].complete(); h.page.onUnload(); h.page.open3d()
  assert.equal(h.calls.length, 1)
})
