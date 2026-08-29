const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')

function starStates(value) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0))
  return [1, 2, 3, 4, 5].map(star => ({ value: star, active: rating >= star }))
}

function displayDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function presentReview(review) {
  const rating = Math.max(0, Math.min(5, Number(review.rating) || 0))
  return { ...review, rating, stars: starStates(rating), created_date: displayDate(review.created_at) }
}

Page({
  onShareAppMessage() {
    return {
      title: `「${this.data.course?.name || 'NKUStudy 课程'}」评价 - NKUStudy`,
      path: `/pages/course-overview/index?id=${encodeURIComponent(this.data.id)}`
    }
  },
  onShareTimeline() {
    return { title: `${this.data.course?.name || '南开课程'}评价 · NKUStudy` }
  },
  data: {
    id: '', groupKey: '', loading: true, error: '', course: null, reviews: [], visibleReviews: [], teacherGroups: [], teacher: '', standaloneGroup: null, scoreStars: starStates(0), reactingReviewId: '', scoreNumber: '—', scoreLabel: '总体评分', scoreCount: 0
  },
  onLoad(options) { reportVisit('/mp/course-reviews'); this.setData({ id: options.id || '', groupKey: options.group_key || '' }); this.loadReviews() },
  onShow() { theme.onPageShow() },
  applySelectionScore(teacher) {
    const { course, reviews } = this.data
    if (!teacher) {
      const aggregate = course && course.ratings ? course.ratings : null
      this.setData({
        scoreNumber: aggregate && aggregate.show_aggregate ? aggregate.average : '—',
        scoreLabel: aggregate && aggregate.show_aggregate ? '总体评分' : '评价样本不足',
        scoreCount: course ? course.review_count : 0,
        scoreStars: starStates(aggregate && aggregate.average)
      })
      return
    }
    const ratings = reviews.filter(item => item.teacher_name === teacher).map(item => item.rating).filter(value => value >= 1 && value <= 5)
    const average = ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1) : null
    this.setData({
      scoreNumber: average === null ? '—' : average,
      scoreLabel: `${teacher} · 评分`,
      scoreCount: ratings.length,
      scoreStars: starStates(average)
    })
  },
  async loadReviews() {
    this.setData({ loading: true, error: '' })
    try {
      if (this.data.groupKey) {
        const group = await publicApi.getReviewGroup(this.data.groupKey)
        const course = group.matched ? await publicApi.getCourse(group.course_id) : null
        // 已匹配课程：加载该课程全部教师与评价，默认聚焦进入时的那位老师
        if (course) {
          const groups = await publicApi.getCourseReviewGroups(course)
          const reviews = groups.flatMap(entry => entry.items || []).map(presentReview)
          const teacher = group.teacher_name
          this.setData({
            id: course.id, course, standaloneGroup: null, reviews,
            visibleReviews: reviews.filter(item => item.teacher_name === teacher),
            scoreStars: starStates(course.ratings?.average),
            teacherGroups: course.teacher_groups, teacher, loading: false
          })
          this.applySelectionScore(teacher)
          wx.setNavigationBarTitle({ title: `${course.name}评价` })
          return
        }
        const reviews = (group.items || []).map(presentReview)
        this.setData({ id: '', course: null, standaloneGroup: group, reviews, visibleReviews: reviews, scoreStars: starStates(group.rating_average), teacherGroups: [{ id: group.group_key, teacher_name: group.teacher_name }], teacher: group.teacher_name, loading: false })
        wx.setNavigationBarTitle({ title: `${group.course_name}评价` })
        return
      }
      if (!this.data.id) throw new Error('缺少课程编号或评价分组')
      const course = await publicApi.getCourse(this.data.id)
      const groups = await publicApi.getCourseReviewGroups(course)
      const reviews = groups.flatMap(group => group.items || []).map(presentReview)
      this.setData({ course, reviews, visibleReviews: reviews, teacherGroups: course.teacher_groups, loading: false })
      this.applySelectionScore('')
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseTeacher(event) {
    const teacher = event.currentTarget.dataset.teacher || ''
    const visibleReviews = teacher ? this.data.reviews.filter(item => item.teacher_name === teacher) : this.data.reviews
    this.setData({ teacher, visibleReviews })
    this.applySelectionScore(teacher)
  },
  async reactToReview(event) {
    const reviewId = event.currentTarget.dataset.id
    if (!reviewId || this.data.reactingReviewId) return
    const current = this.data.reviews.find(item => item.id === reviewId)?.viewer_reaction || null
    const next = current === 'up' ? null : 'up'
    this.setData({ reactingReviewId: reviewId })
    try {
      const result = await publicApi.setReviewReaction(reviewId, next)
      const update = items => items.map(item => item.id === reviewId ? {
        ...item,
        helpful_count: result.helpful_count,
        viewer_reaction: result.viewer_reaction
      } : item)
      this.setData({ reviews: update(this.data.reviews), visibleReviews: update(this.data.visibleReviews) })
    } catch (error) {
      if (error.statusCode === 401 || error.code === 'AUTH_REQUIRED') {
        wx.showModal({
          title: '登录后标记有帮助',
          content: '登录后即可为评价标记有帮助，标记会同步到你的账号。',
          confirmText: '去登录',
          success: result => { if (result.confirm) wx.switchTab({ url: '/pages/profile/index' }) }
        })
      } else wx.showToast({ title: error.message || '操作失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ reactingReviewId: '' })
    }
  },
  openTab(event) {
    const page = event.currentTarget.dataset.tab === 'overview' ? 'course-overview' : 'course-resources'
    wx.redirectTo({ url: `/pages/${page}/index?id=${this.data.id}` })
  },
  writeReview() {
    const courseId = this.data.course?.id || this.data.id
    if (courseId) return wx.navigateTo({ url: `/pages/write-review/index?course_id=${encodeURIComponent(courseId)}` })
    const courseTitle = this.data.standaloneGroup?.course_name || ''
    if (courseTitle) return wx.navigateTo({ url: `/pages/write-review/index?course_title=${encodeURIComponent(courseTitle)}` })
    wx.showToast({ title: '未能确定课程，请从评价列表进入', icon: 'none' })
  }
})

module.exports = { starStates, presentReview }
