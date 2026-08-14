const crypto = require('node:crypto')

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

function signToken(userId, secret, expiresInSeconds = 60 * 60 * 24 * 30) {
  const payload = base64url(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + expiresInSeconds }))
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!decoded.uid || decoded.exp < Math.floor(Date.now() / 1000)) return null
    return decoded.uid
  } catch { return null }
}

async function exchangeWechatCode(code, config) {
  if (config.wechatAppId && config.wechatSecret) {
    const params = new URLSearchParams({ appid: config.wechatAppId, secret: config.wechatSecret, js_code: code, grant_type: 'authorization_code' })
    const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params}`)
    const result = await response.json()
    if (!response.ok || result.errcode || !result.openid) throw new Error(result.errmsg || '微信登录失败')
    return result.openid
  }
  if (!config.allowDevLogin) throw new Error('服务端未配置微信登录')
  return `dev_${crypto.createHash('sha256').update(String(code)).digest('hex').slice(0, 24)}`
}

module.exports = { signToken, verifyToken, exchangeWechatCode }
