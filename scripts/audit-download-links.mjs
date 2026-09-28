// Read-only public download audit. No authentication, uploads or production writes.
// Generated reports are local artifacts, excluded from the mini-program package.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { PDF_DOCUMENTS } = require('../miniprogram/features/learning-compass/documents.js')
const api = 'https://nkustudy.top/api/v1'
const startedAt = new Date().toISOString()
const output = path.join(root, 'reports', `download-audit-${startedAt.replace(/[:.]/g, '-')}`)
fs.mkdirSync(output, { recursive: true })
const records = [], enumerationErrors = [], results = []
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let pauseUntil = 0
async function pool(items, action) {
  let index = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (index < items.length) {
      await sleep(Math.max(180, pauseUntil - Date.now()))
      const current = index++
      if (current < items.length) await action(items[current], current)
    }
  }))
}
async function getData(route) {
  let failure
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(api + route, { signal: AbortSignal.timeout(20000), redirect: 'error' })
      if (response.status === 429) { pauseUntil = Date.now() + 10000; await sleep(10000) }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`) }
      const json = await response.json()
      if (json.code !== 0 || !json.data) throw new Error('Invalid public API response')
      return json.data
    } catch (error) { failure = error; if (attempt < 2) await sleep(1000) }
  }
  throw failure
}
async function listAll(route) {
  const first = await getData(`${route}?page=1&page_size=100`)
  const items = [...first.items]
  for (let page = 2; page <= Math.ceil(first.total / 100); page++) {
    const next = await getData(`${route}?page=${page}&page_size=100`)
    items.push(...next.items)
  }
  if (new Set(items.map(item => item.id)).size !== first.total) throw new Error(`${route}: incomplete or changing pagination`)
  return items
}
function add(record) {
  // Only public, unsigned download URLs are written to the report.
  const url = record.url || ''
  if (url.includes('?') || url.includes('@')) {
    records.push({ ...record, url: '', invalidReason: 'query_or_credentials_not_audited' })
  } else records.push(record)
}
function sources(data, owner) {
  for (const source of data.sources || []) {
    if (source.file_url) add({ kind: 'guide', owner, id: source.id, title: source.title, extension: source.file_type, url: source.file_url })
  }
}
function allowed(url) {
  return typeof url === 'string' && /^https:\/\/resources\.nkustudy\.top\//i.test(url) && !/[\s\\@]/.test(url)
}
async function probe(url) {
  let target = url
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!allowed(target)) return { state: 'blocked_url', status: null }
    const response = await fetch(target, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Range: 'bytes=0-63', Referer: 'https://servicewechat.com/wx4fe2a7554180e903/1/page-frame.html' }
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) return { state: 'invalid_redirect', status: response.status }
      target = new URL(location, target).href
      continue
    }
    const contentType = response.headers.get('content-type') || ''
    const range = response.headers.get('content-range') || ''
    const lengthHeader = response.headers.get('content-length')
    const size = /\/(\d+)$/.exec(range)?.[1] || (response.status === 200 ? lengthHeader : null)
    const outcome = { status: response.status, contentType, size: size === null ? null : Number(size), redirects }
    if (![200, 206].includes(response.status)) {
      await response.body?.cancel()
      if (response.status === 429) pauseUntil = Date.now() + 10000
      return { ...outcome, state: [404, 410].includes(response.status) ? 'missing' : 'http_error' }
    }
    const reader = response.body.getReader()
    let prefix = Buffer.alloc(0)
    try {
      while (prefix.length < 64) {
        const chunk = await reader.read()
        if (chunk.done) break
        prefix = Buffer.concat([prefix, Buffer.from(chunk.value).subarray(0, 64 - prefix.length)])
      }
    } finally { await reader.cancel() }
    const text = prefix.toString('utf8').trimStart().toLowerCase()
    let state = 'reachable'
    if (!prefix.length) state = 'empty_body'
    else if (/text\/html|application\/(?:json|xml)|text\/xml/i.test(contentType) || /^<!doctype html|^<html|^<\?xml/.test(text)) state = 'unexpected_content'
    return { ...outcome, state, prefixHex: prefix.subarray(0, 8).toString('hex'), prefixBytes: prefix.length }
  }
  return { state: 'too_many_redirects', status: null }
}
const counts = () => results.reduce((sum, item) => { sum[item.state] = (sum[item.state] || 0) + 1; return sum }, {})
function checkpoint(extra = {}) {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ startedAt, updatedAt: new Date().toISOString(), method: 'Range GET bytes=0-63, four workers, retry non-success once; no full-file integrity or device verification', ...extra, enumerationErrors, recordCount: records.length, counts: counts(), records, results }, null, 2))
}

console.log(`REPORT_DIR ${output}`)
const courses = await listAll('/courses')
let enumerated = 0
await pool(courses, async course => {
  try {
    const data = await getData(`/courses/${encodeURIComponent(course.id)}/resources`)
    if (!Array.isArray(data.items) || data.total !== data.items.length) throw new Error('Incomplete resource list')
    for (const item of data.items) add({ kind: 'course', owner: course.name, courseId: course.id, id: item.id, title: item.title, section: item.section, extension: item.extension, declaredSize: item.size, url: item.download_url })
  } catch (error) { enumerationErrors.push({ kind: 'course', id: course.id, owner: course.name, error: error.name + ': ' + error.message }) }
  if (++enumerated % 50 === 0) { checkpoint({ courseCount: courses.length, enumerated }); console.log(`COURSES ${enumerated}/${courses.length} RECORDS ${records.length}`) }
})
const guides = await listAll('/guides')
await pool(guides, async guide => {
  try {
    const data = await getData(`/guides/${encodeURIComponent(guide.id)}`)
    sources(data, guide.title)
    for (const variant of data.variants || []) {
      const variantId = variant.id || variant.variant_id
      if (!variantId) throw new Error('Missing variant ID')
      const detail = await getData(`/guides/${encodeURIComponent(guide.id)}/variants/${encodeURIComponent(variantId)}`)
      sources(detail, `${guide.title} / ${variant.title || variantId}`)
    }
  } catch (error) { enumerationErrors.push({ kind: 'guide', id: guide.id, owner: guide.title, error: error.name + ': ' + error.message }) }
})
for (const item of PDF_DOCUMENTS) add({ kind: 'bundled-guide', owner: item.title, id: item.id, title: item.title, extension: item.file_type, url: item.file_url })
const groups = new Map()
for (const item of records) {
  const key = item.url || `invalid:${item.kind}:${item.id}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(item)
}
console.log(`ENUMERATION_DONE courses=${courses.length} guides=${guides.length} records=${records.length} unique=${groups.size} errors=${enumerationErrors.length}`)
let checked = 0
await pool([...groups.entries()], async ([url, references]) => {
  let outcome, firstAttempt
  for (let attempt = 0; attempt < 2; attempt++) {
    try { outcome = allowed(url) ? await probe(url) : { state: 'blocked_url', status: null } }
    catch (error) { outcome = { state: 'network_error', status: null, error: error.cause?.code || error.name } }
    if (attempt === 0) firstAttempt = outcome
    if (outcome.state === 'reachable' || outcome.state === 'blocked_url') break
    if (!attempt) await sleep(Math.max(1000, pauseUntil - Date.now()))
  }
  const warnings = []
  if (outcome.state === 'reachable') {
    if (outcome.size > 200 * 1024 * 1024) warnings.push('over_wechat_200mb_limit')
    if (references.some(item => Number(item.declaredSize) > 0 && outcome.size !== null && Number(item.declaredSize) !== outcome.size)) warnings.push('metadata_size_mismatch')
    if (references.some(item => String(item.extension).toLowerCase() === 'pdf') && !outcome.prefixHex?.startsWith('255044462d')) warnings.push('pdf_signature_unconfirmed')
  }
  results.push({ url: references[0].url, ...outcome, firstAttempt, warnings, references })
  if (++checked % 50 === 0 || checked === groups.size) {
    checkpoint({ courseCount: courses.length, guideCount: guides.length, uniqueLinks: groups.size, checked })
    console.log(`CHECKED ${checked}/${groups.size} ${JSON.stringify(counts())}`)
  }
})
const summary = { courseCount: courses.length, guideCount: guides.length, uniqueLinks: groups.size, checked, completedAt: new Date().toISOString(), complete: enumerationErrors.length === 0 }
checkpoint(summary)
const issues = results.filter(item => item.state !== 'reachable' || item.warnings.length)
const csv = value => `"${String(value ?? '').replace(/"/g, '""')}"`
const rows = [['类型', '课程或指南', '资料', '资源ID', '检查结果', 'HTTP', '警告', '下载链接']]
for (const item of issues) for (const ref of item.references) rows.push([ref.kind, ref.owner, ref.title, ref.id, item.state, item.status, item.warnings.join(';'), item.url])
fs.writeFileSync(path.join(output, 'issues.csv'), '\ufeff' + rows.map(row => row.map(csv).join(',')).join('\r\n'))
fs.writeFileSync(path.join(output, 'summary.md'), `# 下载链接检查\n\n时间：${startedAt} ～ ${summary.completedAt}\n\n课程：${courses.length}；线上指南：${guides.length}；本机指南：${PDF_DOCUMENTS.length}；资源引用：${records.length}；去重链接：${groups.size}。\n\n结果：${JSON.stringify(counts())}\n\n目录读取失败：${enumerationErrors.length}；带异常或警告的链接：${issues.length}。\n\n检查范围为当前 API 全部课程资料、指南及学院变体来源文件，以及本机指南 PDF；不包括网站所有外链或需登录的页面。四并发，只读 Range GET 前 64 字节，异常重试一次；无全文件下载、内容完整性、真机或审核通过保证。\n\n完整证据见 results.json；需处理项目见 issues.csv。\n`)
console.log('FINAL ' + JSON.stringify({ ...summary, recordCount: records.length, counts: counts(), warnings: results.filter(item => item.warnings.length).length, enumerationErrors }))
