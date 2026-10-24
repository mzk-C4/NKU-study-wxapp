const { publicApi } = require('../../services/public-api')
const authSession = require('../../utils/auth-session')

function getWechatLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 10000,
      success(result) {
        if (result.code) resolve(result.code)
        else reject(new Error('微信未返回登录凭证，请重试。'))
      },
      fail() { reject(new Error('无法获取微信登录凭证，请检查网络后重试。')) }
    })
  })
}

async function ensureLogin() {
  const current = authSession.readSession()
  if (current) return current.user
  const code = await getWechatLoginCode()
  const afterCode = authSession.readSession()
  if (afterCode) return afterCode.user
  const result = await publicApi.loginWechat(code)
  const replacement = authSession.readSession()
  if (replacement) return replacement.user
  return authSession.saveSession(result).user
}

module.exports = {
  ensureLogin,
  getSessionIdentity: authSession.getToken,
  getWechatLoginCode
}
