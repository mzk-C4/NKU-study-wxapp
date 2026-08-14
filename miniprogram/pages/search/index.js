const Fuse = require('../../lib/fuse')
const api = require('../../utils/request')
const navigation = require('../../utils/navigation')

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

function highlight(value, query) {
  const safe = escapeHtml(value)
  if (!query) return safe
  const index = safe.toLowerCase().indexOf(escapeHtml(query).toLowerCase())
  if (index < 0) return safe
  return `${safe.slice(0, index)}<span style="color:#4B1F6F;background:#F8EFD9;font-weight:700">${safe.slice(index, index + query.length)}</span>${safe.slice(index + query.length)}`
}

Page({
  data: { query: '', type: 'course', types: [{ key: 'course', label: '课程', count: 0 }, { key: 'teacher', label: '教师', count: 0 }, { key: 'resource', label: '资料', count: 0 }, { key: 'guide', label: '指南', count: 0 }], loading: true, error: '', results: [] },
  fuse: null,
  indexItems: [],

  onLoad(options) {
    this.setData({ query: options.q || '', type: options.type === 'resource' ? 'resource' : 'course' })
    this.loadIndex()
  },

  async loadIndex() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await api.get('/search-index')
      this.indexItems = data.items || []
      this.fuse = new Fuse(this.indexItems, { includeScore: true, ignoreLocation: true, threshold: 0.38, keys: [{ name: 'name', weight: 0.35 }, { name: 'aliases', weight: 0.2 }, { name: 'tags', weight: 0.2 }, { name: 'teachers', weight: 0.15 }, { name: 'search_text', weight: 0.1 }] })
      this.search()
    } catch (error) {
      this.setData({ loading: false, error: error.message })
    }
  },

  input(event) { this.setData({ query: event.detail.value }, () => this.search()) },
  submit() { this.search() },
  chooseType(event) { this.setData({ type: event.currentTarget.dataset.type }, () => this.search()) },
  clear() { this.setData({ query: '' }, () => this.search()) },

  search() {
    if (!this.fuse) return
    const query = this.data.query.trim()
    const source = query ? this.fuse.search(query).map(result => result.item) : this.indexItems
    const counts = {}
    source.forEach(item => { counts[item.type] = (counts[item.type] || 0) + 1 })
    const results = source.filter(item => item.type === this.data.type).slice(0, 40).map(item => ({ ...item, highlighted_name: highlight(item.name, query) }))
    const types = this.data.types.map(item => ({ ...item, count: counts[item.key] || 0 }))
    this.setData({ types, results, loading: false, error: '' })
  },

  openResult(event) {
    const item = event.currentTarget.dataset.item
    if (item.type === 'course') navigation.openCourse(item.id)
    else if (item.type === 'guide') wx.navigateTo({ url: `/pages/guide-detail/index?id=${item.id}` })
    else if (item.course_id) navigation.openCourse(item.course_id)
  }
})
