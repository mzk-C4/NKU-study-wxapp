const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createApp } = require('../src/app')
const {
  LEARNING_COMPASS_CATEGORIES,
  LearningCompassValidationError,
  buildLearningCompass,
  createLearningCompassProjection
} = require('../src/learning-compass')

const projectRoot = path.resolve(__dirname, '../..')
const sourceGuidesDir = path.join(projectRoot, 'Documents/学习指南针内容草稿/guides')
const sourceManifestPath = path.join(projectRoot, 'Documents/SOURCE_MANIFEST.md')
const guideFiles = [
  'guide-ai-coursework.md',
  'guide-course-selection-2026-fall.md',
  'guide-grade-review.md',
  'guide-micro-major-2026.md',
  'guide-resume-study.md'
]

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-compass-'))
  const guidesDir = path.join(root, 'guides')
  const manifestPath = path.join(root, 'SOURCE_MANIFEST.md')
  fs.mkdirSync(guidesDir)
  fs.copyFileSync(sourceManifestPath, manifestPath)
  for (const filename of guideFiles) fs.copyFileSync(path.join(sourceGuidesDir, filename), path.join(guidesDir, filename))
  return { root, guidesDir, manifestPath }
}

function cleanup(item) {
  const unlinkKnown = file => { if (fs.existsSync(file)) fs.unlinkSync(file) }
  unlinkKnown(path.join(item.guidesDir, 'guide-ai-coursework.md'))
  unlinkKnown(path.join(item.guidesDir, 'guide-course-selection-2026-fall.md'))
  unlinkKnown(path.join(item.guidesDir, 'guide-grade-review.md'))
  unlinkKnown(path.join(item.guidesDir, 'guide-micro-major-2026.md'))
  unlinkKnown(path.join(item.guidesDir, 'guide-resume-study.md'))
  unlinkKnown(path.join(item.guidesDir, 'duplicate.md'))
  unlinkKnown(item.manifestPath)
  unlinkKnown(path.join(item.root, 'runtime.json'))
  unlinkKnown(path.join(item.root, `runtime.json.${process.pid}.tmp`))
  if (fs.existsSync(item.guidesDir)) fs.rmdirSync(item.guidesDir)
  if (fs.existsSync(item.root)) fs.rmdirSync(item.root)
}

function changeGuide(item, filename, update) {
  const file = path.join(item.guidesDir, filename)
  fs.writeFileSync(file, update(fs.readFileSync(file, 'utf8')), 'utf8')
}

function expectValidation(item, code) {
  assert.throws(
    () => buildLearningCompass({ manifestPath: item.manifestPath, guidesDir: item.guidesDir }),
    error => error instanceof LearningCompassValidationError && error.code === code
  )
}

