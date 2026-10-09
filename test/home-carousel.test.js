const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { HOME_SLIDES } = require('../miniprogram/features/home-carousel')
const root = path.join(__dirname, '..')

function loadPage(relative) {
  let page
  const previous = global.Page
  global.Page = definition => { page = definition }
  const target = require.resolve('../miniprogram/pages/' + relative + '/index')
  try { delete require.cache[target]; require(target) } finally { global.Page = previous }
  page.data = JSON.parse(JSON.stringify(page.data))
  page.setData = patch => Object.assign(page.data, patch)
  return page
}

test('home has five local banners with hinku fourth and the Feishu QR fifth', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const tabs = new Set(app.tabBar.list.map(item => '/' + item.pagePath))
  assert.deepEqual(HOME_SLIDES.map(slide => slide.id), ['resources', 'reviews', 'guides', 'hinku', 'beta'])
  assert.equal(HOME_SLIDES[3].kind, 'miniProgram')
  assert.equal(HOME_SLIDES[4].qrImage, '/assets/home/beta-group.jpg')
  for (const slide of HOME_SLIDES) {
    if (slide.kind !== 'miniProgram') assert.ok(slide.kind === 'page' ? app.pages.includes(slide.url.slice(1)) : tabs.has(slide.url))
    assert.ok(fs.existsSync(path.join(root, 'miniprogram', slide.image)))
    if (slide.logo) assert.ok(fs.existsSync(path.join(root, 'miniprogram', slide.logo)))
    if (slide.qrImage) assert.ok(fs.existsSync(path.join(root, 'miniprogram', slide.qrImage)))
    assert.ok(slide.title && slide.description && slide.action)
  }
})

test('home replaces hot courses with accessible swiper while retaining existing content', () => {
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/home/index.wxml'), 'utf8')
  assert.doesNotMatch(template, /大家在看|hotCourses|course-card|指南建设中/)
  assert.match(template, /<swiper\s/)
  assert.match(template, /bindtap="toggleCarousel"/)
  assert.match(template, /bindtouchcancel="endCarouselTouch"/)
  assert.match(template, /carouselVisible && !carouselPaused && !carouselTouching/)
  for (const retained of ['siteStatus', '最近更新', 'collaborators', '津ICP备2026009194号-3']) assert.ok(template.includes(retained))
  assert.ok(template.indexOf('<swiper ') < template.indexOf('<block wx:if="{{!loading'))
  const page = loadPage('home')
  assert.deepEqual(page.data.collaborators.find(item => item.id === 'k'), {
    id: 'k', name: 'K', identity: '2511144', account: 'qklzhenhc@icloud.com'
  })
  assert.deepEqual(page.data.collaborators.find(item => item.id === 'cure'), {
    id: 'cure', name: 'cure', identity: 'nkuwiki合作方', account: ''
  })
  assert.deepEqual(page.data.collaborators.find(item => item.id === 'wsy'), {
    id: 'wsy', name: '王绅右', identity: '2513137', account: 'yhqkwxs'
  })
  assert.equal(page.data.collaborators.length, 8)
  assert.equal(new Set(page.data.collaborators.map(item => item.id)).size, 8)
  assert.equal(page.data.collaborators.some(item => item.name === '刘铠嘉'), false)
})

test('carousel stops when hidden or touched and preserves explicit pause across visits', () => {
  const page = loadPage('home')
  page.onShow()
  assert.equal(page.data.carouselVisible, true)
  page.startCarouselTouch()
  assert.equal(page.data.carouselTouching, true)
  page.endCarouselTouch()
  assert.equal(page.data.carouselTouching, false)
  page.toggleCarousel()
  page.onHide()
  assert.equal(page.data.carouselVisible, false)
  page.onShow()
  assert.equal(page.data.carouselPaused, true)
  page.changeSlide({ detail: { current: 2 } })
  assert.equal(page.data.currentSlide, 2)
  page.changeSlide({ detail: { current: 100 } })
  assert.equal(page.data.currentSlide, 2)
  page.onUnload()
  assert.equal(page.data.carouselVisible, false)
})

test('banner navigation is fixed and image errors retain text and action', t => {
  const page = loadPage('home')
  const previous = global.wx
  t.after(() => { global.wx = previous })
  const opened = []
  global.wx = {
    switchTab: options => opened.push(options.url), navigateTo: options => opened.push(options.url),
    navigateToMiniProgram(options) { opened.push(options.appId); options.complete() }
  }
  for (const slide of HOME_SLIDES) page.openSlide({ currentTarget: { dataset: { id: slide.id } } })
  page.openSlide({ currentTarget: { dataset: { id: 'https://untrusted.example' } } })
  assert.deepEqual(opened, ['/pages/courses/index', '/pages/reviews-tab/index', '/pages/guides/index', 'wxbd7dc59babb6d536', '/pages/beta-group/index'])
  page.bannerImageError({ currentTarget: { dataset: { id: 'resources' } } })
  assert.equal(page.data.failedImages.resources, true)
  assert.equal(page.data.slides.length, 5)
  page.bannerImageError({ currentTarget: { dataset: { id: 'hinku' } } })
  page.openSlide({ currentTarget: { dataset: { id: 'hinku' } } })
  assert.equal(opened.at(-1), 'wxbd7dc59babb6d536')
  page.openFeishuDocument()
  assert.equal(opened.at(-1), '/pages/feishu-document/index')
})

