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

test('guide adapter preserves versioned Feishu HTML and excludes invalid outline anchors', async () => {
  const html = '<p>正文<strong>重点</strong></p>'
  const api = createApi({ async get() { return {
    id: 'handbook-rich', content_type: 'student_experience',
    sections: [
      { id: 'body', body: '兼容正文', render_format: 'feishu-html-v1', body_html: html, body_outline: [{ id: 'fs-heading-1', title: '第一节', level: 2 }, { id: 'bad#id', title: '错误', level: 1 }] },
      { id: 'legacy', body: '旧正文', body_html: '<script>unversioned</script>' }
    ]
  } } })
  const result = await api.getGuide('handbook-rich')
  assert.equal(result.sections[0].body_html, html)
  assert.equal(result.sections[0].body, '兼容正文')
  assert.deepEqual(result.sections[0].body_outline, [{ id: 'fs-heading-1', title: '第一节', level: 2 }])
  assert.equal(result.sections[1].body_html, undefined)
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

test('only explicit conversation kinds can omit citations and suggestions remain optional', async () => {
  for (const answer_kind of ['conversation_summary', 'assistant_info']) {
    const api = createApi({ async post() { return { answer: '回顾当前对话。', refused: false, answer_kind, citations: [] } } })
    const answer = await api.askGuideAssistant({ question: '总结上文' })
    assert.equal(answer.answer_kind, answer_kind)
    assert.deepEqual(answer.follow_up_questions, [])
  }
  const invalid = createApi({ async post() { return { answer: '无来源事实', answer_kind: 'other' } } })
  await assert.rejects(invalid.askGuideAssistant({ question: '校园规则' }), { code: 'AI_UNAVAILABLE' })
})

test('legacy Feishu refusals and structured outcomes never render conflicting bodies or JSON', async () => {
  const citation = { id: 'SRC-003', title: '成绩规定', official_page_url: 'https://jwc.nankai.edu.cn/test-rules' }
  for (const answer of ['这个问题我资料库里暂时没有，不敢瞎说。', '成绩可以直接修改，但没有相关资料，不能回答。', '{"answer":"资料不足","refused":true,"reason":"INSUFFICIENT_EVIDENCE"}']) {
    const api = createApi({ async post() { return { answer, refused: false, citations: [citation], follow_up_questions: ['下一问'] } } })
    const result = await api.askGuideAssistant({ question: '成绩复核' })
    assert.equal(result.refused, true)
    assert.equal(result.reason, 'INSUFFICIENT_EVIDENCE')
    assert.deepEqual(result.citations, [])
    assert.deepEqual(result.follow_up_questions, [])
    assert.ok(!result.answer.includes('直接修改'))
    assert.ok(!result.answer.includes('{'))
  }
  for (const answer of ['[{"answer":"资料不足","refused":true}]', '{"answer":', '{"answer":"未知状态"}']) {
    const api = createApi({ async post() { return { answer, refused: false, citations: [citation] } } })
    await assert.rejects(api.askGuideAssistant({ question: '成绩复核' }), { code: 'AI_UNAVAILABLE' })
  }
  const answer = JSON.stringify({ answer: '请提交＂成绩复核申请＂。', refused: false, reason: null })
  const api = createApi({ async post() { return { answer, refused: false, citations: [citation] } } })
  assert.equal((await api.askGuideAssistant({ question: '成绩复核' })).answer, '请提交＂成绩复核申请＂。')
})
