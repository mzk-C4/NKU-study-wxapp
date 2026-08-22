const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const auth = require('../../services/auth')

function createWriteReviewPage(api = publicApi) {
  return {
  data: {
    courseId: '', loading: true, submitting: false, course: null, strictTeacher: false, teacherOptions: [],
    error: '',
    teacher: '', scoreOptions: [1, 2, 3, 4, 5], rating: 0,
    tagOptions: [],
    selectedTags: [], body: '', anonymous: true
  },
  onLoad(options) { reportVisit('/mp/write-review'); this.setData({ courseId: options.course_id || '' }); this.prepare() },
  async prepare() {
    this.setData({ loading: true, error: '' })
    try {
      const [course, home] = await Promise.all([
        api.getCourse(this.data.courseId),
        api.getHome().catch(() => null)
      ])
      const groups = await api.getCourseReviewGroups(course)
      const tagOptions = [...new Set(groups.flatMap(group => (group.items || []).flatMap(review => review.tags)))].map(text => ({ text, selected: false }))
      const strictTeacher = home ? home.review_submission?.allow_custom_teacher === false : false
      let teacherOptions = course.teacher_groups.map(group => group.teacher_name)
      if (api.searchCatalog) {
        try {
          const catalog = await api.searchCatalog(course.name, 1)
          const hit = (catalog.items || []).find(item => item.name === course.name)
          if (hit && hit.teachers.length) teacherOptions = [...new Set([...teacherOptions, ...hit.teachers])]
        } catch {}
      }
      this.setData({ course, tagOptions, strictTeacher, teacherOptions, loading: false, error: '' })
    } catch (error) {
      this.setData({ loading: false, error: error.message || '暂时无法加载评价页面' })
    }
  },
  inputTeacher(event) { this.setData({ teacher: event.detail.value }) },
  chooseTeacher(event) { this.setData({ teacher: event.currentTarget.dataset.teacher }) },
  validateTeacherStrict() {
    if (!this.data.strictTeacher || !this.data.teacherOptions.length) return true
    return this.data.teacherOptions.includes(this.data.teacher)
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
    const { course, teacher, rating, selectedTags, body, anonymous } = this.data
    if (!teacher.trim() || !rating || body.trim().length < 20) {
      wx.showToast({ title: '请填写教师、完成评分并填写至少 20 字', icon: 'none' })
      return
    }
    if (!this.validateTeacherStrict()) {
      wx.showToast({ title: '请从教师列表中选择', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const headers = (!anonymous && auth.getToken()) ? auth.authHeader() : {}
      await api.submitReview({ course_id: course.id, teacher: teacher.trim(), rating, tags: selectedTags, body: body.trim(), anonymous }, headers)
      wx.showModal({ title: '提交成功', content: anonymous || !auth.getToken() ? '评价已提交，公开页面保持匿名。' : '评价已提交并与你的账号绑定，可在「我的-我的评价」查看审核进度；公开展示仍为匿名。', showCancel: false, success: () => wx.navigateBack() })
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