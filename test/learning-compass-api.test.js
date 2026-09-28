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
  test(apiProfile + ' AI is disabled locally without any network request', async () => {
    let requests = 0
    const api = createApi({
      get() { requests++; throw new Error('unexpected GET') },
      post() { requests++; throw new Error('unexpected POST') }
    }, { apiProfile })
    await assert.rejects(api.askGuideAssistant({
      question: '成绩复核怎么办？',
      history: [{ role: 'user', content: '之前的问题' }]
    }), error => error.code === 'FEATURE_REMOVED' && /已移除/.test(error.message))
    assert.equal(requests, 0)
  })
}
