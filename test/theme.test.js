const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const theme = require('../miniprogram/utils/theme')
const root = path.join(__dirname, '../miniprogram')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
function harness(t, stored) {
  const oldWx = global.wx, oldPages = global.getCurrentPages
  const storage = new Map([[theme.KEY, stored]]), calls = [], pages = []
  global.wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, v) => storage.set(key, v) }
  for (const api of ['setNavigationBarColor', 'setBackgroundColor', 'setBackgroundTextStyle', 'setTabBarStyle', 'setTabBarItem', 'showToast']) global.wx[api] = options => calls.push({ api, ...options })
  global.getCurrentPages = () => pages
  t.after(() => { global.wx = oldWx; global.getCurrentPages = oldPages })
  const page = definition => {
    const result = theme.withTheme(definition || {})
    result.setData = patch => Object.assign(result.data, patch)
    pages.push(result)
    return result
  }
  return { storage, calls, pages, page }
}
test('theme defaults to light and ignores malformed persisted values', t => {
  const h = harness(t)
  for (const value of [undefined, '', 'true', 'false', {}, 1, false]) {
    h.storage.set(theme.KEY, value)
    assert.equal(theme.isDark(), false)
  }
  h.storage.set(theme.KEY, true)
  assert.equal(theme.isDark(), true)
  wx.getStorageSync = () => { throw Error('unavailable') }
  assert.equal(theme.isDark(), false)
})
test('manual toggle updates current and stacked pages, chrome and subsequent cold entries', t => {
  const h = harness(t, false), previous = h.page(), current = h.page()
  assert.equal(theme.setDark(true, current), true)
  for (const p of [previous, current, h.page()]) {
    assert.equal(p.data.themeDark, true)
    assert.match(p.data.themePageStyle, /--nk-surface:#24202B/)
    assert.equal(p.data.themeFront, '#ffffff')
  }
  assert.equal(h.calls.find(x => x.api === 'setTabBarStyle').backgroundColor, '#24202B')
  assert.equal(h.calls.filter(x => x.api === 'setTabBarItem').length, 5)
  assert.equal(theme.setDark(false, current), true)
  previous.onShow()
  assert.equal(previous.data.themeDark, false)
  assert.match(previous.data.themePageStyle, /--nk-surface:initial/)
  assert.equal(h.page().data.themeDark, false)
  assert.equal(h.calls.filter(x => x.api === 'setNavigationBarColor').at(-1).frontColor, '#000000')
})
test('theme wrappers preserve arguments, return values, lifecycle order and unload', async t => {
  const h = harness(t, true), unloaded = () => 'unloaded'
  const p = h.page({ data: { content: 'untouched' }, onLoad(options) { assert.equal(this.data.themeDark, true); return options.id }, async onShow() { return this.data.content }, onUnload: unloaded })
  assert.equal(p.onLoad({ id: 'deep-link' }), 'deep-link')
  assert.equal(await p.onShow(), 'untouched')
  assert.equal(p.onUnload, unloaded)
  h.storage.set(theme.KEY, false)
  p.onShow()
  assert.equal(p.data.themeDark, false)
})
test('failed persistence never changes displayed preference and offers a retry message', t => {
  const h = harness(t, false), p = h.page()
  wx.setStorageSync = () => { throw Error('full') }
  assert.equal(theme.setDark(true, p), false)
  assert.equal(p.data.themeDark, false)
  assert.equal(theme.isDark(), false)
  assert.match(h.calls.at(-1).title, /保存失败/)
  assert.equal(theme.setDark('dark', p), false)
})
test('every registered page owns theme lifecycle and page-meta; no independent system-theme CSS', () => {
  const app = JSON.parse(read('app.json'))
  for (const route of app.pages) {
    assert.match(read(route + '.js'), /registerThemedPage\(/, route)
    const template = read(route + '.wxml')
    assert.match(template, /^<page-meta page-style="\{\{themePageStyle\}\}"/, route)
    assert.equal((template.match(/<page-meta\b/g) || []).length, 1, route)
    assert.doesNotMatch(read(route + '.wxss'), /prefers-color-scheme/, route)
  }
  assert.doesNotMatch(read('features/learning-compass/catalog.wxss'), /prefers-color-scheme/)
  assert.match(read('pages/profile/index.wxml'), /data-mode="dark" bindtap="changeTheme"/)
  for (const name of ['course-card','course-detail-tabs','state-view','tag-chip']) assert.match(read('components/' + name + '/index.wxss'), /var\(--nk-/)
})
test('palette has readable text, muted text, accent and selected-control contrast', () => {
  const luminance = hex => {
    const parts = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    return parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722
  }
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
  for (const fg of ['text','muted','accent']) for (const bg of ['bg','surface','soft']) assert.ok(contrast(theme.DARK[fg], theme.DARK[bg]) >= 4.5, fg + '/' + bg)
  assert.ok(contrast('#FFFFFF', theme.DARK.primary) >= 4.5)
  for (const family of ['gold','green','blue','red']) assert.ok(contrast(theme.DARK[family], theme.DARK[family+'-soft']) >= 4.5)
})

test('page canvases share the pink-tinted light background and the dark background token', () => {
  const canvases = [
    ['app.wxss', 'page'],
    ['pages/guides/index.wxss', '.guides-page'],
    ['features/learning-compass/catalog.wxss', '.catalog-page'],
    ['pages/guide-detail/index.wxss', '.detail-page'],
    ['pages/campus-map/index.wxss', 'page']
  ]
  for (const [file, selector] of canvases) {
    const start = read(file).indexOf(selector + ' {')
    assert.ok(start >= 0, file)
    const block = read(file).slice(start, read(file).indexOf('}', start) + 1)
    assert.match(block, /background:\s*var\(--nk-bg,\s*#F6F3F7\)/, file)
  }
  assert.equal(theme.view(false).themeBackground, '#F6F3F7')
  assert.equal(theme.view(true).themeBackground, theme.DARK.bg)
  for (const file of ['pages/guide-category/index.wxss', 'pages/guide-search/index.wxss', 'pages/guide-documents/index.wxss']) {
    assert.match(read(file), /@import "\.\.\/\.\.\/features\/learning-compass\/catalog\.wxss";/, file)
  }
})
