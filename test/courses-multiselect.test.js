const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const publicApi = require('../miniprogram/services/public-api')

function capturePage(relativePath) {
  const modulePath = require.resolve(path.join(projectRoot, relativePath))
  const previousPage = global.Page
  let definition
  global.Page = value => { definition = value }
  delete require.cache[modulePath]
  try { require(modulePath) } finally {
    delete require.cache[modulePath]
    if (previousPage === undefined) delete global.Page
    else global.Page = previousPage
  }
  return definition
}

function createPage(definition) {
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) }
  page.setData = function setData(patch, callback) {
    Object.assign(this.data, patch)
    if (callback) callback.call(this)
  }
  return page
}

function replace(t, object, key, implementation) {
  const original = object[key]
  object[key] = implementation
  t.after(() => { object[key] = original })
}

function course(id, group, tags, term = '大一上', assessment = '绩点制') {
  return { id, name: id, group, tags, term, assessment }
}

const pageDefinition = capturePage('miniprogram/pages/courses/index.js')
const previousPage = global.Page
global.Page = () => {}
const { createOptions, filterCourses, selectionLabel, calculateScrollbar } = require('../miniprogram/pages/courses/index.js')
delete require.cache[require.resolve('../miniprogram/pages/courses/index.js')]
if (previousPage === undefined) delete global.Page
else global.Page = previousPage

test('group and tag selections use OR within a dimension and AND across dimensions', () => {
  const catalog = [
    course('a', '通识选修课', ['文学院']),
    course('b', '专业必修课', ['计算机学院']),
    course('c', '公共必修课', ['文学院'])
  ]

  assert.deepEqual(filterCourses(catalog, { groups: ['通识选修课', '专业必修课'] }).map(item => item.id), ['a', 'b'])
  assert.deepEqual(filterCourses(catalog, { tags: ['文学院', '计算机学院'] }).map(item => item.id), ['a', 'b', 'c'])
  assert.deepEqual(filterCourses(catalog, { groups: ['通识选修课', '专业必修课'], tags: ['文学院'] }).map(item => item.id), ['a'])
  assert.deepEqual(filterCourses(catalog, { groups: ['通识选修课', '专业必修课'], tags: ['文学院', '计算机学院'], term: '大一下' }), [])
})

