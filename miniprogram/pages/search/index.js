const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const publicApi = require('../../services/public-api')
const navigation = require('../../utils/navigation')
const { createSearchEngine, SEARCH_TYPES } = require('../../utils/search-engine')
const { normalizeBoundedSearchText } = require('../../utils/search-utils')
const { buildCoursePresentation, buildSearchPresentation } = require('./presentation')

const PAGE_SIZE = 20
const LOCAL_BATCH_SIZE = 20
const TYPE_LABELS = Object.freeze({
  course: '课程',
  teacher: '教师',
  resource: '资料',
  guide: '指南'
})
const FACET_CONFIG = Object.freeze({
  term: { label: '修读阶段', optionsKey: 'termOptions', choicesKey: 'termChoices', indexKey: 'termChoiceIndex' },
  group: { label: '课程类别', optionsKey: 'groupOptions', choicesKey: 'groupChoices', indexKey: 'groupChoiceIndex' },
  tag: { label: '课程标签', optionsKey: 'tagOptions', choicesKey: 'tagChoices', indexKey: 'tagChoiceIndex' },
  assessment: { label: '考核方式', optionsKey: 'assessmentOptions', choicesKey: 'assessmentChoices', indexKey: 'assessmentChoiceIndex' }
})

function boundedQuery(value) {
  return normalizeBoundedSearchText(value)
}

function hasActiveFilters(data) {
  return ['term', 'group', 'tag', 'assessment'].some(key => Boolean(data[key]))
}

function uniqueTextValues(values, currentValue) {
  const source = [currentValue, ...(Array.isArray(values) ? values : [])]
  return [...new Set(source.map(value => String(value == null ? '' : value).trim()).filter(Boolean))]
}

function facetPatch(facets, snapshot) {
  const source = facets && typeof facets === 'object' ? facets : {}
  const groupOptions = uniqueTextValues(source.groups, snapshot.group)
  const termOptions = uniqueTextValues(source.terms, snapshot.term)
  const tagOptions = uniqueTextValues(source.tags, snapshot.tag)
  const assessmentOptions = uniqueTextValues(source.assessments, snapshot.assessment)
  return {
    onShow() { theme.onPageShow() },
    groupOptions,
    groupChoices: ['不限', ...groupOptions],
    groupChoiceIndex: snapshot.group ? groupOptions.indexOf(snapshot.group) + 1 : 0,
    termOptions,
    termChoices: ['不限', ...termOptions],
    termChoiceIndex: snapshot.term ? termOptions.indexOf(snapshot.term) + 1 : 0,
    tagOptions,
    tagChoices: ['不限', ...tagOptions],
    tagChoiceIndex: snapshot.tag ? tagOptions.indexOf(snapshot.tag) + 1 : 0,
    assessmentOptions,
    assessmentChoices: ['不限', ...assessmentOptions],
    assessmentChoiceIndex: snapshot.assessment ? assessmentOptions.indexOf(snapshot.assessment) + 1 : 0
  }
}

