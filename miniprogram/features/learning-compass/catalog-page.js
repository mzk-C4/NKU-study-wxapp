const catalog = require('./catalog')
const navigation = require('../../utils/navigation')
const { createSourceOpener } = require('../../utils/source-opener')
const BATCH_SIZE = 20
function decode(value) { try { return decodeURIComponent(value || '') } catch (_) { return '' } }
function categoryHeading(topic, kind) {
  const info = catalog.TOPICS.find(item => item.value === topic)
  if (info) return { title: info.label, description: info.description }
  return kind === 'handbook'
    ? { title: '生存手册', description: '计网、软件、人智大类的选课与成长经验。保留原作者署名和正文图片，重要事项请核对学校最新通知。' }
    : { title: '全部指南', description: '学校文件与学生经验分别标注，重要事项以学校最新通知为准。' }
}

function createCatalogPage(mode) {
  return {
    data: {
      mode, query: '', topic: '', kind: '', topics: catalog.TOPICS, results: [], total: 0,
      loading: false, error: '', warning: '', isEmpty: false, hasMore: false,
      openingDocumentId: '', title: mode === 'documents' ? 'PDF 学生资料' : mode === 'search' ? '搜索指南与资料' : '全部指南',
      description: '学校文件与学生经验分别标注，重要事项以学校最新通知为准。',
      suggestions: ['新生入学', '选课', '挂科怎么办', '成绩复核', '保研', '宿舍'],
      kinds: catalog.KINDS
    },
    onLoad(options = {}) {
      this._isUnloaded = false
      this._requestId = 0
      this._sourceOpener = createSourceOpener()
      const topic = catalog.topicValue(decode(options.category))
      const kind = mode === 'documents' ? 'pdf' : catalog.kindValue(decode(options.kind))
      this.setData({
        topic: mode === 'category' ? topic : '',
        query: decode(options.q).slice(0, 80),
        kind,
        ...(mode === 'category' ? categoryHeading(topic, kind) : {})
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
        this.setData({ loading: false, warning: '在线指南与生存手册加载失败，当前仅有已收录 PDF 可供筛选。请重试加载。' })
        this.applySearch()
      }
    },
    retry() { return this.loadGuides() },
    openAssistant() { navigation.openGuideAssistant(this.data.query) },
    openHandbookSource() { wx.navigateTo({ url: '/pages/feishu-document/index' }) },
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
      this.setData({ topic, ...(mode === 'category' ? categoryHeading(topic, this.data.kind) : {}) })
      this.confirmSearch()
    },
    chooseKind(event) {
      const kind = catalog.kindValue(event.currentTarget.dataset.kind)
      this.setData({ kind, ...(mode === 'category' ? categoryHeading(this.data.topic, kind) : {}) })
      this.confirmSearch()
    },
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
        return await (this._sourceOpener || createSourceOpener()).open(item, { failureTitle: 'PDF 暂时无法打开，请稍后重试', reportSupport: false })
      } finally {
        if (!this._isUnloaded) this.setData({ openingDocumentId: '' })
      }
    }
  }
}
module.exports = { createCatalogPage }

