const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')

function createWriteReviewPage(api = publicApi) {
  return {
    onShow() { theme.onPageShow() },
  data: {
    courseId: '', loading: true, submitting: false, course: null,
    error: '',
    teacher: '', scoreOptions: [1, 2, 3, 4, 5], rating: 0,
    body: '', anonymous: true,
    minLength: 12, moderationRequired: true
  },
  onLoad(options) { reportVisit('/mp/write-review'); this.setData({ courseId: options.course_id || '' }); this.prepare() },
  async prepare() {
    this.setData({ loading: true, error: '' })
    try {
      const home = await (typeof api.getHome === 'function' ? api.getHome().catch(() => null) : Promise.resolve(null))
      const course = await api.getCourse(this.data.courseId)
      const submission = home && home.review_submission ? home.review_submission : null
      this.setData({
        course, loading: false, error: '',
        minLength: submission ? submission.min_length : 12,
        moderationRequired: submission ? submission.moderation_required : true
      })
    } catch (error) {
      this.setData({ loading: false, error: error.message || '暂时无法加载评价页面' })
    }
  },
  inputTeacher(event) { this.setData({ teacher: event.detail.value }) },
  chooseTeacher(event) { this.setData({ teacher: event.currentTarget.dataset.teacher }) },
  setRating(event) { this.setData({ rating: Number(event.currentTarget.dataset.score) }) },
  inputBody(event) { this.setData({ body: event.detail.value }) },
  toggleAnonymous(event) { this.setData({ anonymous: event.detail.value }) },
  async submit() {
    const { course, teacher, rating, body, anonymous, minLength } = this.data
    if (!teacher.trim() || !rating || body.trim().length < minLength) {
      wx.showToast({ title: `请填写教师、完成评分并填写至少 ${minLength} 字`, icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await api.submitReview({ course_id: course.id, teacher: teacher.trim(), rating, body: body.trim(), anonymous })
      const content = this.data.moderationRequired
        ? '评价已进入审核，通过后将公开展示，公开页面保持匿名。'
        : '评价已提交并公开展示，公开页面保持匿名。'
      wx.showModal({ title: '提交成功', content, showCancel: false, success: () => wx.navigateBack() })
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
  }
}

Page(createWriteReviewPage())

module.exports = { createWriteReviewPage }
