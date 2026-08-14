const api = require('../../utils/request')

Page({
  data: {
    courseId: '', loading: true, submitting: false, course: null,
    teacher: '', scoreOptions: [1, 2, 3, 4, 5], rating: 0,
    tagOptions: ['讲解清晰', '作业适中', '考核常规', '需要预习', '资料齐全', '适合自学'].map(text => ({ text, selected: false })),
    selectedTags: [], body: '', anonymous: true
  },
  onLoad(options) { this.setData({ courseId: options.course_id || '' }); this.prepare() },
  async prepare() {
    try {
      await getApp().ensureLogin()
      const course = await api.get(`/courses/${this.data.courseId}`)
      this.setData({ course, loading: false })
    } catch (error) {
      this.setData({ loading: false })
      wx.showModal({ title: '暂时无法评价', content: error.message, showCancel: false })
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
      await api.post('/reviews', { course_id: course.id, teacher: teacher.trim(), rating, tags: selectedTags, body: body.trim(), anonymous })
      wx.showModal({ title: '提交成功', content: '评价已进入审核，公开页面将保持匿名。', showCancel: false, success: () => wx.navigateBack() })
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
