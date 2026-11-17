const api = require('./api')
const CHAPTER_ID = /^cpp-notes-\d{3}$/
async function loadChapters(client = api) {
  const preview = client === api && require('./cpp-preview').chapters()
  if (preview) return preview
  const chapters = new Map()
  for (let page = 1; page <= 100; page++) {
    const result = await client.getGuides({ page, page_size: 100 })
    const items = result.items || []
    for (const item of items) if (CHAPTER_ID.test(item.id)) chapters.set(item.id, { id: item.id, title: item.title.replace(/^C\+\+ 笔记 · /, '') })
    if (!Number.isFinite(result.total)) throw new Error('INVALID_CATALOG')
    if (page * 100 >= result.total) return [...chapters.values()].sort((a, b) => a.id.localeCompare(b.id))
    if (!items.length) throw new Error('INCOMPLETE_CATALOG')
  }
  throw new Error('CATALOG_PAGE_LIMIT')
}
module.exports = { loadChapters, CHAPTER_ID }
