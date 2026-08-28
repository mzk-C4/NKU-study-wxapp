const test = require('node:test')
const assert = require('node:assert/strict')
const { parseMarkdown } = require('../miniprogram/utils/markdown')

const SAMPLE = [
  '高数A为理工科类学生的通识必修课，是绕不过的一座大山。',
  '平时期末46分，闭卷考核，不能带计算器。',
  '- [考研竞赛凯哥-哔哩哔哩](https://space.bilibili.com/42428180)',
  '当然如果你想速通不挂科还是比较容易的，~~毕竟你不能说你学了连35分都考不了吧~~',
  '重点参考 **课程大纲** 与 `期末考试题`'
].join('\n')

test('parses paragraphs, list items and inline styles from production course text', () => {
  const blocks = parseMarkdown(SAMPLE)
  assert.equal(blocks.length, 5)

  assert.equal(blocks[0].type, 'paragraph')
  assert.equal(blocks[0].runs[0].html.includes('通识必修课'), true)

  const listItem = blocks[2]
  assert.equal(listItem.type, 'list-item')
  assert.equal(listItem.runs[0].kind, 'link')
  assert.equal(listItem.runs[0].text, '考研竞赛凯哥-哔哩哔哩')
  assert.equal(listItem.runs[0].href, 'https://space.bilibili.com/42428180')

  const strike = blocks[3].runs.find(run => run.kind === 'text' && run.html.includes('<s>'))
  assert.notEqual(strike, undefined)
  assert.equal(strike.html.includes('<s>毕竟你不能说你学了连35分都考不了吧</s>'), true)

  assert.equal(blocks[4].runs.some(run => run.html.includes('<b>课程大纲</b>')), true)
  assert.equal(blocks[4].runs.some(run => run.html.includes('<code>期末考试题</code>')), true)
})

test('renders numbered lines as emphasized list items', () => {
  const blocks = parseMarkdown('主要有三项内容：\n1.出勤，每节课都会有签到\n2.随堂小测两次与课堂展示二选一\n三项内容全部合格即可通过')
  assert.equal(blocks[0].type, 'paragraph')
  assert.equal(blocks[1].type, 'list-item')
  assert.equal(blocks[1].runs[0].html, '<b>1.</b> ')
  assert.equal(blocks[1].runs[1].html, '出勤，每节课都会有签到')
  assert.equal(blocks[2].type, 'list-item')
  // 分点后的普通说明保持为独立段落
  assert.equal(blocks[3].type, 'paragraph')
  assert.equal(blocks[3].runs[0].html, '三项内容全部合格即可通过')
})

test('rejects non-https links and escapes html in text runs', () => {
  const blocks = parseMarkdown('[危险](http://example.com) 与 <script>alert(1)</script>')
  assert.equal(blocks[0].runs.some(run => run.kind === 'link'), false)
  const html = blocks[0].runs.map(run => run.html || '').join('')
  assert.equal(html.includes('<script>'), false)
  assert.equal(html.includes('&lt;script&gt;'), true)
})

test('returns empty blocks for empty or non-string input', () => {
  assert.deepEqual(parseMarkdown(''), [])
  assert.deepEqual(parseMarkdown(null), [])
  assert.deepEqual(parseMarkdown(undefined), [])
})
test('parses headings, blockquotes, ordered lists and complete markdown tables', () => {
  const blocks = parseMarkdown([
    '# 标题',
    '> 引用 **重点**',
    '- 无序项 *强调*',
    '1) 有序项 `代码`',
    '| 项目 | 说明 |',
    '| --- | --- |',
    '| **GPA** | [官方说明](https://nkustudy.top/rules) |'
  ].join('\n'))

  assert.equal(blocks[0].type, 'heading')
  assert.equal(blocks[0].level, 1)
  assert.equal(blocks[1].type, 'blockquote')
  assert.match(blocks[1].runs.map(run => run.html || '').join(''), /<b>重点<\/b>/)
  assert.deepEqual(blocks.slice(2, 4).map(block => block.listType), ['unordered', 'ordered'])
  assert.match(blocks[3].runs.map(run => run.html || '').join(''), /<code>代码<\/code>/)

  const table = blocks[4]
  assert.equal(table.type, 'table')
  assert.equal(table.headers.length, 2)
  assert.equal(table.rows.length, 1)
  assert.match(table.rows[0].cells[0].runs[0].html, /<b>GPA<\/b>/)
  assert.deepEqual(table.rows[0].cells[1].runs[0], {
    id: 'run-0', kind: 'link', text: '官方说明', href: 'https://nkustudy.top/rules'
  })
})

test('normalizes nbsp entities and never turns unsafe links or HTML into rich content', () => {
  const blocks = parseMarkdown('甲&nbsp;乙 &#160;丙 &#xA0;丁 &8nbsp;戊\n[HTTP](http://example.com) [JS](javascript:alert(1)) <img src=x onerror=alert(1)>')
  const text = blocks[0].runs.map(run => run.html || '').join('')
  assert.equal(text.includes('&nbsp;'), false)
  assert.match(text, /甲 乙 丙 丁 戊/)
  assert.equal(blocks[1].runs.some(run => run.kind === 'link'), false)
  const unsafe = blocks[1].runs.map(run => run.html || '').join('')
  assert.match(unsafe, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.equal(unsafe.includes('<img'), false)
})
