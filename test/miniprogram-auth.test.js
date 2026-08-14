const test = require('node:test')
const assert = require('node:assert/strict')

const storage = new Map()
let loginCalls = 0

global.getApp = () => ({ globalData: { user: null } })
global.wx = {
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  getStorageSync: key => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key),
  login: ({ success }) => {
    loginCalls += 1
    success({ code: 'refreshed-code' })
  },
  request: options => {
    const token = options.header.Authorization
    if (options.url.endsWith('/auth/wechat')) {
      options.success({
        statusCode: 200,
        data: { code: 0, data: { token: 'fresh-token', expires_at: '2099-01-01T00:00:00.000Z', user: { id: 'user-1' } } }
      })
      return
    }
    if (options.url.endsWith('/me/favorites') && token === 'Bearer fresh-token') {
      options.success({ statusCode: 200, data: { code: 0, data: { items: [{ id: 'course-1' }] } } })
      return
    }
    options.success({ statusCode: 401, data: { code: 40101, message: '请先微信登录' } })
  }
}

const api = require('../miniprogram/utils/request')
const auth = require('../miniprogram/utils/auth')

test.beforeEach(() => {
  storage.clear()
  loginCalls = 0
})

test('expired server token triggers one shared code refresh and retries concurrent requests', async () => {
  storage.set('auth_token', 'expired-token')
  storage.set('auth_user', { id: 'user-1' })

  const [first, second] = await Promise.all([api.get('/me/favorites'), api.get('/me/favorites')])

  assert.equal(loginCalls, 1)
  assert.deepEqual(first.items, [{ id: 'course-1' }])
  assert.deepEqual(second.items, [{ id: 'course-1' }])
  assert.equal(storage.get('auth_token'), 'fresh-token')
})

test('expired restored session is cleared before it is presented as logged in', () => {
  storage.set('auth_token', 'expired-token')
  storage.set('auth_user', { id: 'user-1' })
  storage.set('auth_expires_at', '2000-01-01T00:00:00.000Z')

  assert.equal(auth.getStoredUser(), null)
  assert.equal(storage.has('auth_token'), false)
  assert.equal(storage.has('auth_user'), false)
})
