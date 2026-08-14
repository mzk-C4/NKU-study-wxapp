const api = require('../../utils/request')

Page({
  data: {
    courseId: '', loading: true, submitting: false, course: null,
    offeringIndex: -1, offeringName: '请选择任课教师与学期',
    scoreOptions: [1, 2, 3, 4, 5], rating: 0,
    tagOptions: ['讲解清晰', '作业适中', '考核常规', '需要预习', '资料齐全', '适合自学'].map(text => ({ text, selected: false })),
    selectedTags: [], body: '', anonymous: true
  },
  onLoad(options) { this.setData({ courseId: options.course_id || '' }); this.prepare() },
  async prepare() {
    try {
      await getApp().ensureLogin()
      const course = await api.get(`/courses/${this.data.courseId}`)
      const offeringIndex = course.offerings.length === 1 ? 0 : -1
      this.setData({ course, offeringIndex, offeringName: offeringIndex === 0 ? course.offerings[0].display_name : '请选择任课教师与学期', loading: false })
    } catch (error) {
      this.setData({ loading: false })
      wx.showModal({ title: '暂时无法评价', content: error.message, showCancel: false })
    }
  },
  chooseOffering(event) {
    const offeringIndex = Number(event.detail.value)
    this.setData({ offeringIndex, offeringName: this.data.course.offerings[offeringIndex].display_name })
  },
  setRating(event) { this.setData({ rating: Number(event.currentTarget.dataset.score) }) },
  toggleTag(event) {
    const tag = event.currentTarget.dataset.tag
    const selectedTags = this.data.selectedTags.includes(tag) ? this.data.selectedTags.filter(item => item !== tag) : [...this.data.selectedTags, tag]
    this.setData({ selectedTags, tagOptions: this.data.tagOptions.map(item => ({ ...item, selected: selectedTags.includes(item.text) })) })
  },
  inputBody(event) { this.setData({ body: event.detail.value }) },
  toggleAnonymous(event) { this.setData({ anonymous: event.detail.value }) },
  async submit() {
    const { course, offeringIndex, rating, selectedTags, body, anonymous } = this.data
    if (offeringIndex < 0 || !rating || body.trim().length < 20) {
      wx.showToast({ title: '请选择教师、完成评分并填写至少 20 字', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await api.post('/reviews', { offering_id: course.offerings[offeringIndex].id, rating, tags: selectedTags, body: body.trim(), anonymous })
      wx.showModal({ title: '提交成功', content: '评价已进入审核，公开页面将保持匿名。', showCancel: false, success: () => wx.navigateBack() })
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
