const { publicApi } = require('../../services/public-api')
const navigation = require('../../utils/navigation')
const { createRequestGeneration } = require('../../utils/request-generation')

Page({
  data: { query: '', type: 'course', types: [{ key: 'course', label: '课程', count: 0 }, { key: 'review', label: '评价', count: 0 }], loading: true, error: '', results: [] },
  courseItems: [],
  reviewItems: [],
  requestGeneration: createRequestGeneration(),

  onLoad(options) {
    this.setData({ query: options.q || '', type: options.type === 'review' ? 'review' : 'course' })
    this.loadResults()
  },

  async loadResults() {
    const token = this.requestGeneration.begin({ newQuery: true })
    this.setData({ loading: true, error: '' })
    try {
      const query = this.data.query.trim()
      const [courses, reviews] = await Promise.all([publicApi.getCourses({ q: query, page: 1, page_size: 100 }), publicApi.getReviewGroups()])
      if (!this.requestGeneration.isLatest(token)) return
      this.courseItems = courses.items.map(item => ({
        id: item.id, type: 'course', name: item.name, badge: item.group || '课程',
        subtitle: [item.term, item.assessment, item.teachers.join('、')].filter(Boolean).join(' · '), tags: item.tags
      }))
      const normalized = query.toLocaleLowerCase('zh-CN')
      this.reviewItems = reviews.items.filter(item => !normalized || `${item.course_name}\n${item.teacher_name}`.toLocaleLowerCase('zh-CN').includes(normalized)).map(item => ({
        id: item.group_key, type: 'review', group_key: item.group_key, course_id: item.course_id,
        name: `${item.course_name} · ${item.teacher_name}`, badge: item.matched ? '评' : '未匹配',
        subtitle: `${item.review_count} 条评价${item.rating_average == null ? '' : ` · ${item.rating_average} 分`}`, tags: []
      }))
      this.renderResults(token)
    } catch (error) {
      if (this.requestGeneration.isLatest(token)) this.setData({ loading: false, error: error.message })
    }
  },

  input(event) { this.setData({ query: event.detail.value }) },
  submit() { this.loadResults() },
  chooseType(event) { this.setData({ type: event.currentTarget.dataset.type }, () => this.renderResults()) },
  clear() { this.setData({ query: '' }, () => this.loadResults()) },

  renderResults(token) {
    if (token && !this.requestGeneration.isLatest(token)) return
    const source = this.data.type === 'review' ? this.reviewItems : this.courseItems
    const results = source
    const counts = { course: this.courseItems.length, review: this.reviewItems.length }
    const types = this.data.types.map(item => ({ ...item, count: counts[item.key] }))
    this.setData({ types, results, loading: false, error: '' })
  },

  openResult(event) {
    const item = event.currentTarget.dataset.item
    if (item.type === 'course') navigation.openCourse(item.id)
    else wx.navigateTo({ url: `/pages/course-reviews/index?group_key=${encodeURIComponent(item.group_key)}` })
  }
})
