const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')

function createWriteReviewPage(api = publicApi) {
  return {
  data: {
    courseId: '', loading: true, submitting: false, course: null,
    error: '',
    teacher: '', scoreOptions: [1, 2, 3, 4, 5], rating: 0,
    tagOptions: [],
    selectedTags: [], body: '', anonymous: true
  },
  onLoad(options) { reportVisit('/mp/write-review'); this.setData({ courseId: options.course_id || '' }); this.prepare() },
  async prepare() {
    this.setData({ loading: true, error: '' })
    try {
      const course = await api.getCourse(this.data.courseId)
      const groups = await api.getCourseReviewGroups(course)
      const tagOptions = [...new Set(groups.flatMap(group => (group.items || []).flatMap(review => review.tags)))].map(text => ({ text, selected: false }))
      this.setData({ course, tagOptions, loading: false, error: '' })
    } catch (error) {
      this.setData({ loading: false, error: error.message || '暂时无法加载评价页面' })
    }
  },
  inputTeacher(event) { this.setData({ teacher: event.detail.value }) },
  chooseTeacher(event) { this.setData({ teacher: event.currentTarget.dataset.teacher }) },
  setRating(event) { this.setData({ rating: Number(event.currentTarget.dataset.score) }) },
  toggleTag(event) {
    const tag = event.currentTarget.dataset.tag
    const selectedTags = this.data.selectedTags.includes(tag) ? this.data.selectedTags.filter(item => item !== tag) : [...this.data.selectedTags, tag]
    this.setData({ selectedTags, tagOptions: this.data.tagOptions.map(item => ({ ...item, selected: selectedTags.includes(item.text) })) })
  },
  inputBody(event) { this.setData({ body: event.detail.value }) },
  toggleAnonymous(event) { this.setData({ anonymous: event.detail.value }) },
  async submit() {
    const { course, teacher, rating, selectedTags, body, anonymous } = this.data
    if (!teacher.trim() || !rating || body.trim().length < 20) {
      wx.showToast({ title: '请填写教师、完成评分并填写至少 20 字', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await api.submitReview({ course_id: course.id, teacher: teacher.trim(), rating, tags: selectedTags, body: body.trim(), anonymous })
      wx.showModal({ title: '提交成功', content: '评价已进入审核，公开页面将保持匿名。', showCancel: false, success: () => wx.navigateBack() })
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