async function request(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`)
  return { response, body: await response.json() }
}

test('approved local published guides build deterministically and project all five categories', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  const first = buildLearningCompass({ manifestPath: item.manifestPath, guidesDir: item.guidesDir })
  const second = buildLearningCompass({ manifestPath: item.manifestPath, guidesDir: item.guidesDir })

  assert.equal(first.guides.length, 5)
  assert.equal(first.guides.every(guide => guide.status === 'published'), true)
  assert.deepEqual(new Set(first.guides.map(guide => guide.category)), new Set(LEARNING_COMPASS_CATEGORIES))
  assert.equal(first.version, second.version)
  assert.deepEqual(first.sources.map(source => source.id), second.sources.map(source => source.id))
  assert.deepEqual(first.guides.map(guide => guide.sections.map(section => section.id)), second.guides.map(guide => guide.sections.map(section => section.id)))

  const projection = createLearningCompassProjection(first)
  const published = projection.listPublished()
  const searchItems = projection.searchItems()
  assert.equal(published.length, 5)
  assert.equal(searchItems.length, 5)
  assert.deepEqual(new Set(published.map(guide => guide.category)), new Set(LEARNING_COMPASS_CATEGORIES))
  assert.equal(new Set(searchItems.map(item => `${item.type}:${item.id}`)).size, 5)
  for (const guide of published) {
    const detail = projection.getPublished(guide.id)
    assert.ok(detail.sections.length)
    assert.ok(detail.sources.length)
  }
})

test('real published content projects to local list, detail and search without private paths', async t => {
  const item = fixture()
  let server
  t.after(async () => {
    if (server && server.listening) await new Promise(resolve => server.close(resolve))
    cleanup(item)
  })
  const knowledgeBase = buildLearningCompass({ manifestPath: item.manifestPath, guidesDir: item.guidesDir })
  const projection = createLearningCompassProjection(knowledgeBase)
  const list = projection.listPublished()
  const detail = projection.getPublished('grade-review')

  assert.equal(list.length, 5)
  assert.equal(list.find(guide => guide.id === 'grade-review').category, '考试与成绩')
  assert.ok(detail.sections.length >= 3)
  assert.equal(detail.sources.length, 1)
  assert.match(detail.sources[0].url, /^https:/)
  assert.match(detail.sources[0].location_label, /第十四条/)
  assert.doesNotMatch(JSON.stringify(detail), /Documents|markdown_path|original_path/)

  const runtimePath = path.join(item.root, 'runtime.json')
  server = createApp({
    dbPath: runtimePath,
    seedPath: path.join(projectRoot, 'server/data/seed.json'),
    adminPath: path.join(projectRoot, 'admin/index.html'),
    adminLogoPath: path.join(projectRoot, 'assets/branding/nkustudy-avatar-v2-nankai-128.png'),
    tokenSecret: 'test-token-secret-with-enough-entropy',
    adminKey: '',
    allowDevLogin: false,
    learningCompass: projection
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const guides = await request(baseUrl, `/api/v1/guides?category=${encodeURIComponent('考试与成绩')}`)
  assert.equal(guides.response.status, 200)
  assert.equal(guides.body.data.total, 1)
  assert.deepEqual(guides.body.data.facets.categories.includes('考试与成绩'), true)

  for (const category of LEARNING_COMPASS_CATEGORIES) {
    const categoryGuides = await request(baseUrl, `/api/v1/guides?category=${encodeURIComponent(category)}`)
    assert.equal(categoryGuides.response.status, 200)
    assert.equal(categoryGuides.body.data.total, 1)
    assert.equal(categoryGuides.body.data.items[0].category, category)
  }

  const guide = await request(baseUrl, '/api/v1/guides/grade-review')
  assert.equal(guide.response.status, 200)
  assert.ok(guide.body.data.sections.length)
  assert.ok(guide.body.data.sources.length)

  const search = await request(baseUrl, '/api/v1/search-index')
  const targetGuideItems = search.body.data.items.filter(entry => entry.type === 'guide' && guideFiles.some(filename => filename.includes(entry.id)))
  const itemInSearch = search.body.data.items.find(entry => entry.type === 'guide' && entry.id === 'grade-review')
  assert.equal(itemInSearch.category, undefined)
  assert.equal(itemInSearch.tags.includes('考试与成绩'), true)
  assert.equal(targetGuideItems.length, 5)
  assert.equal(new Set(search.body.data.items.map(entry => `${entry.type}:${entry.id}`)).size, search.body.data.items.length)
})

test('draft and review content remain outside the public projection', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  changeGuide(item, 'guide-ai-coursework.md', markdown => markdown.replace('status: published', 'status: review'))
  changeGuide(item, 'guide-grade-review.md', markdown => markdown.replace('status: published', 'status: draft'))
  const knowledgeBase = buildLearningCompass({ manifestPath: item.manifestPath, guidesDir: item.guidesDir })
  const projection = createLearningCompassProjection(knowledgeBase)
  assert.equal(projection.listPublished().length, 3)
  assert.equal(projection.getPublished('ai-coursework'), null)
  assert.equal(projection.getPublished('grade-review'), null)
  assert.equal(projection.searchItems().some(item => ['ai-coursework', 'grade-review'].includes(item.id)), false)
})

test('invalid category fails closed', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  changeGuide(item, 'guide-ai-coursework.md', markdown => markdown.replace('category: 规范与权益', 'category: 未知分类'))
  expectValidation(item, 'GUIDE_CATEGORY_INVALID')
})

test('unknown source id fails closed', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  changeGuide(item, 'guide-grade-review.md', markdown => markdown.replaceAll('SRC-003', 'SRC-999'))
  expectValidation(item, 'GUIDE_SOURCE_UNKNOWN')
})

test('invalid status fails closed', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  changeGuide(item, 'guide-grade-review.md', markdown => markdown.replace('status: published', 'status: archived'))
  expectValidation(item, 'GUIDE_STATUS_INVALID')
})

test('duplicate guide id fails closed', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  fs.copyFileSync(path.join(item.guidesDir, 'guide-grade-review.md'), path.join(item.guidesDir, 'duplicate.md'))
  expectValidation(item, 'GUIDE_ID_DUPLICATE')
})

test('published guide without a citation fails closed', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  changeGuide(item, 'guide-grade-review.md', markdown => markdown.replace(/## 原文依据[\s\S]*$/, ''))
  expectValidation(item, 'GUIDE_CITATION_MISSING')
})

test('non-HTTPS official source fails closed', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  const manifest = fs.readFileSync(item.manifestPath, 'utf8').replace('https://jwc.nankai.edu.cn/xzwj/list.htm', 'http://jwc.nankai.edu.cn/xzwj/list.htm')
  fs.writeFileSync(item.manifestPath, manifest, 'utf8')
  expectValidation(item, 'SOURCE_URL_UNSAFE')
})

test('tampered generated data fails closed before public projection', t => {
  const item = fixture()
  t.after(() => cleanup(item))
  const knowledgeBase = buildLearningCompass({ manifestPath: item.manifestPath, guidesDir: item.guidesDir })
  const tampered = JSON.parse(JSON.stringify(knowledgeBase))
  tampered.sources[0].url = 'http://example.com/not-safe'
  assert.throws(
    () => createLearningCompassProjection(tampered),
    error => error instanceof LearningCompassValidationError && error.code === 'SOURCE_URL_UNSAFE'
  )
})
