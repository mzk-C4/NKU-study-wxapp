const { publicApi } = require('./public-api')

const TOKEN_KEY = 'nkustudy_auth_token'
const USER_KEY = 'nkustudy_auth_user'

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function getCachedUser() {
  const raw = wx.getStorageSync(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function persistSession(session) {
  wx.setStorageSync(TOKEN_KEY, session.token)
  wx.setStorageSync(USER_KEY, JSON.stringify(session.user || {}))
}

function clearSessionData() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
}

function authHeader() {
  const token = getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

async function login() {
  const code = await new Promise((resolve, reject) => {
    wx.login({ success: (r) => resolve(r.code), fail: (e) => reject(new Error(e.errMsg || 'wx.login failed')) })
  })
  const session = await publicApi.loginWechat(code)
  persistSession(session)
  return session.user
}

async function ensureLogin() {
  if (getToken()) return getCachedUser()
  return login()
}

async function getProfile() {
  const data = await publicApi.getMe()
  wx.setStorageSync(USER_KEY, JSON.stringify(data || {}))
  return data
}

async function updateProfile(input) {
  const data = await publicApi.updateProfile(input)
  const user = data && data.user ? data.user : data
  wx.setStorageSync(USER_KEY, JSON.stringify(user || {}))
  return user
}

async function setWebPassword(password) {
  return publicApi.setWebPassword(password)
}

async function deleteAccount() {
  return publicApi.deleteMyAccount()
}

async function logout() {
  try { await publicApi.logout() } catch {}
  clearSessionData()
}

module.exports = {
  login, ensureLogin, logout, getProfile, updateProfile,
  setWebPassword, deleteAccount,
  getToken, getCachedUser, authHeader
}
