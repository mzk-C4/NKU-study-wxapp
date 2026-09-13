const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')
const authSession = require('../../utils/auth-session')

const PICKER_LIMIT = 30

function aggregateReviewStats(groups) {
  const map = new Map()
  for (const group of groups) {
    const name = String(group && group.course_name || '').trim()
    if (!name) continue
    const count = Number(group.review_count) || 0
    const entry = map.get(name) || { total: 0, teachers: new Map() }
    entry.total += count
    const teacher = String(group.teacher_name || '').trim()
    if (teacher) entry.teachers.set(teacher, (entry.teachers.get(teacher) || 0) + count)
    map.set(name, entry)
  }
  return map
}

function statsSubLine(stats, fallbackCount = 0) {
  const total = stats ? stats.total : (fallbackCount || 0)
  if (!total) return '暂时没有评价'
  const teachers = stats
    ? [...stats.teachers.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
    : []
  if (!teachers.length) return `共${total}条评价`
  const shown = teachers.slice(0, 3).join('、')
  const more = teachers.length > 3 ? '等' : ''
  return `共${total}条评价，已有老师：${shown}${more}`
}

function buildPickerEntries(groupsResult, coursesResult, catalogResult) {
  const groups = Array.isArray(groupsResult && groupsResult.items) ? groupsResult.items : []
  const courses = Array.isArray(coursesResult && coursesResult.items) ? coursesResult.items : []
  const catalog = Array.isArray(catalogResult && catalogResult.items) ? catalogResult.items : []
  const stats = aggregateReviewStats(groups)
  const seen = new Set()
  const entries = []
  for (const course of courses) {
    if (!course || !course.id) continue
    const name = String(course.name || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const courseStats = stats.get(name)
    entries.push({
      key: `course-${course.id}`, type: 'course', id: course.id, name,
      group: course.group || '课程库', teachers: courseStats ? [...courseStats.teachers.keys()] : [],
      sub: statsSubLine(courseStats, course.review_count)
    })
  }
  for (const item of catalog) {
    if (!item || !item.id) continue
    const name = String(item.name || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const catalogStats = stats.get(name)
    entries.push({
      key: `catalog-${item.id}`, type: 'catalog', catalogCourseId: item.id, name,
      group: '课程目录', teachers: [...new Set(item.teachers || [])],
      sub: statsSubLine(catalogStats, 0)
    })
  }
  for (const [name, courseStats] of stats.entries()) {
    if (seen.has(name)) continue
    seen.add(name)
    const teachers = [...courseStats.teachers.keys()]
    entries.push({
      key: `group-${name}`, type: 'group', name, group: '历史评价', teachers,
      sub: statsSubLine(courseStats, 0, [])
    })
  }
  return entries
}

// 课程搜索仅匹配课程名，分级：0=前缀连续 1=中间连续 2=按序全字(子序列，覆盖"高数/马原"式缩写)
// 3=部分按序(命中≥2字且≥2/3)，仅当无更优结果时兜底且封顶20条；评价组条目额外支持老师连续子串。
function matchRank(name, query) {
  if (!query) return 0
  const at = name.indexOf(query)
  if (at === 0) return 0
  if (at > 0) return 1
  if (query.length >= 2) {
    let ki = 0
    for (let i = 0; i < name.length && ki < query.length; i += 1) {
      if (name[i] === query[ki]) ki += 1
    }
    if (ki === query.length) return 2
    let present = 0
    for (const ch of new Set(query)) {
      if (name.includes(ch)) present += 1
    }
    if (present >= 2 && present * 3 >= new Set(query).size * 2) return 3
  }
  return null
}

function entryRank(entry, query) {
  if (!query) return 0
  const rank = matchRank(entry.name.toLowerCase(), query)
  if (rank !== null) return rank
  if (entry.type === 'group' && entry.teachers.some(teacher => teacher.toLowerCase().includes(query))) return 1
  return null
}

function filterEntries(entries, keyword) {
  const query = String(keyword || '').trim().toLowerCase()
  if (!query) return entries.slice(0, PICKER_LIMIT)
  const ranked = entries
    .map((entry, index) => ({ entry, index, rank: entryRank(entry, query) }))
    .filter(item => item.rank !== null)
  let partialShown = 0
  return ranked
    .filter(item => item.rank < 3 || partialShown++ < 20)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.entry)
    .slice(0, PICKER_LIMIT)
}

// searchData 体积约百KB(gzip后)，按 api 实例缓存 10 分钟：同会话重复打开选课器零请求
const searchDataCache = new WeakMap()
const SEARCH_DATA_TTL = 10 * 60 * 1000

async function loadSearchData(api) {
  if (typeof api.getSearchData !== 'function') return { courses: [], catalog: [] }
  const cached = searchDataCache.get(api)
  if (cached && Date.now() - cached.at < SEARCH_DATA_TTL) return cached.data
  const data = await api.getSearchData().catch(() => ({ courses: [], catalog: [] }))
  searchDataCache.set(api, { at: Date.now(), data })
  return data
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
    isGroupMode: false, isCatalogMode: false, groupCourseTitle: '', catalogCourseId: '', teacherOptions: []
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
    if (!authSession.getToken()) {
      wx.showModal({
        title: '需要先登录',
        content: '写评价需要先登录，登录后即可提交评价。',
        confirmText: '去登录',
        success: () => wx.switchTab({ url: '/pages/profile/index' }),
        fail: () => wx.navigateBack()
      })
      return
    }
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
        const teacherOptions = [...new Set((course.teacher_groups || []).map(item => item && item.teacher_name).filter(Boolean))]
        this.setData({ course, teacherOptions, pickerMode: false, isGroupMode: false, isCatalogMode: false, loading: false, error: '', ...rules })
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
          teacherOptions: uniqueTeachers,
          isGroupMode: true, isCatalogMode: false, pickerMode: false, loading: false, error: '', ...rules
        })
      } else {
        this.setData({ pickerMode: true, course: null, loading: false, error: '', ...rules })
        const [groupsResult, searchData] = await Promise.all([
          api.getReviewGroups().catch(() => ({ items: [] })),
          loadSearchData(api)
        ])
        this._pickerGroups = groupsResult.items || []
        const entries = buildPickerEntries(groupsResult, { items: searchData.courses }, { items: searchData.catalog })
        this.setData({ pickerEntries: entries, pickerFiltered: filterEntries(entries, '') })
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
      this.setData({ courseId: entry.id, groupCourseTitle: '', catalogCourseId: '', pickerMode: false, teacher: '', rating: 0, body: '' })
      this.prepare()
      return
    }
    if (entry.type === 'catalog') {
      const teachers = [...new Set(entry.teachers || [])]
      this.setData({
        catalogCourseId: entry.catalogCourseId,
        courseId: '',
        groupCourseTitle: '',
        pickerMode: false,
        teacher: '',
        rating: 0,
        body: '',
        course: { id: '', name: entry.name, group: entry.group || '课程目录', teacher_groups: teachers.map(teacher => ({ teacher_name: teacher })) },
        teacherOptions: teachers,
        isGroupMode: false,
        isCatalogMode: true
      })
      return
    }
    this.setData({ groupCourseTitle: entry.name, courseId: '', catalogCourseId: '', pickerMode: false, teacher: '', rating: 0, body: '' })
    this.prepare()
  },
  reselectCourse() {
    this.setData({ courseId: '', groupCourseTitle: '', catalogCourseId: '', course: null, pickerMode: true })
    this.prepare()
  },
  reportMissingCourse() {
    const keyword = String(this.data.pickerKeyword || '').trim()
    const title = keyword ? `课程缺失：${keyword}` : '课程缺失反馈'
    const content = keyword
      ? `我想评价的课程「${keyword}」在列表中找不到，请补充收录。课程信息（学院/教师/学期）：`
      : '我想评价的课程在列表中找不到，请补充收录。课程名称与信息：'
    wx.navigateTo({ url: `/pages/feedback/index?prefill_title=${encodeURIComponent(title)}&prefill_content=${encodeURIComponent(content)}` })
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
      const base = { teacher: teacher.trim(), rating, body: body.trim(), anonymous }
      const payload = this.data.isCatalogMode && this.data.catalogCourseId
        ? { catalog_course_id: this.data.catalogCourseId, ...base }
        : isGroupMode
          ? { course_title: groupCourseTitle, ...base }
          : { course_id: course.id, ...base }
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

module.exports = { createWriteReviewPage, buildPickerEntries, filterEntries, aggregateReviewStats, statsSubLine }
