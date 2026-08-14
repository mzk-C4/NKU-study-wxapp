const api = require('../../utils/request')

Page({
  data: {
    loading: true, submitting: false, courses: [], courseIndex: -1,
    typeOptions: ['试卷', '笔记', '课件', '作业', '教材'], typeIndex: -1,
    providerOptions: ['夸克网盘', '百度网盘', '阿里云盘', '其他'], providerIndex: -1,
    form: { title: '', share_url: '', extraction_code: '', description: '' }
  },
  presetCourseId: '',
  onLoad(options) { this.presetCourseId = options.course_id || ''; this.prepare() },
  async prepare() {
    try {
      await getApp().ensureLogin()
      const result = await api.get('/courses', { page: 1, page_size: 200 })
      const courseIndex = result.items.findIndex(item => item.id === this.presetCourseId)
      this.setData({ courses: result.items, courseIndex, loading: false })
    } catch (error) { this.setData({ loading: false }); wx.showModal({ title: '暂时无法投稿', content: error.message, showCancel: false }) }
  },
  chooseCourse(event) { this.setData({ courseIndex: Number(event.detail.value) }) },
  chooseType(event) { this.setData({ typeIndex: Number(event.detail.value) }) },
  chooseProvider(event) { this.setData({ providerIndex: Number(event.detail.value) }) },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }) },
  saveDraft() { wx.setStorageSync('resource_draft', { ...this.data.form, courseIndex: this.data.courseIndex, typeIndex: this.data.typeIndex, providerIndex: this.data.providerIndex }); wx.showToast({ title: '草稿已保存' }) },
  async submit() {
    const { courseIndex, typeIndex, providerIndex, courses, typeOptions, providerOptions, form } = this.data
    if (courseIndex < 0 || typeIndex < 0 || providerIndex < 0 || !form.title.trim() || !/^https?:\/\//.test(form.share_url)) {
      wx.showToast({ title: '请完整填写课程、类型、网盘、标题和有效链接', icon: 'none' }); return
    }
    this.setData({ submitting: true })
    try {
      await api.post('/resource-submissions', { course_id: courses[courseIndex].id, type: typeOptions[typeIndex], storage_provider: providerOptions[providerIndex], ...form })
      wx.removeStorageSync('resource_draft')
      wx.showModal({ title: '提交成功', content: '资料已进入待审核状态，可在“我的投稿”中查看。', showCancel: false, success: () => wx.navigateBack() })
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
    finally { this.setData({ submitting: false }) }
  }
})
