const api = require('../../utils/request')

const ratingLabels = {
  difficulty: '课程难度',
  workload: '作业量',
  gain: '收获程度',
  recommend: '推荐程度'
}

function buildRatingFields(scores) {
  return Object.keys(ratingLabels).map(key => ({ key, label: ratingLabels[key], value: scores[key] || 0 }))
}

Page({
  data: {
    courseId: '', loading: true, submitting: false, course: null,
    offeringIndex: -1, offeringName: '请选择开课实例',
    scoreOptions: [1, 2, 3, 4, 5],
    scores: { difficulty: 0, workload: 0, gain: 0, recommend: 0 },
    ratingFields: buildRatingFields({}),
    tagOptions: ['讲解清楚', '作业偏多', '考试常规', '需要预习', '资料齐全', '适合自学'].map(text => ({ text, selected: false })),
    selectedTags: [], body: '', bodyLength: 0
  },
  onLoad(options) { this.setData({ courseId: options.course_id || '' }); this.prepare() },
  async prepare() {
    try {
      await getApp().ensureLogin()
      const course = await api.get(`/courses/${this.data.courseId}`)
      const offeringIndex = course.offerings.length === 1 ? 0 : -1
      this.setData({ course, offeringIndex, offeringName: offeringIndex === 0 ? course.offerings[0].display_name : '请选择开课实例', loading: false })
    } catch (error) {
      this.setData({ loading: false })
      wx.showModal({ title: '暂时无法评价', content: error.message, showCancel: false })
    }
  },
  chooseOffering(event) {
    const offeringIndex = Number(event.detail.value)
    this.setData({ offeringIndex, offeringName: this.data.course.offerings[offeringIndex].display_name })
  },
  setScore(event) {
    const field = event.currentTarget.dataset.field
    const scores = { ...this.data.scores, [field]: Number(event.currentTarget.dataset.score) }
    this.setData({ scores, ratingFields: buildRatingFields(scores) })
  },
  toggleTag(event) {
    const tag = event.currentTarget.dataset.tag
    if (!this.data.selectedTags.includes(tag) && this.data.selectedTags.length >= 5) {
      wx.showToast({ title: '最多选择 5 个标签', icon: 'none' })
      return
    }
    const selectedTags = this.data.selectedTags.includes(tag) ? this.data.selectedTags.filter(item => item !== tag) : [...this.data.selectedTags, tag]
    this.setData({ selectedTags, tagOptions: this.data.tagOptions.map(item => ({ ...item, selected: selectedTags.includes(item.text) })) })
  },
  inputBody(event) { this.setData({ body: event.detail.value, bodyLength: event.detail.value.length }) },
  async submit() {
    const { course, offeringIndex, scores, selectedTags, body } = this.data
    if (offeringIndex < 0 || Object.values(scores).some(value => !value) || body.trim().length < 20) {
      wx.showToast({ title: '请选择教师、完成评分并填写至少20字', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await api.post('/reviews', { offering_id: course.offerings[offeringIndex].id, ...scores, tags: selectedTags, body: body.trim(), anonymous: true })
      wx.showModal({ title: '提交成功', content: '评价已进入审核，公开页面将保持匿名。', showCancel: false, success: () => wx.navigateBack() })
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
