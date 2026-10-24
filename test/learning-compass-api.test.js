const test = require('node:test')
const assert = require('node:assert/strict')

const { createApi } = require('../miniprogram/features/learning-compass/api')

test('guide adapter maps five-category queries and reference source files', async () => {
  const calls = []
  const client = {
    async get(path, query) {
      calls.push({ method: 'GET', path, query })
      if (path === '/guides') {
        return {
          items: [{ id: 'guide-1', title: '指南一', category: 'course-study' }],
          total: 1,
          page: 1,
          page_size: 20,
          facets: { categories: [{ value: 'course-study', label: '选课与修读', count: 3, order: 1 }] }
        }
      }
      return {
        id: 'guide-1',
        title: '指南一',
        category: 'course-study',
        sections: [{ id: 'section-1', title: '原文', body: '逐字内容', source_ids: ['SRC-001'] }],
        sources: [{ id: 'SRC-001', title: '学生手册', file_type: 'pdf', file_url: '/__local__/learning-compass/source-files/SRC-001' }]
      }
    }
  }
  const api = createApi(client, { apiProfile: 'reference' })

  const list = await api.getGuides({ category: '选课与修读' })
  const detail = await api.getGuide('guide-1')

  assert.equal(calls[0].query.category, 'course-study')
  assert.equal(list.items[0].category, '选课与修读')
  assert.equal(list.facets.category_options[0].count, 3)
  assert.equal(detail.sections[0].body, '逐字内容')
  assert.equal(detail.sources[0].file_url, 'http://127.0.0.1:3000/__local__/learning-compass/source-files/SRC-001')
})

for (const apiProfile of ['production', 'reference']) {
  test(apiProfile + ' AI uses authenticated non-streaming requests and maps sources', async () => {
    const calls = []
    const api = createApi({
      async post(path, data, options) {
        calls.push({ path, data, options })
        return { answer: '请向开课单位核实办理方式。', refused: false,
          citations: [{ id: 'SRC-003', title: '成绩规定', official_page_url: 'https://jwc.nankai.edu.cn/test-rules' }] }
      }
    }, { apiProfile })
    const response = await api.askGuideAssistant({
      question: '成绩复核怎么办？',
      profile: { admission_year: 2025, major: '计算机科学与技术' },
      history: [{ role: 'user', content: '之前的问题' }]
    })
    assert.equal(calls[0].path, '/guide-assistant/answers')
    assert.deepEqual(calls[0].options, { auth: 'required', timeout: 30000 })
    assert.equal(calls[0].data.profile.admission_year, 2025)
    assert.equal(response.citations[0].id, 'SRC-003')
  })
}

test('empty answers, missing evidence and unknown refusal reasons are unavailable', async () => {
  for (const value of [{ answer: '' }, { answer: '无来源结论' },
    { refused: true, answer: '拒答', reason: 'UNKNOWN' },
    { answer: '错误资源', citations: [{ id: 'x', title: 'x', file_url: 'http://127.0.0.1/private' }] }]) {
    const api = createApi({ async post() { return value } }, { apiProfile: 'production' })
    await assert.rejects(api.askGuideAssistant({ question: '问题' }), { code: 'AI_UNAVAILABLE' })
  }
})
