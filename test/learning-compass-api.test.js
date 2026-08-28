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

test('production AI uses required authentication, numeric admission year and R2 citations', async () => {
  const calls = []
  const api = createApi({
    get() { throw new Error('not used') },
    async post(path, body, options) {
      calls.push({ path, body, options })
      return {
        refused: false,
        answer: '生产回答',
        citations: [{
          id: 'SRC-003', title: '考试与成绩管理规定', file_type: 'pdf',
          file_url: 'https://resources.nkustudy.top/guide-sources/rules.pdf'
        }]
      }
    }
  }, { apiProfile: 'production' })

  const result = await api.askGuideAssistant({
    question: '成绩复核怎么办？',
    profile: { admission_year: '２０２５', major: '计算机科学与技术' }
  })

  assert.equal(calls[0].path, '/guide-assistant/answers')
  assert.deepEqual(calls[0].options, { timeout: 30000, auth: 'required' })
  assert.deepEqual(calls[0].body.profile, { admission_year: 2025, major: '计算机科学与技术' })
  assert.equal(result.citations[0].file_url, 'https://resources.nkustudy.top/guide-sources/rules.pdf')
})

test('reference AI request is bounded, authenticated and maps citations', async () => {
  const calls = []
  const api = createApi({
    get() { throw new Error('not used') },
    async post(path, body, options) {
      calls.push({ path, body, options })
      return {
        refused: false,
        answer: '请按规定申请成绩复核。',
        citations: [{
          id: 'SRC-003',
          title: '考试与成绩管理规定',
          file_type: 'pdf',
          file_url: '/__local__/learning-compass/source-files/SRC-003'
        }]
      }
    }
  }, { apiProfile: 'reference' })

  const result = await api.askGuideAssistant({
    question: '  成绩复核怎么办？  ',
    history: [{ role: 'user', content: '  前一个问题  ' }],
    profile: { admission_year: '２０２５', major: '  计算机科学与技术  ' }
  })

  assert.equal(calls[0].path, '/guide-assistant/answers')
  assert.equal(calls[0].options.timeout, 30000)
  assert.equal(calls[0].options.auth, 'required')
  assert.deepEqual(calls[0].body.profile, { admission_year: 2025, major: '计算机科学与技术' })
  assert.equal(result.citations[0].file_url, 'http://127.0.0.1:3000/__local__/learning-compass/source-files/SRC-003')
})
