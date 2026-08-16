const publicApi = require('../../services/public-api')
const navigation = require('../../utils/navigation')
const { buildCoursePresentation } = require('./presentation')

const PAGE_SIZE = 20
const FACET_CONFIG = Object.freeze({
  term: { label: '修读阶段', optionsKey: 'termOptions', choicesKey: 'termChoices', indexKey: 'termChoiceIndex' },
  group: { label: '课程类别', optionsKey: 'groupOptions', choicesKey: 'groupChoices', indexKey: 'groupChoiceIndex' },
  tag: { label: '课程标签', optionsKey: 'tagOptions', choicesKey: 'tagChoices', indexKey: 'tagChoiceIndex' },
  assessment: { label: '考核方式', optionsKey: 'assessmentOptions', choicesKey: 'assessmentChoices', indexKey: 'assessmentChoiceIndex' }
})

function boundedQuery(value) {
  return String(value == null ? '' : value).slice(0, 80).trim()
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

function userErrorMessage(error) {
  if (error && (error.code === 'NETWORK_ERROR' || error.kind === 'network_error')) {
    return '网络连接失败，请检查网络后重试。'
  }
  return '暂时无法加载课程，请稍后重试。'
}

Page({
  data: {
    query: '',
    loading: true,
    loadingMore: false,
    error: '',
    loadMoreError: '',
    idle: false,
    hasSearched: false,
    results: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: false,
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

  onLoad(options = {}) {
    this._isUnloaded = false
    this._requestId = 0
    const query = String(options.q == null ? '' : options.q).slice(0, 80)
    this.setData({ query })
    return boundedQuery(query) ? this.search() : this.loadFacets()
  },
  onUnload() {
    this._isUnloaded = true
    this._requestId = (this._requestId || 0) + 1
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = null
  },
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) this.loadCourses({ append: true })
  },

  input(event) {
    if (this._isUnloaded) return
    const query = String(event && event.detail ? event.detail.value : '').slice(0, 80)
    this._requestId = (this._requestId || 0) + 1
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = null
    this.setData({ query, error: '', loadMoreError: '' })
    if (!boundedQuery(query) && !hasActiveFilters(this.data)) {
      this.enterIdle()
      return
    }
    this.searchTimer = setTimeout(() => this.search(), 250)
  },
  submit() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = null
    return this.search()
  },
  clearQuery() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = null
    this._requestId = (this._requestId || 0) + 1
    this.setData({ query: '' }, () => {
      if (hasActiveFilters(this.data)) this.search()
      else this.enterIdle()
    })
  },
  clear() {
    return this.clearQuery()
  },
  changeFacet(event) {
    const key = event && event.currentTarget && event.currentTarget.dataset.key
    const config = FACET_CONFIG[key]
    if (!config || this._isUnloaded) return
    const choices = this.data[config.choicesKey] || ['不限']
    const selectedIndex = Number(event && event.detail ? event.detail.value : 0)
    const value = selectedIndex > 0 && choices[selectedIndex] ? choices[selectedIndex] : ''
    const nextData = { ...this.data, [key]: value }
    this._requestId = (this._requestId || 0) + 1
    this.setData({
      [key]: value,
      [config.indexKey]: value ? selectedIndex : 0,
      hasActiveFilters: hasActiveFilters(nextData)
    }, () => this.search())
  },
  clearFilter(event) {
    const key = event && event.currentTarget && event.currentTarget.dataset.key
    if (!FACET_CONFIG[key] || this._isUnloaded) return
    this._requestId = (this._requestId || 0) + 1
    const nextData = { ...this.data, [key]: '' }
    this.setData({ [key]: '', [FACET_CONFIG[key].indexKey]: 0, hasActiveFilters: hasActiveFilters(nextData) }, () => {
      if (boundedQuery(this.data.query) || hasActiveFilters(this.data)) this.search()
      else this.enterIdle()
    })
  },
  resetFilters() {
    if (this._isUnloaded) return
    this._requestId = (this._requestId || 0) + 1
    this.setData({
      term: '',
      group: '',
      tag: '',
      assessment: '',
      termChoiceIndex: 0,
      groupChoiceIndex: 0,
      tagChoiceIndex: 0,
      assessmentChoiceIndex: 0,
      hasActiveFilters: false
    }, () => {
      if (boundedQuery(this.data.query)) this.search()
      else this.enterIdle()
    })
  },
  enterIdle() {
    if (this._isUnloaded) return
    this.setData({
      loading: false,
      loadingMore: false,
      error: '',
      loadMoreError: '',
      idle: true,
      hasSearched: false,
      results: [],
      total: 0,
      page: 1,
      hasMore: false
    })
  },
  retry() {
    if (boundedQuery(this.data.query) || hasActiveFilters(this.data) || this.data.hasSearched) return this.search()
    return this.loadFacets()
  },
  retryLoadMore() {
    if (this.data.hasMore && !this.data.loadingMore) return this.loadCourses({ append: true })
  },
  loadFacets() {
    return this.loadCourses({ facetsOnly: true })
  },
  search() {
    if (!boundedQuery(this.data.query) && !hasActiveFilters(this.data)) {
      this._requestId = (this._requestId || 0) + 1
      this.enterIdle()
      return Promise.resolve()
    }
    return this.loadCourses()
  },
  async loadCourses(options = {}) {
    if (this._isUnloaded) return
    const append = options.append === true
    const facetsOnly = options.facetsOnly === true
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    const snapshot = {
      query: boundedQuery(this.data.query),
      term: this.data.term,
      group: this.data.group,
      tag: this.data.tag,
      assessment: this.data.assessment,
      page: append ? this.data.page + 1 : 1,
      pageSize: facetsOnly ? 1 : this.data.pageSize,
      results: append ? [...this.data.results] : []
    }
    if (facetsOnly) {
      this.setData({ loading: true, loadingMore: false, error: '', loadMoreError: '', idle: false })
    } else if (append) {
      this.setData({ loadingMore: true, loadMoreError: '' })
    } else {
      this.setData({
        loading: true,
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
      if (facetsOnly) {
        this.setData({
          ...optionsPatch,
          loading: false,
          error: '',
          idle: true,
          hasSearched: false
        })
        return
      }

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
        loadingMore: false,
        error: userErrorMessage(error),
        loadMoreError: '',
        idle: false,
        hasSearched: !facetsOnly
      })
    }
  },

  openResult(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    if (id) navigation.openCourse(id)
  }
})
