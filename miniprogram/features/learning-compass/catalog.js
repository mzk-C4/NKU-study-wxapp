const api = require('./api')
const { PDF_DOCUMENTS } = require('./documents')
const { normalizeSearchText, scatteredIncludes } = require('../../utils/search-utils')
const { highlightText } = require('../../utils/search-highlight')

const TOPICS = Object.freeze([
  { value: 'freshman', label: '新生入学', symbol: '启', tone: 'purple', description: '从报到注册、第一次选课到适应校园。' },
  { value: 'study', label: '学海无涯', symbol: '学', tone: 'gold', description: '查选课、成绩、学籍与毕业，规划下一步学习。' },
  { value: 'life', label: '在校生活', symbol: '居', tone: 'green', description: '校园生活、规则与权益，经验和正式规定分别标注。' },
  { value: 'senior', label: '学长焚决', symbol: '诀', tone: 'blue', description: '学长学姐的学习、科研与升学经验，仅供参考。' }
])
const LEGACY_TOPICS = Object.freeze({
  '选课与修读': 'study', 'course-study': 'study',
  '考试与成绩': 'study', 'exam-grade': 'study',
  '学籍与毕业': 'study', 'student-status-graduation': 'study',
  '学业拓展': 'study', 'academic-development': 'study',
  '规范与权益': 'life', 'rules-rights': 'life'
})
const SYNONYMS = [
  ['挂科', '不及格', '补考', '重修'],
  ['绩点', 'gpa', '平均学分绩点'],
  ['查分', '复查', '成绩复核', '成绩异议'],
  ['选课', '抢课', '退课', '退补选', '补退选'],
  ['转系', '转专业', '专业分流'],
  ['保研', '推免'], ['入学', '新生', '报到', '注册'],
  ['宿舍', '住宿', '寝室'], ['食堂', '吃饭', '餐饮'],
  ['人工智能', 'ai'], ['休学', '复学']
]
function topicValue(value) {
  return TOPICS.some(item => item.value === value) ? value
    : (TOPICS.find(item => item.label === value) || {}).value || LEGACY_TOPICS[value] || ''
}
function topicsFor(item) {
  const text = item.title + ' ' + (item.summary || item.description || '')
  const topics = new Set()
  if (item.kind === 'pdf') topics.add('senior')
  else topics.add(LEGACY_TOPICS[item.category_value || item.category] || 'study')
  if (/入学|新生|报到|注册|选课教程|健康地爬行/.test(text)) topics.add('freshman')
  if (/选课|课程|考试|成绩|学籍|毕业|学位|专业|辅修|科研|升学|推免|考研|竞赛|AI|学习/i.test(text)) topics.add('study')
  if (/宿舍|住宿|食堂|餐饮|校园|生活|权益|申诉|纪律|规范|健康/.test(text)) topics.add('life')
  return [...topics]
}
function present(item, kind) {
  const result = { ...item, kind, key: kind + ':' + item.id,
    summary: item.summary || item.description || '',
    sourceLabel: kind === 'pdf' ? '学生经验 · PDF' : '学校文件 · 指南'
  }
  result.topics = topicsFor(result)
  return result
}
function documents() { return PDF_DOCUMENTS.map(item => present(item, 'pdf')) }

// Never send the four UI topics as category values to the five-category production API.
async function loadCatalog(options = {}) {
  const client = options.api || api
  const cancelled = options.cancelled || (() => false)
  const items = new Map()
  for (let page = 1; page <= 100; page += 1) {
    if (cancelled()) return null
    const result = await client.getGuides({ page, page_size: 100 })
    if (cancelled()) return null
    const rows = Array.isArray(result.items) ? result.items : []
    const before = items.size
    for (const item of rows) {
      if (item && item.id && item.title) items.set(item.id, present(item, 'guide'))
    }
    const total = Number(result.total)
    if (!Number.isFinite(total) || total < 0) throw new Error('INVALID_CATALOG')
    if (items.size >= total) return [...items.values(), ...documents()]
    if (!rows.length || items.size === before) throw new Error('INCOMPLETE_CATALOG')
  }
  throw new Error('CATALOG_PAGE_LIMIT')
}
function queryGroups(query) {
  const normalized = normalizeSearchText(query).slice(0, 80)
  // Keep Chinese keywords in a natural question, and keep independent space-separated terms ANDed.
  const cleaned = normalized.replace(/请问|我想知道|我想了解|怎么才能|怎么办|怎么样|如何|怎么|请帮我|帮我|有没有|在哪里|是什么|可以吗|谢谢|吗|呢/g, ' ').trim()
  const tokens = (cleaned || normalized).split(/\s+/).filter(Boolean)
  return tokens.flatMap(token => {
    const groups = SYNONYMS.filter(group => group.some(word => token.includes(word)))
    // Exact keywords can expand; for a sentence extract known topics rather than matching filler words.
    if (groups.length && !groups.some(group => group.includes(token))) return groups
    return [[...new Set([token, ...groups.flat()])]]
  })
}
function searchCatalog(items, query = '', options = {}) {
  const normalized = normalizeSearchText(query).slice(0, 80)
  const groups = queryGroups(query)
  return items.filter(item =>
    (!options.topic || item.topics.includes(options.topic)) &&
    (!options.kind || item.kind === options.kind)
  ).map((item, index) => {
    const title = normalizeSearchText(item.title)
    const summary = normalizeSearchText(item.summary)
    const labels = normalizeSearchText(TOPICS.filter(topic => item.topics.includes(topic.value)).map(topic => topic.label).join(' '))
    let score = title === normalized && normalized ? 1000 : title.includes(normalized) && normalized ? 500 : 0
    const matched = groups.every(words => {
      let best = 0
      for (const word of words) {
        if (title.includes(word)) best = Math.max(best, 100)
        else if (summary.includes(word)) best = Math.max(best, 40)
        else if (labels.includes(word)) best = Math.max(best, 15)
        else if (word.length >= 2 && word.length <= 4 && scatteredIncludes(title, word)) best = Math.max(best, 5)
      }
      score += best
      return best > 0
    })
    return { item, index, score, matched: !normalized || matched }
  }).filter(row => row.matched).sort((a, b) => b.score - a.score || a.index - b.index).map(({ item }) => ({
    ...item,
    titleHtml: highlightText(item.title, normalized).html,
    summaryHtml: highlightText(item.summary, normalized, { allowScattered: false }).html
  }))
}
module.exports = { TOPICS, topicValue, documents, loadCatalog, searchCatalog, topicsFor, queryGroups }
