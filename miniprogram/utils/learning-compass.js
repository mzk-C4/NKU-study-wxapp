const CATEGORY_ORDER = Object.freeze([
  '选课与修读',
  '考试与成绩',
  '学籍与毕业',
  '学业拓展',
  '规范与权益'
])

const CATEGORY_INFO = Object.freeze({
  '选课与修读': Object.freeze({
    description: '包括预选、正选、补退选、重修、自修和修读学分等相关规则与流程。',
    tone: 'purple',
    symbol: '▥'
  }),
  '考试与成绩': Object.freeze({
    description: '包括考试参与、特殊考试情况、成绩、GPA、成绩复核等相关规定与流程。',
    tone: 'gold',
    symbol: '★'
  }),
  '学籍与毕业': Object.freeze({
    description: '包括注册、学籍变动、学业警示、毕业与学位等相关规则。',
    tone: 'green',
    symbol: '学'
  }),
  '学业拓展': Object.freeze({
    description: '包括转专业、辅修、微专业、学分认定和交流实践等相关信息。',
    tone: 'blue',
    symbol: '◆'
  }),
  '规范与权益': Object.freeze({
    description: '包括AI工具规范、学术诚信、考试纪律、申诉和学生权益等内容。',
    tone: 'red',
    symbol: '⚖'
  })
})

function getCategoryInfo(category) {
  return CATEGORY_INFO[category] || Object.freeze({
    description: '查看南开本科生学习事务相关的学校文件与原文内容。',
    tone: 'purple',
    symbol: '▤'
  })
}

function cleanSourceText(value, maximum = 220) {
  const source = String(value == null ? '' : value)
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!source) return ''
  return source.length > maximum ? `${source.slice(0, maximum).trim()}…` : source
}

module.exports = { CATEGORY_ORDER, CATEGORY_INFO, getCategoryInfo, cleanSourceText }
