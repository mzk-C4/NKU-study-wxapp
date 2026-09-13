const test = require('node:test')
const assert = require('node:assert/strict')

global.wx = {
  showToast: () => {}, showModal: () => {}, navigateBack: () => {}, navigateTo: () => {}, switchTab: () => {},
  getStorageSync: () => ({ token: 'testtokenabcdef123456', expires_at: Date.now() + 86400000, user: { id: 1 } })
}
global.Page = () => {}
const { createWriteReviewPage, buildPickerEntries, filterEntries } = require('../miniprogram/pages/write-review/index.js')

function fakeApi(overrides = {}) {
  return {
    getHome: async () => ({ review_submission: { min_length: 5, moderation_required: false } }),
    getCourse: async (id) => ({ id, name: id === 'c1' ? '中文课程' : '课程', group: '通识选修课', teacher_groups: [{ teacher_name: '张老师' }] }),
    getReviewGroups: async () => ({
      items: [
        { group_key: 'k1', course_name: '3D 打印及应用', teacher_name: '李老师', review_count: 3, matched: false },
        { group_key: 'k2', course_name: '3D 打印及应用', teacher_name: '王老师', review_count: 2, matched: false },
        { group_key: 'k3', course_name: '中文课程', teacher_name: '张老师', review_count: 2, matched: true }
      ]
    }),
    getSearchData: async () => ({
      courses: [
        { id: 'c1', name: '中文课程' },
        { id: 'c2', name: '高等数学' }
      ],
      catalog: [
        { id: 'cat-1', name: '20世纪中国史学与史家', teachers: ['朱洪斌'] },
        { id: 'cat-2', name: '中国近现代史纲要', teachers: ['朱洪斌'] },
        { id: 'cat-3', name: '定量化学分析', teachers: ['邱晓航'] }
      ],
      groups: []
    }),
    submitReview: async (payload) => { fakeApi.lastSubmit = payload; return { submitted: true } },
    ...overrides
  }
}

function makePage(api) {
  const page = createWriteReviewPage(api)
  page.setData = function (patch) { Object.assign(this.data, patch) }
  page.data = Object.assign({}, page.data)
  return page
}

test('picker entries merge sources with review stats and derive course teachers from groups', () => {
  const entries = buildPickerEntries(
    { items: [
      { course_name: '3D 打印及应用', teacher_name: '李老师', review_count: 3 },
      { course_name: '3D 打印及应用', teacher_name: '王老师', review_count: 2 },
      { course_name: '中文课程', teacher_name: '张老师', review_count: 2 }
    ] },
    { items: [
      { id: 'c1', name: '中文课程', group: '通识选修课', review_count: 2 },
      { id: 'c2', name: '高等数学', group: '通识必修课', review_count: 0 }
    ] },
    { items: [{ id: 'cat-1', name: '20世纪中国史学与史家', teachers: ['朱洪斌'] }] }
  )
  assert.equal(entries.length, 4, 'manifest 2 门 + 历史组 1 门 + 目录 1 门')
  const groupEntry = entries.find(entry => entry.type === 'group')
  assert.equal(groupEntry.sub, '共5条评价，已有老师：李老师、王老师')
  const courseEntry = entries.find(entry => entry.type === 'course' && entry.id === 'c1')
  assert.deepEqual(courseEntry.teachers, ['张老师'], '课程条目老师由评价组统计派生')
  assert.equal(courseEntry.sub, '共2条评价，已有老师：张老师')
  const emptyEntry = entries.find(entry => entry.name === '高等数学')
  assert.equal(emptyEntry.sub, '暂时没有评价')
  const catalogEntry = entries.find(entry => entry.type === 'catalog')
  assert.equal(catalogEntry.catalogCourseId, 'cat-1')
  assert.equal(catalogEntry.sub, '暂时没有评价')
})

