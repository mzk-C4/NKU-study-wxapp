const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function ruleBody(style, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = style.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing ${selector} rule`)
  return match[1]
}

function captureComponent(relativePath) {
  const modulePath = require.resolve(path.join(projectRoot, relativePath))
  const hadComponent = Object.hasOwn(global, 'Component')
  const previousComponent = global.Component
  let definition
  global.Component = value => { definition = value }
  delete require.cache[modulePath]
  try {
    require(modulePath)
  } finally {
    delete require.cache[modulePath]
    if (hadComponent) global.Component = previousComponent
    else delete global.Component
  }
  return definition
}

function installWx(t, implementation) {
  const hadWx = Object.hasOwn(global, 'wx')
  const previousWx = global.wx
  global.wx = implementation
  t.after(() => {
    if (hadWx) global.wx = previousWx
    else delete global.wx
  })
}

const tabsDefinition = captureComponent('miniprogram/components/course-detail-tabs/index.js')
const courseCardDefinition = captureComponent('miniprogram/components/course-card/index.js')

function selectTab(data, tab) {
  tabsDefinition.methods.selectTab.call({ data }, { currentTarget: { dataset: { tab } } })
}

test('course detail tabs expose only the minimal page-owned inputs', () => {
  assert.deepEqual(Object.keys(tabsDefinition.properties), ['courseId', 'active', 'resourceCount', 'reviewCount'])
  assert.equal(tabsDefinition.properties.courseId.type, String)
  assert.equal(tabsDefinition.properties.active.value, 'overview')
})

test('course detail tabs map all routes and encode dynamic course ids', t => {
  const redirects = []
  installWx(t, { redirectTo(options) { redirects.push(options) } })
  const courseId = 'course/ 1?'

  selectTab({ courseId, active: 'resources' }, 'overview')
  selectTab({ courseId, active: 'overview' }, 'resources')
  selectTab({ courseId, active: 'overview' }, 'reviews')

  assert.deepEqual(redirects, [
    { url: '/pages/course-overview/index?id=course%2F%201%3F' },
    { url: '/pages/course-resources/index?id=course%2F%201%3F' },
    { url: '/pages/course-reviews/index?id=course%2F%201%3F' }
  ])
})

test('course detail tabs do not redirect the active tab or an empty course id', t => {
  const redirects = []
  installWx(t, { redirectTo(options) { redirects.push(options) } })

  selectTab({ courseId: 'course-id', active: 'overview' }, 'overview')
  selectTab({ courseId: '', active: 'overview' }, 'resources')
  selectTab({ courseId: '', active: 'overview' }, 'reviews')

  assert.deepEqual(redirects, [])
})

test('all three detail pages have one shared tab and no local tab owner', () => {
  const app = JSON.parse(read('miniprogram/app.json'))
  assert.equal(app.usingComponents['course-detail-tabs'], 'components/course-detail-tabs/index')

  for (const page of ['course-overview', 'course-resources', 'course-reviews']) {
    const pageRoot = `miniprogram/pages/${page}/index`
    const template = read(`${pageRoot}.wxml`)
    const style = read(`${pageRoot}.wxss`)
    const script = read(`${pageRoot}.js`)
    assert.equal((template.match(/<course-detail-tabs(?:\s|>)/g) || []).length, 1, page)
    assert.match(template, /resource-count="{{course\.resource_count \|\| 0}}"/, page)
    assert.match(template, /review-count="{{course\.review_count \|\| 0}}"/, page)
    assert.doesNotMatch(style, /\.(?:detail-tabs|detail-tab|detail-tab--active)(?=[\s,{:#>+~])/, page)
    assert.doesNotMatch(script, /\bopenTab\s*\(/, page)
  }

  const sharedTemplate = read('miniprogram/components/course-detail-tabs/index.wxml')
  const sharedStyle = read('miniprogram/components/course-detail-tabs/index.wxss')
  assert.equal((sharedTemplate.match(/<button\b/g) || []).length, 3)
  assert.doesNotMatch(sharedTemplate, /\bdisabled=/)
  assert.equal((sharedTemplate.match(/hover-class="detail-tab--pressed"/g) || []).length, 3)
  assert.match(sharedStyle, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(sharedStyle, /\.detail-tab\s*\{[^}]*min-width:\s*0;/)
  assert.match(read('miniprogram/components/course-detail-tabs/index.js'), /tab === this\.data\.active/)
})

test('course card keeps its select contract and uses one native pressed button', () => {
  const template = read('miniprogram/components/course-card/index.wxml')
  const style = read('miniprogram/components/course-card/index.wxss')
  const course = { id: 'same-object' }
  const events = []

  courseCardDefinition.methods.select.call({
    data: { course },
    triggerEvent(name, detail) { events.push({ name, detail }) }
  })

  assert.deepEqual(Object.keys(courseCardDefinition.properties), ['course'])
  assert.equal(courseCardDefinition.properties.course, Object)
  assert.match(template, /^\s*<button\b[^>]*class="course"/)
  assert.match(template, /^\s*<button\b[^>]*hover-class="course--pressed"/)
  assert.match(template, /<\/button>\s*$/)
  assert.equal(events.length, 1)
  assert.equal(events[0].name, 'select')
  assert.strictEqual(events[0].detail.course, course)
  assert.doesNotMatch(style, /\.course\s*\+\s*\.course/)
})

test('course card native button owns an explicit full-width box contract', () => {
  const style = read('miniprogram/components/course-card/index.wxss')
  const courseRule = ruleBody(style, '.course')

  assert.doesNotMatch(style, /:host\s*\{/)
  assert.match(courseRule, /(?:^|;)\s*display:\s*block\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*width:\s*100%\s*!important\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*min-width:\s*100%\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*max-width:\s*100%\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*margin:\s*0\s*!important\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*box-sizing:\s*border-box\s*(?:;|$)/)
})

test('home and course list pages own the host width and component spacing', () => {
  for (const page of ['home', 'courses']) {
    const template = read(`miniprogram/pages/${page}/index.wxml`)
    const style = read(`miniprogram/pages/${page}/index.wxss`)
    const hostRule = ruleBody(style, 'course-card')
    assert.match(template, /<view class="course-list"[^>]*><course-card\b[^>]*wx:for=/, page)
    assert.match(hostRule, /(?:^|;)\s*display:\s*block\s*(?:;|$)/, page)
    assert.match(hostRule, /(?:^|;)\s*align-self:\s*stretch\s*(?:;|$)/, page)
    assert.match(hostRule, /(?:^|;)\s*width:\s*100%\s*(?:;|$)/, page)
    assert.match(hostRule, /(?:^|;)\s*box-sizing:\s*border-box\s*(?:;|$)/, page)
    assert.match(style, /\.course-list\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*20rpx;/, page)
  }
})

test('B-1 page interaction coverage remains byte-for-byte unchanged', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'test/page-interaction.test.js'))
  const hash = crypto.createHash('sha256').update(source).digest('hex').toUpperCase()
  assert.equal(hash, 'A923A4F944F00571BD616ADE4E0BAB7A1355678D6FFCC360075CD236CB29A3B8')
})
