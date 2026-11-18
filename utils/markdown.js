/**
 * 轻量 Markdown 解析器（小程序专用）
 * 将 Markdown 文本解析为结构化节点数组，供 md-view 组件渲染。
 * 支持：标题(#/##/###)、加粗(**)、斜体(*)、行内代码(`)、链接([t](url))、
 *       无序列表(-/*)、有序列表(1.)、代码块(```)、引用(>)、分割线(---)。
 *
 * 设计目标：
 *  - 输出与现有小程序设计变量（紫/金/纸色）解耦，由 md-view 负责样式；
 *  - 纯函数，无 wx / DOM 依赖，可在 Node 中单测。
 */

/**
 * 解析行内格式：text / strong / em / code / link
 * @param {string} text
 * @returns {Array<{t:string,text:string,url?:string}>}
 */
function parseInline(text) {
  const spans = []
  let buf = ''
  let i = 0
  const flush = () => {
    if (buf) { spans.push({ t: 'text', text: buf }); buf = '' }
  }
  while (i < text.length) {
    const c = text[i]
    // 行内代码 `code`
    if (c === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        flush(); spans.push({ t: 'code', text: text.slice(i + 1, end) }); i = end + 1; continue
      }
    }
    // 加粗 **bold**
    if (c === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        flush(); spans.push({ t: 'strong', text: text.slice(i + 2, end) }); i = end + 2; continue
      }
    }
    // 斜体 *em*
    if (c === '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1 && end > i + 1) {
        flush(); spans.push({ t: 'em', text: text.slice(i + 1, end) }); i = end + 1; continue
      }
    }
    // 链接 [text](url)
    if (c === '[') {
      const closeB = text.indexOf(']', i + 1)
      const openP = closeB !== -1 ? text.indexOf('(', closeB + 1) : -1
      const closeP = openP !== -1 ? text.indexOf(')', openP + 1) : -1
      if (closeP !== -1) {
        flush()
        spans.push({ t: 'link', text: text.slice(i + 1, closeB), url: text.slice(openP + 1, closeP) })
        i = closeP + 1; continue
      }
    }
    buf += c; i++
  }
  flush()
  return spans
}

/**
 * 将 Markdown 解析为节点数组
 * @param {string} md
 * @returns {Array<object>}
 */
function parseMarkdown(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const nodes = []
  let i = 0
  const isSpecial = (s) =>
    /^```/.test(s.trim()) ||
    /^(#{1,3})\s+/.test(s) ||
    /^>\s?/.test(s) ||
    /^(\s*)([-*+]|\d+\.)\s+/.test(s) ||
    /^(\-{3,}|\*{3,})$/.test(s.trim())

  while (i < lines.length) {
    const line = lines[i]

    // 代码块
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim()
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++ }
      i++ // 跳过结束 ```
      nodes.push({ type: 'code', lang, text: buf.join('\n') })
      continue
    }

    // 空行
    if (line.trim() === '') { i++; continue }

    // 分割线
    if (/^(\-{3,}|\*{3,})$/.test(line.trim())) { nodes.push({ type: 'hr' }); i++; continue }

    // 标题
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      nodes.push({ type: 'h' + level, spans: parseInline(h[2]) })
      i++; continue
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, '')); i++
      }
      nodes.push({ type: 'blockquote', spans: parseInline(buf.join(' ')) })
      continue
    }

    // 列表
    if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items = []
      while (i < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/)
        items.push(parseInline(m[3]))
        i++
      }
      nodes.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }

    // 段落：聚合连续普通行
    const buf = [line]
    i++
    while (i < lines.length && lines[i].trim() !== '' && !isSpecial(lines[i])) {
      buf.push(lines[i]); i++
    }
    nodes.push({ type: 'p', spans: parseInline(buf.join(' ')) })
  }
  return nodes
}

module.exports = { parseMarkdown, parseInline }