test('multi-select option models expose selected state through native checkbox groups', () => {
  assert.deepEqual(createOptions(['通识选修课', '专业必修课'], ['专业必修课']), [
    { value: '通识选修课', label: '通识选修课', selected: false },
    { value: '专业必修课', label: '专业必修课', selected: true }
  ])
  const template = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/courses/index.wxml'), 'utf8')
  assert.match(template, /<checkbox-group[^>]+bindchange="changeGroups"/)
  assert.match(template, /<checkbox-group[^>]+bindchange="changeTags"/)
  assert.match(template, /<scroll-view[^>]*class="filter-scroll[^"]*"/)
  assert.match(template, /bindscroll="handleFilterScroll"/)
  assert.match(template, /class="filter-scrollbar section"/)
  assert.match(template, /class="filter-scrollbar-thumb"/)
  assert.match(template, /data-panel="group"[^>]+bindtap="toggleFilterPanel"/)
  assert.match(template, /data-panel="tag"[^>]+bindtap="toggleFilterPanel"/)
  assert.match(template, /课程类别<\/view>/)
  assert.match(template, /课程标签<\/view>/)
  assert.match(template, /checked="\{\{item\.selected\}\}"/)
  assert.doesNotMatch(template, /filter-section section|tagPanelOpen|toggleTagPanel/)
  assert.doesNotMatch(template, /\.includes\s*\(/)
})

test('horizontal filter scrollbar reflects viewport and scroll progress', () => {
  assert.deepEqual(calculateScrollbar(0, 600, 300), { scrollable: true, thumbWidth: 50, thumbLeft: 0 })
  assert.deepEqual(calculateScrollbar(150, 600, 300), { scrollable: true, thumbWidth: 50, thumbLeft: 25 })
  assert.deepEqual(calculateScrollbar(300, 600, 300), { scrollable: true, thumbWidth: 50, thumbLeft: 50 })
  assert.deepEqual(calculateScrollbar(0, 300, 300), { scrollable: false, thumbWidth: 100, thumbLeft: 0 })
})

test('filter bar labels summarize selections and panels toggle independently', () => {
  assert.equal(selectionLabel([], '全部类别', '类别'), '全部类别')
  assert.equal(selectionLabel(['通识选修课'], '全部类别', '类别'), '通识选修课')
  assert.equal(selectionLabel(['通识选修课', '专业必修课'], '全部类别', '类别'), '已选 2 个类别')
  const page = createPage(pageDefinition)
  page.toggleFilterPanel({ currentTarget: { dataset: { panel: 'group' } } })
  assert.equal(page.data.filterPanel, 'group')
  page.toggleFilterPanel({ currentTarget: { dataset: { panel: 'tag' } } })
  assert.equal(page.data.filterPanel, 'tag')
  page.closeFilterPanel()
  assert.equal(page.data.filterPanel, '')
})

test('course catalog pagination loads once and later multi-select changes stay local', async t => {
  const calls = []
  const first = [course('a', '通识选修课', ['文学院']), course('b', '专业必修课', ['计算机学院'])]
  const second = [course('c', '通识选修课', ['计算机学院'])]
  replace(t, publicApi, 'getCourses', async query => {
    calls.push(query)
    return {
      items: query.page === 1 ? first : second,
      total: 3,
      page: query.page,
      page_size: 100,
      facets: {
        groups: ['通识选修课', '专业必修课'],
        terms: ['大一上'],
        tags: ['文学院', '计算机学院'],
        assessments: ['绩点制']
      }
    }
  })

  const page = createPage(pageDefinition)
  await page.loadCourses()
  assert.deepEqual(calls.map(call => call.page), [1, 2])
  assert.equal(page.data.total, 3)

  page.changeGroups({ detail: { value: ['通识选修课'] } })
  assert.deepEqual(page.data.selectedGroups, ['通识选修课'])
  page.changeGroups({ detail: { value: ['通识选修课', '专业必修课'] } })
  assert.deepEqual(page.data.selectedGroups, ['通识选修课', '专业必修课'])
  assert.equal(page.data.total, 3)

  page.changeTags({ detail: { value: ['文学院'] } })
  assert.deepEqual(page.data.selectedTags, ['文学院'])
  page.changeTags({ detail: { value: ['文学院', '计算机学院'] } })
  assert.deepEqual(page.data.selectedTags, ['文学院', '计算机学院'])
  assert.deepEqual(page.data.courses.map(item => item.id), ['a', 'b', 'c'])
  assert.equal(calls.length, 2)

  page.clearFilters()
  assert.equal(page.data.total, 3)
  assert.equal(page.data.hasFilters, false)
})

test('user-facing mini program copy no longer contains server wording', () => {
  const roots = ['pages', 'components', 'utils']
  const files = []
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(target)
      else if (/\.(?:js|wxml)$/.test(entry.name)) files.push(target)
    }
  }
  roots.forEach(root => walk(path.join(projectRoot, 'miniprogram', root)))
  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(source, /服务器/)
  assert.doesNotMatch(source, /沿用服务器单一评分|服务器直链|服务器标签/)
})

test('resource and review cards retain their actions after copy cleanup', () => {
  const resources = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/course-resources/index.wxml'), 'utf8')
  const reviews = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/course-reviews/index.wxml'), 'utf8')
  assert.match(resources, /下载并打开/)
  assert.doesNotMatch(resources, /服务器直链/)
  assert.match(reviews, /基于 \{\{scoreCount\}\} 条评价/)
  assert.doesNotMatch(reviews, /沿用服务器单一评分/)
})
