const request = require('../utils/request')

const TOKEN_KEY = 'nkustudy_auth_token'
const USER_KEY = 'nkustudy_auth_user'

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (result) => resolve(result.code),
      fail: (error) => reject(new Error(error.errMsg || 'wx.login 调用失败'))
    })
  })
}

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

function clearSession() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
}

function authHeader() {
  const token = getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

/**
 * 微信身份登录：wx.login 拿一次性 code，换服务端 30 天 token。
 * 服务端由 code2Session 换取 openid，响应中不包含 openid。
 */
async function login() {
  const code = await wxLogin()
  const session = await request.post('/auth/wechat', { code })
  persistSession(session)
  return session.user
}

/** 已登录则返回缓存用户，否则静默走一次登录。 */
async function ensureLogin() {
  if (getToken()) return getCachedUser()
  return login()
}

/** 获取最新个人信息；token 失效时抛出 code === 'AUTH_REQUIRED' 的错误。 */
async function getProfile() {
  const data = await request.get('/me', {}, authHeader())
  wx.setStorageSync(USER_KEY, JSON.stringify(data.user || {}))
  return data.user
}

/** 更新昵称与头像；头像必须是 https 地址（建议用 chooseAvatar 开放能力采集）。 */
async function updateProfile({ nickname, avatarUrl }) {
  const data = await request.post('/me/profile', {
    nickname,
    avatar_url: avatarUrl
  }, authHeader())
  wx.setStorageSync(USER_KEY, JSON.stringify(data.user || {}))
  return data.user
}

async function logout() {
  try {
    await request.post('/auth/logout', {}, authHeader())
  } catch {
    // 服务端撤销失败也清空本地会话
  }
  clearSession()
}

/** 供收藏/投稿/写评价等登录后接口复用的请求助手。 */
function authedGet(path, data) {
  return request.get(path, data, authHeader())
}

function authedPost(path, data) {
  return request.post(path, data, authHeader())
}

function authedDelete(path) {
  return request.request(path, { method: 'DELETE', header: authHeader() })
}

module.exports = {
  login,
  ensureLogin,
  logout,
  getProfile,
  updateProfile,
  getToken,
  getCachedUser,
  authedGet,
  authedPost,
  authedDelete
}
