const api = require('../../utils/request')

Page({
  data: { id: '', loading: true, error: '', course: null, reviews: [], visibleReviews: [], teacherGroups: [], teacher: '' },
  onLoad(options) { this.setData({ id: options.id || '' }); this.loadReviews() },
  async loadReviews() {
    this.setData({ loading: true, error: '' })
    try {
      const [course, data] = await Promise.all([api.get(`/courses/${this.data.id}`), api.get(`/courses/${this.data.id}/reviews`)])
      this.setData({ course, reviews: data.items, visibleReviews: data.items, teacherGroups: data.teacher_groups || [], loading: false })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseTeacher(event) {
    const teacher = event.currentTarget.dataset.teacher || ''
    const visibleReviews = teacher ? this.data.reviews.filter(item => item.teacher_name === teacher) : this.data.reviews
    this.setData({ teacher, visibleReviews })
  },
  openTab(event) {
    const page = event.currentTarget.dataset.tab === 'overview' ? 'course-overview' : 'course-resources'
    wx.redirectTo({ url: `/pages/${page}/index?id=${this.data.id}` })
  },
  async writeReview() {
    try { await getApp().ensureLogin(); wx.navigateTo({ url: `/pages/write-review/index?course_id=${this.data.id}` }) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  }
})
