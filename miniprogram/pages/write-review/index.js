const { reportVisit } = require('../../utils/visit-report')
const { publicApi } = require('../../services/public-api')
const auth = require('../../services/auth')

function createWriteReviewPage(api = publicApi) {
  return {
  data: {
    loading: true, submitting: false,
    // 课程搜索选课
    courseKeyword: '', courseResults: [], selectedCourse: null,
    // 服务端规则
    strictTeacher: false, teacherOptions: [], minLength: 20, hint: '',
    allowCustomCourse: false,
    error: '',
    teacher: '', scoreOptions: [1, 2, 3, 4, 5], rating: 0,
    tagOptions: [], selectedTags: [], body: '', anonymous: true
  },
  onLoad(options) {
    reportVisit('/mp/write-review')
    this.prepare(options.course_id || '')
  },
  async prepare(presetCourseId) {
    this.setData({ loading: true, error: '' })
    try {
      const home = await api.getHome().catch(() => null)
      const rules = home?.review_submission || {}
      const patch = {
        strictTeacher: rules.allow_custom_teacher === false,
        minLength: rules.min_length || 20,
        hint: rules.hint || '',
        allowCustomCourse: rules.allow_custom_course === true,
        loading: false, error: ''
      }
      // 从课程详情页跳转：预选该课程
      if (presetCourseId) {
        try {
          const course = await api.getCourse(presetCourseId)
          patch.selectedCourse = { type: 'manifest', id: course.id, name: course.name }
          const teachers = await this.loadTeachers(course.name)
          patch.teacherOptions = teachers
        } catch {}
      }
      this.setData(patch)
    } catch (error) {
      this.setData({ loading: false, error: error.message || '暂时无法加载评价页面' })
    }
  },
  async loadTeachers(courseName) {
    // 教师列表 = 手册目录教师
    let teachers = []
    if (api.searchCatalog) {
      try {
        const catalog = await api.searchCatalog(courseName, 1)
        const hit = (catalog.items || []).find(item => item.name === courseName)
        if (hit && hit.teachers.length) teachers = hit.teachers
      } catch {}
    }
    return teachers
  },
  // === 课程搜索 ===
  async inputCourse(event) {
    const keyword = event.detail.value.trim()
    this.setData({ courseKeyword: keyword })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    if (!keyword) { this.setData({ courseResults: [] }); return }
    this.searchTimer = setTimeout(async () => {
      try {
        const results = await this.searchCourses(keyword)
        this.setData({ courseResults: results.slice(0, 12) })
      } catch { this.setData({ courseResults: [] }) }
    }, 250)
  },
  async searchCourses(keyword) {
    const results = []
    // 1) 课程库（可跳转详情页）
    try {
      const manifest = await api.searchCourses({ q: keyword, page: 1, page_size: 6 })
      for (const c of manifest.items) {
        results.push({ type: 'manifest', id: c.id, name: c.name, sub: c.term || '' })
      }
    } catch {}
    // 2) 手册目录（1811 门，含教师）
    if (api.searchCatalog) {
      try {
        const catalog = await api.searchCatalog(keyword, 1)
        const manifestNames = new Set(results.map(r => r.name))
        for (const c of (catalog.items || []).slice(0, 8)) {
          if (!manifestNames.has(c.name)) {
            results.push({ type: 'catalog', id: c.id, name: c.name, sub: (c.teachers || []).slice(0, 3).join('、') || (c.categories || [])[0] || '' })
          }
        }
      } catch {}
    }
    return results
  },
  async chooseCourse(event) {
    const { type, id, name } = event.currentTarget.dataset
    const teachers = await this.loadTeachers(name)
    this.setData({
      selectedCourse: { type, id, name },
      courseKeyword: name,
      courseResults: [],
      teacherOptions: teachers,
      teacher: ''
    })
  },
  clearCourse() {
    this.setData({ selectedCourse: null, courseKeyword: '', courseResults: [], teacherOptions: [], teacher: '' })
  },
  // === 教师 ===
  inputTeacher(event) { this.setData({ teacher: event.detail.value }) },
  chooseTeacher(event) { this.setData({ teacher: event.currentTarget.dataset.teacher }) },
  validateTeacherStrict() {
    if (!this.data.strictTeacher || !this.data.teacherOptions.length) return true
    return this.data.teacherOptions.includes(this.data.teacher)
  },
  // === 评分 / 内容 ===
  setRating(event) { this.setData({ rating: Number(event.currentTarget.dataset.score) }) },
  toggleTag(event) {
    const tag = event.currentTarget.dataset.tag
    const selectedTags = this.data.selectedTags.includes(tag) ? this.data.selectedTags.filter(item => item !== tag) : [...this.data.selectedTags, tag]
    this.setData({ selectedTags, tagOptions: this.data.tagOptions.map(item => ({ ...item, selected: selectedTags.includes(item.text) })) })
  },
  inputBody(event) { this.setData({ body: event.detail.value }) },
  toggleAnonymous(event) { this.setData({ anonymous: event.detail.value }) },
  // === 提交 ===
  async submit() {
    const { selectedCourse, teacher, rating, body, anonymous, allowCustomCourse } = this.data
    const courseKeyword = this.data.courseKeyword.trim()
    if (!selectedCourse && !courseKeyword) {
      wx.showToast({ title: '请搜索选择课程或输入课程名', icon: 'none' }); return
    }
    if (!selectedCourse && !allowCustomCourse) {
      wx.showToast({ title: '请从搜索结果中选择课程', icon: 'none' }); return
    }
    if (!teacher.trim() || !rating || body.trim().length < this.data.minLength) {
      wx.showToast({ title: `请填写教师、完成评分并填写至少 ${this.data.minLength} 字`, icon: 'none' }); return
    }
    if (!this.validateTeacherStrict()) {
      wx.showToast({ title: '请从教师列表中选择', icon: 'none' }); return
    }
    this.setData({ submitting: true })
    try {
      const headers = (!anonymous && auth.getToken()) ? auth.authHeader() : {}
      const payload = { teacher: teacher.trim(), rating, body: body.trim(), anonymous }
      if (selectedCourse?.type === 'manifest') {
        payload.course_id = selectedCourse.id
      } else if (selectedCourse?.type === 'catalog') {
        payload.catalog_course_id = selectedCourse.id
      } else {
        payload.courseTitle = courseKeyword
      }
      await api.submitReview(payload, headers)
      wx.showModal({
        title: '提交成功',
        content: anonymous || !auth.getToken()
          ? '评价已提交，公开页面保持匿名。'
          : '评价已提交并与你的账号绑定，可在「我的-我的评价」查看；公开展示仍为匿名。',
        showCancel: false, success: () => wx.navigateBack()
      })
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