function dedupeCourses(courses) {
  const seen = new Set()
  return courses.filter(course => {
    const id = course && course.id
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function typeTabs(counts = {}, selectedType = '') {
  const total = SEARCH_TYPES.reduce((sum, type) => sum + (Number(counts[type]) || 0), 0)
  return [
    { id: 'all', type: '', label: '全部', count: total, active: selectedType === '' },
    ...SEARCH_TYPES.map(type => ({
      id: type,
      type,
      label: TYPE_LABELS[type],
      count: Number(counts[type]) || 0,
      active: selectedType === type
    }))
  ]
}

function userErrorMessage(error, target) {
  if (error && (error.code === 'NETWORK_ERROR' || error.kind === 'network_error')) {
    return '网络连接失败，请检查网络后重试。'
  }
  return target === 'index' ? '暂时无法加载搜索索引，请稍后重试。' : '暂时无法加载课程，请稍后重试。'
}

Page({
  data: {
    query: '',
    mode: 'global',
    modeLabel: '四类搜索',
    selectedType: '',
    typeTabs: typeTabs(),
    loading: true,
    searching: false,
    loadingMore: false,
    error: '',
    loadMoreError: '',
    idle: false,
    hasSearched: false,
    results: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    visibleLimit: LOCAL_BATCH_SIZE,
    hasMore: false,
    indexReady: false,
    indexVersion: '',
    generatedAt: '',
    term: '',
    group: '',
    tag: '',
    assessment: '',
    termOptions: [],
    groupOptions: [],
    tagOptions: [],
    assessmentOptions: [],
    termChoices: ['不限'],
    groupChoices: ['不限'],
    tagChoices: ['不限'],
    assessmentChoices: ['不限'],
    termChoiceIndex: 0,
    groupChoiceIndex: 0,
    tagChoiceIndex: 0,
    assessmentChoiceIndex: 0,
    hasActiveFilters: false
  },
  searchTimer: null,

  onLoad(options = {}) { reportVisit('/mp/search');
    this._isUnloaded = false
    this._requestId = 0
    this._indexRequestId = 0
    this._matchedResults = []
    const query = String(options.q == null ? '' : options.q).slice(0, 80)
    this.setData({ query })
    const indexPromise = this.loadSearchIndex()
    const facetsPromise = this.loadFacetOptions()
    return Promise.all([indexPromise, facetsPromise])
  },
  onUnload() {
    this._isUnloaded = true
    this._requestId = (this._requestId || 0) + 1
    this._indexRequestId = (this._indexRequestId || 0) + 1
    this.cancelSearchTimer()
  },
  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return
    if (this.data.mode === 'facet') this.loadCourses({ append: true })
    else this.showMoreLocal()
  },

  cancelSearchTimer() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = null
  },
  invalidateServerRequest() {
    this._requestId = (this._requestId || 0) + 1
  },
  input(event) {
    if (this._isUnloaded) return
    const query = String(event && event.detail ? event.detail.value : '').slice(0, 80)
    this.cancelSearchTimer()
    this.invalidateServerRequest()
    this.setData({ query, error: '', loadMoreError: '', searching: Boolean(boundedQuery(query)) })
    if (!boundedQuery(query) && !hasActiveFilters(this.data)) {
      this.enterIdle()
      return
    }
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null
      this.search()
    }, 250)
  },
  submit() {
    this.cancelSearchTimer()
    return this.search()
  },
  clearQuery() {
    this.cancelSearchTimer()
    this.invalidateServerRequest()
    this.setData({ query: '', searching: false }, () => {
      if (hasActiveFilters(this.data)) this.loadCourses()
      else this.enterIdle()
    })
  },
  clear() {
    return this.clearQuery()
  },
  changeType(event) {
    if (this._isUnloaded || this.data.mode === 'facet') return
    const requested = event && event.currentTarget && event.currentTarget.dataset.type
    const selectedType = SEARCH_TYPES.includes(requested) ? requested : ''
    this.cancelSearchTimer()
    this.setData({ selectedType, visibleLimit: LOCAL_BATCH_SIZE }, () => {
      if (boundedQuery(this.data.query)) this.executeGlobalSearch()
      else this.enterIdle()
    })
  },
  changeFacet(event) {
    const key = event && event.currentTarget && event.currentTarget.dataset.key
    const config = FACET_CONFIG[key]
    if (!config || this._isUnloaded) return
    this.cancelSearchTimer()
    const choices = this.data[config.choicesKey] || ['不限']
    const selectedIndex = Number(event && event.detail ? event.detail.value : 0)
    const value = selectedIndex > 0 && choices[selectedIndex] ? choices[selectedIndex] : ''
    const nextData = { ...this.data, [key]: value }
    const active = hasActiveFilters(nextData)
    this.invalidateServerRequest()
    this.setData({
      [key]: value,
      [config.indexKey]: value ? selectedIndex : 0,
      hasActiveFilters: active,
      mode: active ? 'facet' : 'global',
      modeLabel: active ? '课程筛选结果' : '四类搜索',
      selectedType: active ? 'course' : '',
      visibleLimit: LOCAL_BATCH_SIZE
    }, () => {
      if (active) this.loadCourses()
      else if (boundedQuery(this.data.query)) this.executeGlobalSearch()
      else this.enterIdle()
    })
  },
  clearFilter(event) {
    const key = event && event.currentTarget && event.currentTarget.dataset.key
    if (!FACET_CONFIG[key] || this._isUnloaded) return
    this.cancelSearchTimer()
    this.invalidateServerRequest()
    const nextData = { ...this.data, [key]: '' }
    const active = hasActiveFilters(nextData)
    this.setData({
      [key]: '',
      [FACET_CONFIG[key].indexKey]: 0,
      hasActiveFilters: active,
      mode: active ? 'facet' : 'global',
      modeLabel: active ? '课程筛选结果' : '四类搜索',
      selectedType: active ? 'course' : '',
      visibleLimit: LOCAL_BATCH_SIZE
    }, () => {
      if (active) this.loadCourses()
      else if (boundedQuery(this.data.query)) this.executeGlobalSearch()
      else this.enterIdle()
    })
  },
  resetFilters() {
    if (this._isUnloaded) return
    this.cancelSearchTimer()
    this.invalidateServerRequest()
    this.setData({
      term: '',
      group: '',
      tag: '',
      assessment: '',
      termChoiceIndex: 0,
      groupChoiceIndex: 0,
      tagChoiceIndex: 0,
      assessmentChoiceIndex: 0,
      hasActiveFilters: false,
      mode: 'global',
      modeLabel: '四类搜索',
      selectedType: '',
      visibleLimit: LOCAL_BATCH_SIZE
    }, () => {
      if (boundedQuery(this.data.query)) this.executeGlobalSearch()
      else this.enterIdle()
    })
  },

  enterIdle() {
    if (this._isUnloaded) return
    this._matchedResults = []
    this.setData({
      loading: false,
      searching: false,
      loadingMore: false,
      error: '',
      loadMoreError: '',
      idle: true,
      hasSearched: false,
      results: [],
      total: 0,
      page: 1,
      visibleLimit: LOCAL_BATCH_SIZE,
      hasMore: false,
      typeTabs: typeTabs({}, this.data.selectedType)
    })
  },
  retry() {
    if (this.data.mode === 'facet') return this.loadCourses()
    if (!this.data.indexReady) return this.loadSearchIndex()
    return this.search()
  },
  retryLoadMore() {
    if (this.data.mode === 'facet' && this.data.hasMore && !this.data.loadingMore) return this.loadCourses({ append: true })
  },
  search() {
    if (hasActiveFilters(this.data)) return this.loadCourses()
    if (!boundedQuery(this.data.query)) {
      this.invalidateServerRequest()
      this.enterIdle()
      return Promise.resolve()
    }
    this.executeGlobalSearch()
    return Promise.resolve()
  },

  async loadSearchIndex() {
    if (this._isUnloaded) return
    if (this._indexPromise) return this._indexPromise
    const requestId = (this._indexRequestId || 0) + 1
    this._indexRequestId = requestId
    this.setData({ loading: true, searching: false, error: '', idle: false })
    this._indexPromise = (async () => {
      try {
        const snapshot = await publicApi.getSearchIndex()
        if (this._isUnloaded || this._indexRequestId !== requestId) return
        this._searchEngine = createSearchEngine(snapshot.items)
        this.setData({
          indexReady: true,
          indexVersion: snapshot.version,
          generatedAt: snapshot.generated_at,
          loading: false,
          error: ''
        })
        if (boundedQuery(this.data.query) && !hasActiveFilters(this.data)) this.executeGlobalSearch()
        else if (!hasActiveFilters(this.data)) this.enterIdle()
      } catch (error) {
        if (this._isUnloaded || this._indexRequestId !== requestId) return
        this.setData({
          indexReady: false,
          loading: false,
          searching: false,
          error: userErrorMessage(error, 'index'),
          idle: false,
          hasSearched: false,
          results: [],
          total: 0,
          hasMore: false
        })
      } finally {
        if (this._indexRequestId === requestId) this._indexPromise = null
      }
    })()
    return this._indexPromise
  },
  async loadFacetOptions() {
    try {
      const result = await publicApi.getCourses({ page: 1, page_size: 1 })
      if (this._isUnloaded) return
      this.setData(facetPatch(result.facets, this.data))
    } catch (_) {
      // 四类搜索不依赖 facet 元数据；课程筛选入口保留安全空选项。
    }
  },
  executeGlobalSearch(options = {}) {
    if (this._isUnloaded || !this._searchEngine) return
    const query = boundedQuery(this.data.query)
    if (!query) {
      this.enterIdle()
      return
    }
    this.invalidateServerRequest()
    const visibleLimit = options.preserveVisible ? this.data.visibleLimit : LOCAL_BATCH_SIZE
    const searchResult = this._searchEngine.search(query, {
      type: this.data.selectedType,
      limit: Number.MAX_SAFE_INTEGER
    })
    this._matchedResults = searchResult.results.map(item => buildSearchPresentation(item, query))
    const results = this._matchedResults.slice(0, visibleLimit)
    this.setData({
      mode: 'global',
      modeLabel: '四类搜索',
      loading: false,
      searching: false,
      loadingMore: false,
      error: '',
      loadMoreError: '',
      idle: false,
      hasSearched: true,
      results,
      total: this._matchedResults.length,
      page: 1,
      visibleLimit,
      hasMore: results.length < this._matchedResults.length,
      typeTabs: typeTabs(searchResult.counts, this.data.selectedType)
    })
  },
  showMoreLocal() {
    const visibleLimit = this.data.visibleLimit + LOCAL_BATCH_SIZE
    const results = (this._matchedResults || []).slice(0, visibleLimit)
    this.setData({
      results,
      visibleLimit,
      hasMore: results.length < (this._matchedResults || []).length,
      loadingMore: false,
      loadMoreError: ''
    })
  },

  async loadCourses(options = {}) {
    if (this._isUnloaded) return
    const append = options.append === true
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    const snapshot = {
      query: boundedQuery(this.data.query),
      term: this.data.term,
      group: this.data.group,
      tag: this.data.tag,
      assessment: this.data.assessment,
      page: append ? this.data.page + 1 : 1,
      pageSize: this.data.pageSize,
      results: append ? [...this.data.results] : []
    }
    if (append) {
      this.setData({ loadingMore: true, loadMoreError: '' })
    } else {
      this.setData({
        mode: 'facet',
        modeLabel: '课程筛选结果',
        selectedType: 'course',
        loading: true,
        searching: false,
        loadingMore: false,
        error: '',
        loadMoreError: '',
        idle: false,
        hasSearched: true,
        results: [],
        total: 0,
        page: 1,
        hasMore: false
      })
    }

    const query = {
      page: snapshot.page,
      page_size: snapshot.pageSize,
      q: snapshot.query,
      term: snapshot.term,
      group: snapshot.group,
      tag: snapshot.tag,
      assessment: snapshot.assessment
    }
    try {
      const result = await publicApi.getCourses(query)
      if (this._isUnloaded || this._requestId !== requestId) return
      const optionsPatch = facetPatch(result.facets, snapshot)
      const pageItems = (Array.isArray(result.items) ? result.items : []).map(course => buildCoursePresentation(course, snapshot.query))
      const results = dedupeCourses(append ? [...snapshot.results, ...pageItems] : pageItems)
      const total = Number.isFinite(Number(result.total)) ? Math.max(0, Number(result.total)) : results.length
      const page = Number.isInteger(Number(result.page)) && Number(result.page) > 0 ? Number(result.page) : snapshot.page
      const pageSize = Number.isInteger(Number(result.page_size)) && Number(result.page_size) > 0 ? Number(result.page_size) : snapshot.pageSize
      this.setData({
        ...optionsPatch,
        results,
        total,
        page,
        hasMore: pageItems.length > 0 && page * pageSize < total,
        loading: false,
        loadingMore: false,
        error: '',
        loadMoreError: '',
        idle: false,
        hasSearched: true
      })
    } catch (error) {
      if (this._isUnloaded || this._requestId !== requestId) return
      if (append) {
        this.setData({ loadingMore: false, loadMoreError: '加载更多失败，请重试。' })
        return
      }
      this.setData({
        loading: false,
        searching: false,
        loadingMore: false,
        error: userErrorMessage(error, 'courses'),
        loadMoreError: '',
        idle: false,
        hasSearched: true
      })
    }
  },

  openResult(event) {
    const key = event && event.currentTarget && event.currentTarget.dataset.key
    const result = this.data.results.find(item => item.key === key)
    if (!result) return
    if (result.type === 'course') {
      navigation.openCourse(result.id)
      return
    }
    if (result.type === 'teacher') {
      this.setData({
        query: result.name,
        selectedType: 'course',
        visibleLimit: LOCAL_BATCH_SIZE
      }, () => this.executeGlobalSearch())
      return
    }
    if (result.type === 'resource') {
      if (result.course_id) navigation.openCourseResources(result.course_id)
      else if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '该资料缺少所属课程，暂时无法打开。', icon: 'none' })
      }
      return
    }
    if (result.type === 'guide') navigation.openGuide(result.id)
  }
})