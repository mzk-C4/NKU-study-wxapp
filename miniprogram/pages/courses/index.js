const { publicApi } = require('../../services/public-api')
const navigation = require('../../utils/navigation')
const { createRequestGeneration } = require('../../utils/request-generation')

Page({
  data: {
    loading: true, loadingMore: false, error: '', courses: [], total: 0, page: 1, pageSize: 50, hasMore: true,
    groups: ['全部'], group: '', termOptions: ['全部学期'], term: '', tagOptions: ['全部标签'], tag: '', assessmentOptions: ['全部考核'], assessment: ''
  },
  requestGeneration: createRequestGeneration(),
  onLoad() { this.loadCourses() },
  onPullDownRefresh() { this.loadCourses().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() {
    if (!this.data.loading && !this.data.loadingMore && this.data.hasMore) this.loadCourses({ append: true })
  },
  async loadCourses({ append = false } = {}) {
    const token = this.requestGeneration.begin({ newQuery: !append })
    const page = append ? this.data.page + 1 : 1
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, error: '' })
    try {
      const result = await publicApi.getCourses({ group: this.data.group, term: this.data.term, tag: this.data.tag, assessment: this.data.assessment, page, page_size: this.data.pageSize })
      if (!this.requestGeneration.isLatest(token)) return
      const facets = result.facets
      const courses = append ? [...this.data.courses, ...result.items] : result.items
      this.setData({
        courses,
        total: result.total, page: result.page, hasMore: courses.length < result.total, loading: false, loadingMore: false,
        groups: ['全部', ...facets.groups], termOptions: ['全部学期', ...facets.terms], tagOptions: ['全部标签', ...facets.tags], assessmentOptions: ['全部考核', ...facets.assessments]
      })
    } catch (error) {
      if (this.requestGeneration.isLatest(token)) this.setData({ loading: false, loadingMore: false, error: error.message })
    }
  },
  chooseGroup(event) {
    const value = event.currentTarget.dataset.value
    this.setData({ group: value === '全部' ? '' : value }, () => this.loadCourses())
  },
  chooseTerm(event) {
    const index = Number(event.detail.value)
    this.setData({ term: index ? this.data.termOptions[index] : '' }, () => this.loadCourses())
  },
  chooseTag(event) {
    const index = Number(event.detail.value)
    this.setData({ tag: index ? this.data.tagOptions[index] : '' }, () => this.loadCourses())
  },
  chooseAssessment(event) {
    const index = Number(event.detail.value)
    this.setData({ assessment: index ? this.data.assessmentOptions[index] : '' }, () => this.loadCourses())
  },
  openSearch() { navigation.openSearch() },
  openCourse(event) { navigation.openCourse(event.detail.course.id) },
  submitCourse() { wx.showToast({ title: '课程收录请在网站反馈', icon: 'none' }) }
})
