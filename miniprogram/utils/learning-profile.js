const STORAGE_KEY = 'nkustudy_learning_profile_v1'
const STORAGE_VERSION = 1
const MIN_ADMISSION_YEAR = 2000
const MAX_MAJOR_LENGTH = 100

function emptyProfile() {
  return { admission_year: '', major: '' }
}

function normalizeText(value) {
  const text = String(value == null ? '' : value)
  try {
    return text.normalize('NFKC').trim()
  } catch (_) {
    return text.trim()
  }
}

function maxAdmissionYear(now = new Date()) {
  const year = Number(now && typeof now.getFullYear === 'function' ? now.getFullYear() : NaN)
  return (Number.isInteger(year) ? year : 2026) + 1
}

function validateAdmissionYear(value, now) {
  const admissionYear = normalizeText(value)
  if (!admissionYear) return { value: '', error: '' }
  if (!/^\d{4}$/.test(admissionYear)) {
    return { value: '', error: '入学年份需填写四位数字，例如 2025。' }
  }
  const numericYear = Number(admissionYear)
  const maximum = maxAdmissionYear(now)
  if (numericYear < MIN_ADMISSION_YEAR || numericYear > maximum) {
    return { value: '', error: `入学年份需在 ${MIN_ADMISSION_YEAR} 至 ${maximum} 之间。` }
  }
  return { value: admissionYear, error: '' }
}

function validateMajor(value) {
  const major = normalizeText(value)
  if (Array.from(major).length > MAX_MAJOR_LENGTH) {
    return { value: '', error: `专业名称最多填写 ${MAX_MAJOR_LENGTH} 个字。` }
  }
  return { value: major, error: '' }
}

function validate(profile, now) {
  const source = profile && typeof profile === 'object' ? profile : {}
  const admissionYear = validateAdmissionYear(source.admission_year, now)
  const major = validateMajor(source.major)
  if (admissionYear.error) {
    return { ok: false, field: 'admission_year', error: admissionYear.error, value: emptyProfile() }
  }
  if (major.error) {
    return { ok: false, field: 'major', error: major.error, value: emptyProfile() }
  }
  return {
    ok: true,
    field: '',
    error: '',
    value: { admission_year: admissionYear.value, major: major.value }
  }
}

function read(now) {
  try {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return emptyProfile()
    const stored = wx.getStorageSync(STORAGE_KEY)
    if (!stored || typeof stored !== 'object' || stored.version !== STORAGE_VERSION) return emptyProfile()
    const admissionYear = validateAdmissionYear(stored.admission_year, now)
    const major = validateMajor(stored.major)
    return {
      admission_year: admissionYear.error ? '' : admissionYear.value,
      major: major.error ? '' : major.value
    }
  } catch (_) {
    return emptyProfile()
  }
}

function save(profile, now) {
  const result = validate(profile, now)
  if (!result.ok) return result
  try {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
      return { ok: false, field: '', error: '当前无法保存到本机，请稍后重试。', value: result.value }
    }
    wx.setStorageSync(STORAGE_KEY, { version: STORAGE_VERSION, ...result.value })
    return result
  } catch (_) {
    return { ok: false, field: '', error: '当前无法保存到本机，请稍后重试。', value: result.value }
  }
}

function clear() {
  try {
    if (typeof wx === 'undefined' || typeof wx.removeStorageSync !== 'function') {
      return { ok: false, error: '当前无法清除本机学习信息，请稍后重试。', value: emptyProfile() }
    }
    wx.removeStorageSync(STORAGE_KEY)
    return { ok: true, error: '', value: emptyProfile() }
  } catch (_) {
    return { ok: false, error: '当前无法清除本机学习信息，请稍后重试。', value: emptyProfile() }
  }
}

function formatLabel(profile) {
  const source = profile && typeof profile === 'object' ? profile : emptyProfile()
  const admissionYear = validateAdmissionYear(source.admission_year)
  const major = validateMajor(source.major)
  const yearLabel = admissionYear.error || !admissionYear.value ? '年级未设置' : `${admissionYear.value}级`
  const majorLabel = major.error || !major.value ? '专业未设置' : major.value
  return `${yearLabel} · ${majorLabel}`
}

module.exports = {
  STORAGE_KEY,
  STORAGE_VERSION,
  MIN_ADMISSION_YEAR,
  MAX_MAJOR_LENGTH,
  emptyProfile,
  normalizeText,
  maxAdmissionYear,
  validate,
  read,
  save,
  clear,
  formatLabel
}
