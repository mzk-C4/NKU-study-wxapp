// Development fixtures, never a knowledge base or a model evaluation result.
function createMockApi() {
  return {
    async askGuideAssistant(input = {}) {
      const question = String(input.question || '')
      const failures = { '[400]': [400, 'INVALID_AI_QUESTION'], '[401]': [401, 'AUTH_REQUIRED'],
        '[429]': [429, 'RATE_LIMITED'], '[503]': [503, 'AI_UNAVAILABLE'], '[断网]': [0, 'NETWORK_ERROR'] }
      for (const marker of Object.keys(failures)) {
        if (question.includes(marker)) {
          const [statusCode, code] = failures[marker]
          throw Object.assign(new Error('模拟异常'), { statusCode, code })
        }
      }
      const refused = /资料不足|宿舍|冲突/.test(question)
      return {
        refused, reason: refused ? (question.includes('冲突') ? 'SOURCE_CONFLICT' : 'INSUFFICIENT_EVIDENCE') : '',
        answer: refused ? '【模拟回答】现有材料不足或存在冲突，请补充校区、学院、入学年份及相关文件。'
          : '【模拟回答】页面已收到你的问题。真实回答将根据已核验的指南生成，并在下方列出来源。此内容仅用于交互联调，不代表学校规定。',
        guide_id: '', applicable_scope: '开发联调示例', freshness_notice: '模拟数据，不代表模型效果或最新政策。',
        citations: [{ id: 'mock-source', title: '南开大学首页（模拟来源操作）',
          official_page_url: 'https://www.nankai.edu.cn', file_url: '', file_type: '', publisher: '开发联调示例' }]
      }
    }
  }
}

module.exports = { createMockApi }
