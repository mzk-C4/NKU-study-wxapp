/**
 * 轻量 Markdown 渲染：把课程简介等 Markdown 文本解析为可渲染的块结构。
 * 支持段落、无序/有序列表行、链接、加粗、删除线和行内代码。
 * 链接输出为独立可点击片段，仅接受 https 地址；其余原样转义。
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function validHttpsUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\/[^\s]+$/i.test(value)) return ''
  return value
}

const INLINE_PATTERN = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(`[^`]+`)/g

/**
 * 把一行文本切分为 runs：
 * - { kind: 'text', html } 富文本片段（已转义，含 b/s/code 标签）
 * - { kind: 'link', text, href } 可点击链接片段
 */
function parseInlineRuns(line) {
  const runs = []
  let lastIndex = 0
  INLINE_PATTERN.lastIndex = 0
  let match
  while ((match = INLINE_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) runs.push({ kind: 'text', html: escapeHtml(line.slice(lastIndex, match.index)) })
    const token = match[0]
    if (match[1]) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      const href = linkMatch ? validHttpsUrl(linkMatch[2]) : ''
      const text = linkMatch ? linkMatch[1] : token
      runs.push(href ? { kind: 'link', text, href } : { kind: 'text', html: escapeHtml(text) })
    } else if (match[2]) {
      runs.push({ kind: 'text', html: `<b>${escapeHtml(token.slice(2, -2))}</b>` })
    } else if (match[3]) {
      runs.push({ kind: 'text', html: `<s>${escapeHtml(token.slice(2, -2))}</s>` })
    } else {
      runs.push({ kind: 'text', html: `<code>${escapeHtml(token.slice(1, -1))}</code>` })
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < line.length) runs.push({ kind: 'text', html: escapeHtml(line.slice(lastIndex)) })
  return runs.filter(run => run.kind === 'link' || run.html).map((run, index) => ({ id: index, ...run }))
}

/**
 * Markdown 文本 → 块数组。
 * 块结构：{ type: 'paragraph' | 'list-item', runs: [...] }
 * 连续列表行保持原顺序；其余非空行各成一段。
 */
function parseMarkdown(source) {
  const blocks = []
  if (typeof source !== 'string') return blocks
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    const bullet = /^[-*•]\s+(.+)$/.exec(line)
    const ordered = /^(\d+[.、)])\s*(.+)$/.exec(line)
    if (bullet) {
      blocks.push({ type: 'list-item', runs: parseInlineRuns(bullet[1]) })
    } else if (ordered) {
      const runs = [{ kind: 'text', html: `<b>${escapeHtml(ordered[1])}</b> ` }, ...parseInlineRuns(ordered[2])]
      blocks.push({ type: 'list-item', runs })
    } else if (heading) {
      blocks.push({ type: 'paragraph', runs: [{ kind: 'text', html: `<b>${escapeHtml(heading[2])}</b>` }] })
    } else {
      blocks.push({ type: 'paragraph', runs: parseInlineRuns(line) })
    }
  }
  return blocks.map((block, index) => ({ id: index, ...block }))
}

module.exports = { parseMarkdown }