function normalizeDisplayText(value) {
  return String(value == null ? '' : value)
    .replace(/&(nbsp|#0*160|#x0*a0|8nbsp);?/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ {2,}/g, ' ')
}

function escapeHtml(value) {
  return normalizeDisplayText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function validHttpsUrl(value) {
  const url = String(value || '').trim()
  return /^https:\/\/[^\s<>]+$/i.test(url) ? url : ''
}

const INLINE_PATTERN = /(\[[^\]]+\]\([^\s)]+\))|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*]+\*)|(`[^`]+`)/g

function parseInlineRuns(value) {
  const source = normalizeDisplayText(value)
  const runs = []
  let lastIndex = 0
  let match
  INLINE_PATTERN.lastIndex = 0
  while ((match = INLINE_PATTERN.exec(source)) !== null) {
    if (match.index > lastIndex) runs.push({ kind: 'text', html: escapeHtml(source.slice(lastIndex, match.index)) })
    const token = match[0]
    if (match[1]) {
      const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(token)
      const href = link && validHttpsUrl(link[2])
      runs.push(href ? { kind: 'link', text: normalizeDisplayText(link[1]), href } : { kind: 'text', html: escapeHtml(link ? link[1] : token) })
    } else if (match[2]) runs.push({ kind: 'text', html: `<b>${escapeHtml(token.slice(2, -2))}</b>` })
    else if (match[3]) runs.push({ kind: 'text', html: `<s>${escapeHtml(token.slice(2, -2))}</s>` })
    else if (match[4]) runs.push({ kind: 'text', html: `<em>${escapeHtml(token.slice(1, -1))}</em>` })
    else runs.push({ kind: 'text', html: `<code>${escapeHtml(token.slice(1, -1))}</code>` })
    lastIndex = match.index + token.length
  }
  if (lastIndex < source.length) runs.push({ kind: 'text', html: escapeHtml(source.slice(lastIndex)) })
  return runs.filter(run => run.kind === 'link' || run.html).map((run, index) => ({ id: `run-${index}`, ...run }))
}

function splitTableLine(line) {
  const source = String(line || '').trim()
  if (!source.includes('|')) return []
  const cells = source.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
  return cells.length > 1 ? cells : []
}

function isTableDivider(line) {
  const cells = splitTableLine(line)
  return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function tableCells(cells, rowIndex) {
  return cells.map((cell, cellIndex) => ({ id: `cell-${rowIndex}-${cellIndex}`, runs: parseInlineRuns(cell) }))
}

function parseMarkdown(source) {
  if (typeof source !== 'string') return []
  const lines = normalizeDisplayText(source).replace(/\r/g, '').split('\n')
  const blocks = []
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim()
    if (!line) { index += 1; continue }
    const headers = splitTableLine(line)
    if (headers.length > 1 && isTableDivider(lines[index + 1])) {
      const rows = []
      index += 2
      while (index < lines.length) {
        const cells = splitTableLine(lines[index])
        if (cells.length !== headers.length) break
        rows.push({ id: `table-row-${rows.length}`, cells: tableCells(cells, rows.length) })
        index += 1
      }
      blocks.push({ type: 'table', headers: tableCells(headers, 'head'), rows })
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    const quote = /^>\s?(.+)$/.exec(line)
    const bullet = /^[-*•]\s+(.+)$/.exec(line)
    const ordered = /^(\d+[.、)])\s*(.+)$/.exec(line)
    if (heading) blocks.push({ type: 'heading', level: heading[1].length, runs: parseInlineRuns(heading[2]) })
    else if (quote) blocks.push({ type: 'blockquote', runs: parseInlineRuns(quote[1]) })
    else if (bullet) blocks.push({ type: 'list-item', listType: 'unordered', marker: '•', runs: parseInlineRuns(bullet[1]) })
    else if (ordered) blocks.push({ type: 'list-item', listType: 'ordered', marker: ordered[1], runs: [{ id: 'marker', kind: 'text', html: `<b>${escapeHtml(ordered[1])}</b> ` }, ...parseInlineRuns(ordered[2]) ] })
    else blocks.push({ type: 'paragraph', runs: parseInlineRuns(line) })
    index += 1
  }
  return blocks.map((block, index) => ({ id: `block-${index}`, ...block }))
}

module.exports = { parseMarkdown, normalizeDisplayText, validHttpsUrl }