test('picker loads full search data once and filters locally without server search', async () => {
  const api = fakeApi()
  let catalogCalls = 0
  api.getCatalog = async () => { catalogCalls += 1; return { items: [] } }
  const page = makePage(api)
  page.onLoad({})
  await page.prepare()
  assert.equal(page.data.pickerMode, true)
  assert.ok(page.data.pickerEntries.length >= 5, '课程库+目录池+历史组全部本地化')
  await page.inputPickerKeyword({ detail: { value: '史学' } })
  assert.ok(page.data.pickerFiltered.some(entry => entry.type === 'catalog' && entry.name === '20世纪中国史学与史家'))
  assert.equal(catalogCalls, 0, '不再向服务器发起目录搜索')
  const catalogEntry = page.data.pickerFiltered.find(entry => entry.type === 'catalog')
  page.setData({ pickerFiltered: [catalogEntry] })
  page.tapPickerEntry({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(page.data.isCatalogMode, true)
  page.setData({ teacher: '朱洪斌', rating: 5, body: '讲得非常出色，推荐选择' })
  await page.submit()
  assert.equal(fakeApi.lastSubmit.catalog_course_id, 'cat-1')
  assert.equal(fakeApi.lastSubmit.course_id, undefined)
})

test('filterEntries ranks substring above subsequence abbreviation matches', () => {
  const entries = [
    { key: 'a', type: 'course', name: '高等数学B（上）', teachers: [], sub: '' },
    { key: 'b', type: 'course', name: '高等数学A（上）', teachers: [], sub: '' },
    { key: 'c', type: 'course', name: '数学文化与数学史', teachers: [], sub: '' }
  ]
  const byName = (list) => list.map(entry => entry.name)
  // 连续子串命中时，子序列命中不参与显示
  assert.deepEqual(byName(filterEntries(entries, '数学文化')), ['数学文化与数学史'])
  // 无连续命中时，按序取字缩写（高数）命中并按原顺序展示
  assert.deepEqual(byName(filterEntries(entries, '高数')), ['高等数学B（上）', '高等数学A（上）'])
  // 单字查询退化为包含匹配
  assert.equal(filterEntries(entries, '高').length, 2)
  assert.equal(filterEntries(entries, '').length, 3)
})

test('filterEntries supports abbreviation, partial and teacher matching', () => {
  const entries = [
    { key: 'a', type: 'catalog', name: '中国近现代史纲要', teachers: ['朱洪斌'] },
    { key: 'b', type: 'catalog', name: '定量化学分析', teachers: ['邱晓航'] },
    { key: 'c', type: 'group', name: '3D 打印及应用', teachers: ['李四', '王五'] },
    { key: 'd', type: 'course', name: '大学语文', teachers: [] }
  ]
  // 缩写按序取字：史纲 -> 中国近现代史纲要
  assert.deepEqual(filterEntries(entries, '史纲').map(e => e.name), ['中国近现代史纲要'])
  // 老师仅对评价组条目生效（连续子串）
  assert.deepEqual(filterEntries(entries, '王五').map(e => e.name), ['3D 打印及应用'])
  // 部分按序兜底：定划分 -> 定量化学分析（3字命中2字）
  assert.deepEqual(filterEntries(entries, '定划分').map(e => e.name), ['定量化学分析'])
  // 老师不再匹配非评价组条目（课程/目录仅名称）
  assert.equal(filterEntries(entries, '邱晓航').length, 0)
  // 拼音/乱码无结果
  assert.equal(filterEntries(entries, 'xyz').length, 0)
})

test('no course_id opens picker mode and submits via course_title for groups', async () => {
  const api = fakeApi()
  const page = makePage(api)
  await new Promise(resolve => { page.onLoad({}); resolve() })
  await page.prepare()
  assert.equal(page.data.pickerMode, true)
  assert.ok(page.data.pickerEntries.length >= 2)
  // 选择历史组条目并提交
  const groupEntry = page.data.pickerEntries.find(entry => entry.type === 'group')
  page.setData({ pickerFiltered: [groupEntry] })
  page.tapPickerEntry({ currentTarget: { dataset: { index: 0 } } })
  await page.prepare()
  assert.equal(page.data.isGroupMode, true)
  assert.equal(page.data.course.name, '3D 打印及应用')
  assert.deepEqual(page.data.course.teacher_groups.map(item => item.teacher_name), ['李老师', '王老师'])
  page.setData({ teacher: '李老师', rating: 5, body: '讲得不错，收获很大' })
  await page.submit()
  assert.equal(fakeApi.lastSubmit.course_title, '3D 打印及应用')
  assert.equal(fakeApi.lastSubmit.course_id, undefined)
  assert.equal(fakeApi.lastSubmit.rating, 5)
})

test('course_title deep link skips the picker and submits to that group', async () => {
  const api = fakeApi()
  const page = makePage(api)
  page.onLoad({ course_title: '3D 打印及应用' })
  await page.prepare()
  assert.equal(page.data.isGroupMode, true)
  assert.equal(page.data.pickerMode, false)
  page.setData({ teacher: '王老师', rating: 4, body: '作业有点多，但收获很大' })
  await page.submit()
  assert.equal(fakeApi.lastSubmit.course_title, '3D 打印及应用')
})

test('course_id flow keeps original course_id submission', async () => {
  const api = fakeApi()
  const page = makePage(api)
  page.onLoad({ course_id: 'c1' })
  await page.prepare()
  assert.equal(page.data.isGroupMode, false)
  assert.equal(page.data.course.id, 'c1')
  page.setData({ teacher: '张老师', rating: 5, body: '课程质量很好，推荐选' })
  await page.submit()
  assert.equal(fakeApi.lastSubmit.course_id, 'c1')
  assert.equal(fakeApi.lastSubmit.course_title, undefined)
})


test('logged-out users are blocked before any submission flow', async () => {
  const api = fakeApi()
  const page = makePage(api)
  global.wx.getStorageSync = () => null
  try {
    page.onLoad({})
    await page.prepare()
    assert.equal(page.data.loading, true, '未登录时不进入加载流程')
    assert.equal(page.data.pickerMode, false)
  } finally {
    global.wx.getStorageSync = () => ({ token: 'testtokenabcdef123456', expires_at: Date.now() + 86400000, user: { id: 1 } })
  }
})
