const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { buildResourceReference, sendDeadLinkReport } = require('../miniprogram/utils/resource-report')
const { showDownloadFailure } = require('../miniprogram/utils/resource-download')

test('dead-link report keeps a concise resource reference and rejects non-2xx responses', async () => {
  const originalWx = global.wx
  const resource = { title: '期末试卷.pdf', section: '历年试题' }
  assert.equal(buildResourceReference('概率论', resource), '概率论 / 历年试题 / 期末试卷.pdf')

  let request = null
  global.wx = {
    request(options) {
      request = options
      options.success({ statusCode: 503, data: {} })
    }
  }

  await assert.rejects(sendDeadLinkReport('概率论', resource, '链接打不开'), /503/)
  assert.equal(request.url, 'https://nkustudy.top/feedback-api/submit')
  assert.deepEqual(request.data, {
    title: '资源失效：期末试卷.pdf',
    content: '资源：概率论 / 历年试题 / 期末试卷.pdf\n\n链接打不开',
    type: 'content',
    contact: '',
    website: ''
  })
  global.wx = originalWx
})

test('download failure offers retry and dead-link feedback', () => {
  const originalWx = global.wx
  let reportCount = 0
  let downloadCount = 0
  let modal = null
  global.wx = {
    showModal(options) { modal = options },
    showLoading() {},
    downloadFile() { downloadCount += 1 }
  }

  const resource = { download_url: 'https://resources.nkustudy.top/resources/test.pdf' }
  const options = { onReport() { reportCount += 1 } }
  showDownloadFailure(resource, options, '网络中断。')
  assert.equal(modal.cancelText, '反馈失效')
  modal.success({ cancel: true })
  assert.equal(reportCount, 1)
  modal.success({ confirm: true })
  assert.equal(downloadCount, 1)
  global.wx = originalWx
})

test('course pages expose share cards that return to course overview', () => {
  const pages = ['course-overview', 'course-resources', 'course-reviews']
  for (const page of pages) {
    const directory = path.join(__dirname, '..', 'miniprogram', 'pages', page)
    const source = fs.readFileSync(path.join(directory, 'index.js'), 'utf8')
    const config = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8'))
    assert.match(source, /onShareAppMessage\s*\(/)
    assert.match(source, /pages\/course-overview\/index\?id=/)
    assert.equal(config.enableShareAppMessage, true)
    assert.equal(config.enableShareTimeline, true)
  }
})
