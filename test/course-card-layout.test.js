const test = require('node:test')
const assert = require('node:assert/strict')
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

function captureCourseCard() {
  const modulePath = require.resolve(path.join(projectRoot, 'miniprogram/components/course-card/index.js'))
  const previousComponent = global.Component
  let definition
  global.Component = value => { definition = value }
  delete require.cache[modulePath]
  try {
    require(modulePath)
  } finally {
    delete require.cache[modulePath]
    if (previousComponent) global.Component = previousComponent
    else delete global.Component
  }
  return definition
}

test('course card remains a native pressed button with the original select payload', () => {
  const template = read('miniprogram/components/course-card/index.wxml')
  const definition = captureCourseCard()
  const course = { id: 'same-object' }
  const events = []

  definition.methods.select.call({
    data: { course },
    triggerEvent(name, detail) { events.push({ name, detail }) }
  })

  assert.match(template, /^\s*<button\b[^>]*class="course"/)
  assert.match(template, /^\s*<button\b[^>]*hover-class="course--pressed"/)
  assert.match(template, /<\/button>\s*$/)
  assert.equal(events.length, 1)
  assert.equal(events[0].name, 'select')
  assert.strictEqual(events[0].detail.course, course)
})

test('course card button overrides native intrinsic width and automatic margins', () => {
  const style = read('miniprogram/components/course-card/index.wxss')
  const courseRule = ruleBody(style, '.course')

  assert.match(courseRule, /(?:^|;)\s*display:\s*block\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*width:\s*100%\s*!important\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*min-width:\s*100%\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*max-width:\s*100%\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*margin:\s*0\s*!important\s*(?:;|$)/)
  assert.match(courseRule, /(?:^|;)\s*box-sizing:\s*border-box\s*(?:;|$)/)
  assert.doesNotMatch(style, /\.course\s*\+\s*\.course/)
})

test('home and courses stretch every course card and own the 20rpx list gap', () => {
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
