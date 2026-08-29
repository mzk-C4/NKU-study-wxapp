const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')

const PICKER_LIMIT = 30

function buildPickerEntries(groupsResult, coursesResult) {
  const courses = Array.isArray(coursesResult && coursesResult.items) ? coursesResult.items : []
  const groups = Array.isArray(groupsResult && groupsResult.items) ? groupsResult.items : []
  const courseEntries = courses.filter(course => course && course.id).map(course => ({
    key: `course-${course.id}`,
    type: 'course',
    id: course.id,
    name: course.name || '',
    group: course.group || '',
    teachers: (course.teacher_groups || []).map(item => item && item.teacher_name).filter(Boolean)
  }))
  const courseNames = new Set(courseEntries.map(entry => entry.name.trim()))
  const groupMap = new Map()
  for (const group of groups) {
    const name = String(group && group.course_name || '').trim()
    if (!name || courseNames.has(name)) continue
    if (!groupMap.has(name)) groupMap.set(name, { key: `group-${name}`, type: 'group', name, group: '历史评价', teachers: [] })
    const entry = groupMap.get(name)
    const teacher = String(group.teacher_name || '').trim()
    if (teacher && !entry.teachers.includes(teacher)) entry.teachers.push(teacher)
  }
  return [...courseEntries, ...groupMap.values()]
}

function filterEntries(entries, keyword) {
  const query = String(keyword || '').trim().toLowerCase()
  if (!query) return entries.slice(0, PICKER_LIMIT)
  return entries
    .filter(entry => (
      entry.name.toLowerCase().includes(query)
      || entry.group.toLowerCase().includes(query)
      || entry.teachers.some(teacher => teacher.toLowerCase().includes(query))
    ))
    .slice(0, PICKER_LIMIT)
}

function createWriteReviewPage(api = publicApi) {
  return {
    onShow() { theme.onPageShow() },
  data: {
    courseId: '', loading: true, submitting: false, course: null,
    error: '',
    teacher: '', scoreOptions: [1, 2, 3, 4, 5], rating: 0,
    body: '', anonymous: true,
    minLength: 12, moderationRequired: true,
    pickerMode: false, pickerKeyword: '', pickerEntries: [], pickerFiltered: [],
    isGroupMode: false, groupCourseTitle: ''
  },
  onLoad(options) {
    reportVisit('/mp/write-review')
    this.setData({
      courseId: options.course_id || '',
      groupCourseTitle: options.course_title || '',
      isGroupMode: Boolean(options.course_title) && !options.course_id
    })
    this.prepare()
  },
  async prepare() {
    this.setData({ loading: true, error: '' })
    try {
      const home = await (typeof api.getHome === 'function' ? api.getHome().catch(() => null) : Promise.resolve(null))
      const submission = home && home.review_submission ? home.review_submission : null
      const rules = {
        minLength: submission ? submission.min_length : 12,
        moderationRequired: submission ? submission.moderation_required : true
      }
      if (this.data.courseId) {
        const course = await api.getCourse(this.data.courseId)
        this.setData({ course, pickerMode: false, isGroupMode: false, loading: false, error: '', ...rules })
      } else if (this.data.groupCourseTitle) {
        // 从历史评价组进入：course_title 精确命中已有评价组
        const groupsResult = await api.getReviewGroups().catch(() => ({ items: [] }))
        const teachers = (groupsResult.items || [])
          .filter(group => String(group.course_name || '').trim() === this.data.groupCourseTitle.trim())
          .map(group => String(group.teacher_name || '').trim())
          .filter(Boolean)
        const uniqueTeachers = [...new Set(teachers)]
        this.setData({
          course: { id: '', name: this.data.groupCourseTitle, group: '历史评价', teacher_groups: uniqueTeachers.map(teacher => ({ teacher_name: teacher })) },
          isGroupMode: true, pickerMode: false, loading: false, error: '', ...rules
        })
      } else {
        const [groupsResult, coursesResult] = await Promise.all([
          api.getReviewGroups().catch(() => ({ items: [] })),
          api.getCourses({ page: 1, page_size: 100 }).catch(() => ({ items: [] }))
        ])
        const entries = buildPickerEntries(groupsResult, coursesResult)
        this.setData({ pickerMode: true, pickerEntries: entries, pickerFiltered: filterEntries(entries, ''), course: null, loading: false, error: '', ...rules })
      }
    } catch (error) {
      this.setData({ loading: false, error: error.message || '暂时无法加载评价页面' })
    }
  },
  inputPickerKeyword(event) {
    const keyword = event.detail.value
    this.setData({ pickerKeyword: keyword, pickerFiltered: filterEntries(this.data.pickerEntries, keyword) })
  },
  tapPickerEntry(event) {
    const index = Number(event.currentTarget.dataset.index)
    const entry = this.data.pickerFiltered[index]
    if (!entry) return
    if (entry.type === 'course') {
      this.setData({ courseId: entry.id, groupCourseTitle: '', pickerMode: false, teacher: '', rating: 0, body: '' })
    } else {
      this.setData({ groupCourseTitle: entry.name, courseId: '', pickerMode: false, teacher: '', rating: 0, body: '' })
    }
    this.prepare()
  },
  reselectCourse() {
    this.setData({ courseId: '', groupCourseTitle: '', course: null, pickerMode: true })
    this.prepare()
  },
  inputTeacher(event) { this.setData({ teacher: event.detail.value }) },
  chooseTeacher(event) { this.setData({ teacher: event.currentTarget.dataset.teacher }) },
  setRating(event) { this.setData({ rating: Number(event.currentTarget.dataset.score) }) },
  inputBody(event) { this.setData({ body: event.detail.value }) },
  toggleAnonymous(event) { this.setData({ anonymous: event.detail.value }) },
  async submit() {
    const { course, isGroupMode, groupCourseTitle, teacher, rating, body, anonymous, minLength } = this.data
    if (!teacher.trim() || !rating || body.trim().length < minLength) {
      wx.showToast({ title: `请填写教师、完成评分并填写至少 ${minLength} 字`, icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const payload = isGroupMode
        ? { course_title: groupCourseTitle, teacher: teacher.trim(), rating, body: body.trim(), anonymous }
        : { course_id: course.id, teacher: teacher.trim(), rating, body: body.trim(), anonymous }
      await api.submitReview(payload)
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

module.exports = { createWriteReviewPage, buildPickerEntries, filterEntries }