test('home and guides open the fixed hinku release homepage from a tap, including when home data is unavailable', t => {
  const previous = global.wx
  t.after(() => { global.wx = previous })
  const opened = []
  global.wx = { navigateToMiniProgram(options) { opened.push(options); options.complete() } }
  for (const name of ['home', 'guides']) {
    const page = loadPage(name)
    const event = { currentTarget: { dataset: { id: 'hinku', appId: 'untrusted', path: 'unknown' } } }
    if (name === 'home') page.openSlide(event)
    else page.openHinku(event)
    const options = opened.at(-1)
    assert.equal(options.appId, 'wxbd7dc59babb6d536')
    assert.equal(options.envVersion, 'release')
    assert.equal(Object.hasOwn(options, 'path'), false)
    const template = fs.readFileSync(path.join(root, 'miniprogram/pages', name, 'index.wxml'), 'utf8')
    if (name === 'home') {
      assert.match(template, /bindtap="openSlide"/)
      assert.doesNotMatch(template, /hinku-entry/)
      assert.ok(template.indexOf('bindtap="openSlide"') < template.indexOf('<state-view'))
      assert.match(page.data.slides[3].description, /课表 · 班车 · 校园卡余额 · 电费/)
    } else {
      assert.match(template, /bindtap="openHinku"/)
      assert.match(template, /课表 · 班车 · 校园卡余额 · 电费/)
    }
  }
  assert.equal(opened.length, 2)
})

test('hinku navigation suppresses repeated taps, allows retry, and handles cancellation or unsupported WeChat', t => {
  const previous = global.wx
  t.after(() => { global.wx = previous })
  const page = loadPage('home')
  const opened = [], toasts = []
  global.wx = { navigateToMiniProgram: options => opened.push(options), showToast: options => toasts.push(options) }
  page.openHinku()
  page.openHinku()
  assert.equal(opened.length, 1)
  try {
    opened[0].fail({ errMsg: 'navigateToMiniProgram:fail cancel' })
    assert.equal(toasts.length, 0)
  } finally { opened[0].complete() }
  page.openHinku()
  assert.equal(opened.length, 2)
  try {
    opened[1].fail({ errMsg: 'internal error details' })
    assert.match(toasts.at(-1).title, /暂时无法打开 hinku/)
    assert.doesNotMatch(toasts.at(-1).title, /internal/)
  } finally { opened[1].complete() }
  delete global.wx.navigateToMiniProgram
  page.openHinku()
  assert.match(toasts.at(-1).title, /更新微信/)
})

test('Feishu entry copies the exact original URL without mirroring or embedded web-view', t => {
  const page = loadPage('feishu-document')
  const previous = global.wx
  t.after(() => { global.wx = previous })
  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  assert.ok(app.pages.includes('pages/feishu-document/index'))
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/feishu-document/index.wxml'), 'utf8')
  assert.doesNotMatch(template, /<web-view/)
  assert.match(template, /user-select="\{\{true\}\}"/)
  const homeTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/home/index.wxml'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/pages/feishu-document/index.json'), 'utf8'))
  const title = 'NKU 计网 软件 人智大类生存手册'
  assert.ok(homeTemplate.includes(title))
  assert.ok(template.includes(title))
  assert.equal(config.navigationBarTitleText, title)
  assert.match(homeTemplate, /感谢编写手册的学长/)
  assert.match(template, /感谢参与本手册编写、整理与持续完善的各位学长/)
  let calls = 0
  let clipboard
  global.wx = { setClipboardData(options) { calls++; clipboard = options } }
  page.copyLink()
  page.copyLink()
  assert.equal(calls, 1)
  assert.equal(clipboard.data, 'https://nankai.feishu.cn/wiki/O36Dw5fQVibzsnkx4ptcZreDnAf')
  clipboard.success()
  clipboard.complete()
  assert.equal(page.data.copied, true)
  assert.equal(page.data.copying, false)
  page.copyLink()
  clipboard.fail()
  clipboard.complete()
  assert.equal(page.data.copied, false)
  assert.match(page.data.copyError, /复制失败/)
  assert.equal(page.data.copying, false)
})
