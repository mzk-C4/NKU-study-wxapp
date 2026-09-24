const catalog = require('./catalog')
const navigation = require('../../utils/navigation')
const { createSourceOpener } = require('../../utils/source-opener')
const BATCH_SIZE = 20
function decode(value) { try { return decodeURIComponent(value || '') } catch (_) { return '' } }

function createCatalogPage(mode) {
  return {
    data: {
      mode, query: '', topic: '', kind: '', topics: catalog.TOPICS, results: [], total: 0,
      loading: false, error: '', warning: '', isEmpty: false, hasMore: false,
      openingDocumentId: '', title: mode === 'documents' ? 'PDF 学生资料' : mode === 'search' ? '搜索指南与资料' : '全部指南',
      description: '学校文件与学生经验分别标注，重要事项以学校最新通知为准。',
      suggestions: ['新生入学', '选课', '挂科怎么办', '成绩复核', '保研', '宿舍'],
      kinds: [{ value: '', label: '全部' }, { value: 'guide', label: '学校指南' }, { value: 'pdf', label: 'PDF 资料' }]
    },
    onLoad(options = {}) {
      this._isUnloaded = false
      this._requestId = 0
      this._sourceOpener = createSourceOpener()
      const topic = catalog.topicValue(decode(options.category))
      const info = catalog.TOPICS.find(item => item.value === topic)
      this.setData({
        topic: mode === 'category' ? topic : '',
        query: decode(options.q).slice(0, 80),
        kind: mode === 'documents' ? 'pdf' : '',
        ...(mode === 'category' && info ? { title: info.label, description: info.description } : {})
      })
      return this.loadGuides()
    },
    onUnload() {
      this._isUnloaded = true
      this._requestId += 1
      clearTimeout(this._searchTimer)
    },
    async loadGuides() {
      const requestId = ++this._requestId
      this.setData({ loading: true, error: '', warning: '', isEmpty: false })
      try {
        const items = mode === 'documents' ? catalog.documents() : await catalog.loadCatalog({
          cancelled: () => this._isUnloaded || requestId !== this._requestId
        })
        if (!items || this._isUnloaded || requestId !== this._requestId) return
        this._items = items
        this.setData({ loading: false })
        this.applySearch()
      } catch (_) {
        if (this._isUnloaded || requestId !== this._requestId) return
        this._items = catalog.documents()
        this.setData({ loading: false, warning: '学校指南加载失败，当前仅显示已收录 PDF。可重试加载。' })
        this.applySearch()
      }
    },
    retry() { return this.loadGuides() },
    inputSearch(event) {
      this.setData({ query: String(event.detail.value || '').slice(0, 80) })
      clearTimeout(this._searchTimer)
      this._searchTimer = setTimeout(() => this.applySearch(), 180)
    },
    confirmSearch() { clearTimeout(this._searchTimer); this.applySearch() },
    clearSearch() { this.setData({ query: '' }); this.confirmSearch() },
    chooseSuggestion(event) { this.setData({ query: event.currentTarget.dataset.query }); this.confirmSearch() },
    chooseCategory(event) {
      const topic = catalog.topicValue(event.currentTarget.dataset.category)
      const info = catalog.TOPICS.find(item => item.value === topic)
      this.setData({ topic, ...(mode === 'category' ? { title: info ? info.label : '全部指南', description: info ? info.description : '浏览学校指南与学生经验。' } : {}) })
      this.confirmSearch()
    },
    chooseKind(event) { this.setData({ kind: event.currentTarget.dataset.kind || '' }); this.confirmSearch() },
    applySearch() {
      if (this._isUnloaded) return
      this._matches = catalog.searchCatalog(this._items || [], this.data.query, { topic: this.data.topic, kind: this.data.kind })
      this._visibleCount = BATCH_SIZE
      this.showResults()
    },
    showResults() {
      const matches = this._matches || []
      this.setData({ results: matches.slice(0, this._visibleCount), total: matches.length,
        hasMore: matches.length > this._visibleCount, isEmpty: !this.data.loading && matches.length === 0 })
    },
    onReachBottom() {
      if (!this.data.hasMore || this.data.loading) return
      this._visibleCount += BATCH_SIZE
      this.showResults()
    },
    async openItem(event) {
      const key = event.currentTarget.dataset.key
      const item = (this._items || []).find(row => row.key === key)
      if (!item) return false
      if (item.kind === 'guide') { navigation.openGuide(item.id); return true }
      if (this.data.openingDocumentId) return false
      this.setData({ openingDocumentId: item.id })
      try {
        return await (this._sourceOpener || createSourceOpener()).open(item, { failureTitle: 'PDF 暂时无法打开，请稍后重试' })
      } finally {
        if (!this._isUnloaded) this.setData({ openingDocumentId: '' })
      }
    },
    askAssistant() { navigation.openGuideAssistant(this.data.query) }
  }
}
module.exports = { createCatalogPage }

