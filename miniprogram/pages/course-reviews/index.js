const { reportVisit } = require('../../utils/visit-report')
const theme = require('../../utils/theme')
const { publicApi } = require('../../services/public-api')

function starStates(value) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0))
  return [1, 2, 3, 4, 5].map(star => ({ value: star, active: rating >= star }))
}

function presentReview(review) {
  const rating = Math.max(0, Math.min(5, Number(review.rating) || 0))
  return {
    onShow() { theme.onPageShow() }, ...review, rating, stars: starStates(rating) }
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
 id: '', groupKey: '', loading: true, error: '', course: null, reviews: [], visibleReviews: [], teacherGroups: [], teacher: '', standaloneGroup: null, scoreStars: starStates(0), reactingReviewId: '' },
  onLoad(options) { reportVisit('/mp/course-reviews'); this.setData({ id: options.id || '', groupKey: options.group_key || '' }); this.loadReviews() },
  async loadReviews() {
    this.setData({ loading: true, error: '' })
    try {
      if (this.data.groupKey) {
        const group = await publicApi.getReviewGroup(this.data.groupKey)
        const course = group.matched ? await publicApi.getCourse(group.course_id) : null
        const reviews = (group.items || []).map(presentReview)
        this.setData({ id: course?.id || '', course, standaloneGroup: group, reviews, visibleReviews: reviews, scoreStars: starStates(course?.ratings?.average ?? group.rating_average), teacherGroups: [{ id: group.group_key, teacher_name: group.teacher_name }], teacher: group.teacher_name, loading: false })
        wx.setNavigationBarTitle({ title: `${group.course_name}评价` })
        return
      }
      if (!this.data.id) throw new Error('缺少课程编号或评价分组')
      const course = await publicApi.getCourse(this.data.id)
      const groups = await publicApi.getCourseReviewGroups(course)
      const reviews = groups.flatMap(group => group.items || []).map(presentReview)
      this.setData({ course, reviews, visibleReviews: reviews, scoreStars: starStates(course.ratings?.average), teacherGroups: course.teacher_groups, loading: false })
      wx.setNavigationBarTitle({ title: course.name })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
  },
  chooseTeacher(event) {
    const teacher = event.currentTarget.dataset.teacher || ''
    const visibleReviews = teacher ? this.data.reviews.filter(item => item.teacher_name === teacher) : this.data.reviews
    this.setData({ teacher, visibleReviews })
  },
  async reactToReview(event) {
    const reviewId = event.currentTarget.dataset.id
    const reaction = event.currentTarget.dataset.reaction
    if (!reviewId || this.data.reactingReviewId) return
    const current = this.data.reviews.find(item => item.id === reviewId)?.viewer_reaction || null
    const next = current === reaction ? null : reaction
    this.setData({ reactingReviewId: reviewId })
    try {
      const result = await publicApi.setReviewReaction(reviewId, next)
      const update = items => items.map(item => item.id === reviewId ? {
        ...item,
        helpful_count: result.helpful_count,
        unhelpful_count: result.unhelpful_count,
        viewer_reaction: result.viewer_reaction
      } : item)
      this.setData({ reviews: update(this.data.reviews), visibleReviews: update(this.data.visibleReviews) })
    } catch (error) {
      if (error.statusCode === 401 || error.code === 'AUTH_REQUIRED') {
        wx.showModal({
          title: '登录后参与评价',
          content: '点赞和点踩会同步到账号，登录后可随时取消或切换。',
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
    if (!courseId) return wx.showToast({ title: '历史评价未匹配当前课程，暂不能投稿', icon: 'none' })
    wx.navigateTo({ url: `/pages/write-review/index?course_id=${encodeURIComponent(courseId)}` })
  }
})

module.exports = { starStates, presentReview }