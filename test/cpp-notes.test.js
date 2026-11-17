const test = require('node:test')
const assert = require('node:assert/strict')
const { loadChapters, CHAPTER_ID } = require('../miniprogram/features/learning-compass/cpp-notes')
test('C++ catalog traverses pages and admits only fixed chapter IDs', async () => {
  const calls = []
  const chapters = await loadChapters({ getGuides: async ({ page }) => {
    calls.push(page)
    return { total: 101, items: page === 1 ? [{ id: 'handbook-abc', title: '手册' }, { id: 'cpp-notes-002', title: 'C++ 笔记 · 数组' }] : [{ id: 'cpp-notes-001', title: 'C++ 笔记 · 类型' }, { id: 'cpp-notes-../bad', title: 'bad' }] }
  } })
  assert.deepEqual(calls, [1, 2])
  assert.deepEqual(chapters.map(c => c.title), ['类型', '数组'])
  assert.equal(CHAPTER_ID.test('https://evil'), false)
})
test('unpublished C++ catalog is empty and failed pagination fails explicitly', async () => {
  assert.deepEqual(await loadChapters({ getGuides: async () => ({ total: 0, items: [] }) }), [])
  await assert.rejects(loadChapters({ getGuides: async () => ({ total: 200, items: [] }) }), /INCOMPLETE_CATALOG/)
})
