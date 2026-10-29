/**
 * 指南针 AI 接口适配层（HXR-COMPASS）
 * 负责：问答请求封装、模拟模式、错误归一化。
 *
 * 后端契约（沈亦皓提供）：
 *   POST /compass/ask
 *   Request:  { question, session_id, history:[{role,content}], context:{college,enroll_year,academic_year} }
 *   Response: { code:0, data:{
 *       answer, markdown, applicable_scope, timeliness,
 *       round, round_limit, session_id,
 *       sources:[{ id, title, url, snippet, category, updated_at }]
 *   }}
 *   错误：401 登录过期 / 429 限流 / 503 模型不可用 / 超时 / 网络失败
 */

const { request } = require('./api')
const config = require('../config/index')
const { MOCK_MODE, COMPASS } = config

/**
 * 发起一次问答（真实接口）
 */
function ask(payload) {
  return request({
    url: '/compass/ask',
    method: 'POST',
    data: payload
  })
}

/**
 * 模拟问答（API Key 未到位时联调用）
 * 依据问题生成符合契约结构的应答，便于前端独立开发与联调。
 */
function mockAsk(payload) {
  return new Promise((resolve) => {
    const question = (payload && payload.question || '').trim()
    const round = payload && payload.history
      ? Math.floor(payload.history.filter(m => m.role === 'user').length) + 1
      : 1

    const insufficient = /资料不足|不知道|没找到|无法回答/.test(question)

    let md, scope, timeliness, sources
    if (insufficient) {
      md = [
        '很抱歉，当前指南中**未检索到**足以回答该问题的依据。',
        '',
        '你可以补充更多条件（如学院、年级、具体场景），我会重新检索后再回答。'
      ].join('\n')
      scope = '当前问题缺少可核验的指南依据'
      timeliness = '建议以最新官方通知为准'
      sources = []
    } else {
      md = [
        `## 关于「${question}」`,
        '',
        '根据**南开大学相关指南**，处理要点如下：',
        '',
        '1. **适用范围**：面向在校本科生，需满足学籍状态正常。',
        '2. **办理流程**：先在学校官网提交申请，等待院系审核。',
        '3. **所需材料**：学生证、相关证明及申请表。',
        '',
        '> 如与学院具体通知不一致，请以学院最新要求为准。'
      ].join('\n')
      scope = '适用于南开大学全日制本科生（软件学院）'
      timeliness = '本回答依据 2025-2026 学年公开指南整理，时效性以最新通知为准'
      sources = [
        {
          id: 'src-1',
          title: '本科生学籍管理办法（2025 修订）',
          url: 'https://nkustudy.top/guide/xjgl-2025',
          snippet: '第三章 学籍变动：学生可申请缓考、休学等，须在规定时间内提交材料……',
          category: '学籍管理',
          updated_at: '2025-09-01'
        },
        {
          id: 'src-2',
          title: '软件学院办事指南 · 常见问题',
          url: 'https://nkustudy.top/guide/se-software-faq',
          snippet: '申请类事项一般需在学期第 8 周前完成，逾期顺延至下一学期……',
          category: '学院通知',
          updated_at: '2026-03-12'
        }
      ]
    }

    const answer = md
      .replace(/[#>*`]/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim()

    setTimeout(() => {
      resolve({
        answer,
        markdown: md,
        applicable_scope: scope,
        timeliness,
        round,
        round_limit: COMPASS ? COMPASS.ROUND_LIMIT : 10,
        session_id: payload ? payload.session_id : '',
        sources
      })
    }, 600)
  })
}

module.exports = {
  ask: MOCK_MODE ? mockAsk : ask,
  // 暴露模拟函数供调试与单测
  _mockAsk: mockAsk
}
