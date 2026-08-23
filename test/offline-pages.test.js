const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const publicApi = require('../miniprogram/services/public-api')

const projectRoot = path.resolve(__dirname, '..')

function capturePage(relativePath) {
  const modulePath = require.resolve(path.join(projectRoot, relativePath))
  const previousPage = global.Page
  let definition
  global.Page = value => { definition = value }
  delete require.cache[modulePath]
  try {
    require(modulePath)
  } finally {
    delete require.cache[modulePath]
    if (previousPage === undefined) delete global.Page
    else global.Page = previousPage
  }
  return definition
}

function createPage(definition, data = {}) {
  const page = { ...definition, data: { ...JSON.parse(JSON.stringify(definition.data)), ...data } }
  page.setData = function setData(patch, callback) {
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return page
}

function replaceMethod(t, object, key, implementation) {
  const original = object[key]
  object[key] = implementation
  t.after(() => { object[key] = original })
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

function networkError() {
  const error = new Error('网络连接失败，请检查网络后重试。')
  error.code = 'NETWORK_ERROR'
  error.kind = 'network_error'
  return error
}

const homeDefinition = capturePage('miniprogram/pages/home/index.js')
const coursesDefinition = capturePage('miniprogram/pages/courses/index.js')
const overviewDefinition = capturePage('miniprogram/pages/course-overview/index.js')
const profileDefinition = capturePage('miniprogram/pages/profile/index.js')

test('real API network failures render recoverable page states while profile stays local', async t => {
  replaceMethod(t, publicApi, 'getHome', async () => { throw networkError() })
  const home = createPage(homeDefinition)
  await home.loadHome()
  assert.equal(home.data.loading, false)
  assert.equal(home.data.error, '网络连接失败，请检查网络后重试。')

  replaceMethod(t, publicApi, 'getCourses', async () => { throw networkError() })
  installWx(t, {
    showToast() {},
    getStorageSync(key) {
      assert.equal(key, 'browse_history')
      return []
    }
  })
  const courses = createPage(coursesDefinition)
  await courses.loadCourses()
  assert.equal(courses.data.loading, false)
  assert.equal(courses.data.error, '网络连接失败，请检查网络后重试。')
  assert.deepEqual(courses.data.courses, [])

  replaceMethod(t, publicApi, 'getCourse', async () => { throw networkError() })
  const overview = createPage(overviewDefinition, { id: 'course-id' })
  await overview.loadCourse()
  assert.equal(overview.data.loading, false)
  assert.equal(overview.data.error, '网络连接失败，请检查网络后重试。')
  assert.equal(overview.data.course, null)

  const profile = createPage(profileDefinition)
  profile.onShow()
  assert.deepEqual(profile.data.history, [])

  for (const page of ['home', 'courses', 'course-overview']) {
    const template = fs.readFileSync(path.join(projectRoot, `miniprogram/pages/${page}/index.wxml`), 'utf8')
    assert.match(template, /<state-view[^>]*error="\{\{error\}\}"/s, page)
    assert.match(template, /bindretry="(?:loadHome|loadCourses|loadCourse)"/, page)
  }
  const profileTemplate = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/profile/index.wxml'), 'utf8')
  const profileSource = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/profile/index.js'), 'utf8')
  assert.match(profileTemplate, /你好，南开同学/)
  assert.match(profileTemplate, /未连接线上身份与个人数据服务/)
  assert.doesNotMatch(profileSource, /publicApi|wx\.request|utils\/request/)
})
