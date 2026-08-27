const Fuse = require('../../lib/fuse')
const {
  getSearchTokens,
  normalizeBoundedSearchText,
  normalizeSearchText,
  scatteredIncludes
} = require('../../utils/search-utils')
const { highlightText } = require('../../utils/search-highlight')

const REVIEW_FUSE_OPTIONS = Object.freeze({
  includeScore: true,
  ignoreLocation: true,
  threshold: 1,
  keys: [
    { name: 'course_name', weight: 0.65 },
    { name: 'teacher_name', weight: 0.35 }
  ]
})

function toText(value) {
  return String(value == null ? '' : value)
}

function compareText(left, right) {
  const a = toText(left)
  const b = toText(right)
  return a < b ? -1 : a > b ? 1 : 0
}

function matchField(value, token) {
  const normalizedValue = normalizeSearchText(value)
  const normalizedToken = normalizeSearchText(token)
  if (!normalizedValue || !normalizedToken) return null
  if (normalizedValue === normalizedToken) return 'exact'
  if (normalizedValue.includes(normalizedToken)) return 'continuous'
  return scatteredIncludes(value, normalizedToken) ? 'scattered' : null
}

function matchToken(group, token) {
  const course = matchField(group && group.course_name, token)
  const teacher = matchField(group && group.teacher_name, token)
  if (!course && !teacher) return null
  return { token, course, teacher }
}

function rankMatch(match) {
  if (match.course === 'exact') return 0
  if (match.teacher === 'exact') return 1
  if (match.course === 'continuous') return 2
  if (match.teacher === 'continuous') return 3
  if (match.course === 'scattered') return 4
  return 5
}

function getGroupMatch(group, tokens) {
  const matches = tokens.map(token => matchToken(group, token))
  if (matches.some(match => !match)) return null
  return {
    rank: matches.reduce((worstRank, match) => Math.max(worstRank, rankMatch(match)), 0),
    courseTokens: matches.filter(match => match.course).map(match => match.token),
    teacherTokens: matches.filter(match => match.teacher).map(match => match.token)
  }
}

function groupKey(group) {
  return toText(group && group.group_key)
}

function fuseScores(groups, query) {
  const scores = new Map()
  new Fuse(groups, REVIEW_FUSE_OPTIONS).search(query).forEach(result => {
    scores.set(groupKey(result.item), result.score == null ? 1 : result.score)
  })
  return scores
}

function presentGroup(group, match) {
  const courseTokens = match ? match.courseTokens : []
  const teacherTokens = match ? match.teacherTokens : []
  return {
    ...group,
    highlighted_course_name: highlightText(group && group.course_name, courseTokens.join(' ')).html,
    highlighted_teacher_name: highlightText(group && group.teacher_name, teacherTokens.join(' ')).html
  }
}

function searchReviewGroups(groups, keyword) {
  const source = Array.isArray(groups) ? groups : []
  const query = normalizeBoundedSearchText(keyword)
  const tokens = getSearchTokens(query)
  if (!tokens.length) return { query, results: source.map(group => presentGroup(group, null)) }

  const candidates = source.map((group, sourceIndex) => ({ group, sourceIndex, match: getGroupMatch(group, tokens) }))
    .filter(entry => entry.match)
  const scores = fuseScores(candidates.map(entry => entry.group), query)
  const results = candidates.sort((left, right) =>
    left.match.rank - right.match.rank ||
    (scores.get(groupKey(left.group)) == null ? 1 : scores.get(groupKey(left.group))) - (scores.get(groupKey(right.group)) == null ? 1 : scores.get(groupKey(right.group))) ||
    compareText(normalizeSearchText(left.group.course_name), normalizeSearchText(right.group.course_name)) ||
    compareText(normalizeSearchText(left.group.teacher_name), normalizeSearchText(right.group.teacher_name)) ||
    compareText(groupKey(left.group), groupKey(right.group)) ||
    left.sourceIndex - right.sourceIndex
  ).map(entry => presentGroup(entry.group, entry.match))

  return { query, results }
}

function getCourseIdentity(group) {
  const courseId = toText(group && group.course_id).trim()
  return courseId ? `id:${courseId}` : `name:${normalizeSearchText(group && group.course_name)}`
}

function getReviewSearchStats(groups) {
  const source = Array.isArray(groups) ? groups : []
  return {
    statCourses: new Set(source.map(getCourseIdentity)).size,
    statReviews: source.reduce((total, group) => total + Math.max(0, Number(group && group.review_count) || 0), 0)
  }
}

function getReviewListState(groups, pageSize = 20, page = 1) {
  const source = Array.isArray(groups) ? groups : []
  const safePageSize = Math.max(1, Number(pageSize) || 20)
  const safePage = Math.max(1, Number(page) || 1)
  const end = safePage * safePageSize
  return {
    visibleGroups: source.slice(0, end),
    page: safePage,
    hasMore: end < source.length
  }
}

function getReviewEmptyText(keyword, groups) {
  return normalizeBoundedSearchText(keyword) && Array.isArray(groups) && !groups.length
    ? '没有匹配的课程或教师'
    : '暂无评价'
}

function buildReviewGroupUrl(group) {
  const key = groupKey(group)
  return key ? `/pages/course-reviews/index?group_key=${encodeURIComponent(key)}` : ''
}

module.exports = {
  REVIEW_FUSE_OPTIONS,
  matchField,
  getGroupMatch,
  searchReviewGroups,
  getCourseIdentity,
  getReviewSearchStats,
  getReviewListState,
  getReviewEmptyText,
  buildReviewGroupUrl
}
