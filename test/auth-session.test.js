const test = require('node:test')
const assert = require('node:assert/strict')

const storage = new Map()
global.wx = {
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) }
}

const authSession = require('../miniprogram/utils/auth-session')
const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890'

test.beforeEach(() => storage.clear())

test('auth session saves a bounded user and expires locally', () => {
  const session = authSession.saveSession({
    token,
    expires_in: 60,
    user: { id: 7, nickname: `  ${'南'.repeat(40)}  `, avatar_url: 'http://unsafe.example/avatar.png' }
  }, { now: 1000 })

  assert.equal(session.expires_at, 61000)
  assert.equal(session.user.nickname.length, 32)
  assert.equal(session.user.avatar_url, '')
  assert.equal(authSession.readSession({ now: 60000 }).token, token)
  assert.equal(authSession.readSession({ now: 61000 }), null)
  assert.equal(storage.has(authSession.STORAGE_KEY), false)
})

test('auth session updates only the public user fields', () => {
  authSession.saveSession({ token, expires_in: 60, user: { id: 7 } }, { now: Date.now() })
  const updated = authSession.updateUser({ id: 7, nickname: '小紫', avatar_url: 'https://example.com/a.png', has_web_password: true, openid: 'must-not-persist' })
  assert.equal(updated.user.nickname, '小紫')
  assert.equal(updated.user.avatar_url, 'https://example.com/a.png')
  assert.equal(updated.user.has_web_password, true)
  assert.equal('openid' in updated.user, false)
})

test('invalid tokens are never stored', () => {
  assert.throws(() => authSession.saveSession({ token: 'short', expires_in: 60 }), /有效会话信息/)
  assert.throws(() => authSession.saveSession({ token: `${token}\nheader-injection`, expires_in: 60 }), /有效会话信息/)
  assert.equal(storage.size, 0)
})

test('JWT bearer tokens are accepted', () => {
  const jwt = `${'a'.repeat(24)}.${'b'.repeat(32)}.${'c'.repeat(24)}`
  const session = authSession.saveSession({ token: jwt, expires_in: 60, user: { id: 7 } }, { now: 1000 })
  assert.equal(session.token, jwt)
})
