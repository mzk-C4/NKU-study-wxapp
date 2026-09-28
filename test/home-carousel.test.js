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

test('home has four local banners with three tabs and one registered beta group page', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const tabs = new Set(app.tabBar.list.map(item => '/' + item.pagePath))
  assert.equal(HOME_SLIDES.length, 4)
  assert.equal(new Set(HOME_SLIDES.map(item => item.id)).size, 4)
  for (const slide of HOME_SLIDES) {
    assert.ok(slide.kind === 'page' ? app.pages.includes(slide.url.slice(1)) : tabs.has(slide.url))
    assert.ok(fs.existsSync(path.join(root, 'miniprogram', slide.image)))
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
  global.wx = { switchTab: options => opened.push(options.url), navigateTo: options => opened.push(options.url) }
  for (const slide of HOME_SLIDES) page.openSlide({ currentTarget: { dataset: { id: slide.id } } })
  page.openSlide({ currentTarget: { dataset: { id: 'https://untrusted.example' } } })
  assert.deepEqual(opened, HOME_SLIDES.map(slide => slide.url))
  page.bannerImageError({ currentTarget: { dataset: { id: 'resources' } } })
  assert.equal(page.data.failedImages.resources, true)
  assert.equal(page.data.slides.length, 4)
  page.openFeishuDocument()
  assert.equal(opened.at(-1), '/pages/feishu-document/index')
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
