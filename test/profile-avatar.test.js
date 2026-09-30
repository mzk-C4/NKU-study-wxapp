const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const auth = require('../miniprogram/utils/auth-session')
const { createPublicApi } = require('../miniprogram/services/public-api')
const previousPage = global.Page
global.Page = () => {}
const { createProfilePage } = require('../miniprogram/pages/profile/index')
global.Page = previousPage

const oldAvatar = 'https://example.com/old-avatar.jpg'
const newAvatar = 'https://resources.nkustudy.top/avatars/abcdefghijklmnopqrstuv.jpg'
const choice = { detail: { avatarUrl: 'wxfile://tmp/new-avatar.jpg' } }
const token = 'avatar-test-session-abcdefghijklmnopqrstuvwxyz'
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup(t, available = true) {
  const previousWx = global.wx
  const storage = new Map()
  const toasts = [], uploads = [], saves = []
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showToast: value => toasts.push(value),
    request() { assert.fail('avatar tests must never use live network') },
    uploadFile() { assert.fail('avatar page tests must never use live network') }
  }
  t.after(() => { global.wx = previousWx })
  let serverUser = { id: 7, nickname: '原昵称', avatar_url: oldAvatar, has_web_password: true }
  auth.saveSession({ token, expires_in: 3600, user: serverUser })
  const api = {
    isAvatarUploadAvailable: () => available,
    async uploadAvatar(filePath) { uploads.push(filePath); return { avatar_url: newAvatar } },
    async updateProfile(input) { saves.push(input); serverUser = { ...serverUser, ...input }; return serverUser },
    async getMe() { return serverUser },
    async getFavorites() { return { items: [], total: 0 } },
    async getMyReviews() { return { items: [], total: 0 } },
    async logout() {}
  }
  function page() {
    const value = createProfilePage(api, auth)
    value.data = { ...value.data, user: auth.readSession()?.user, isLoggedIn: Boolean(auth.readSession()), avatarSupported: true }
    value.setData = patch => Object.assign(value.data, patch)
    return value
  }
  return { page: page(), newPage: page, api, toasts, uploads, saves, storage }
}

test('unavailable backend allows labelled preview only; cancellation never persists or uploads it', async t => {
  const f = setup(t, false)
  await f.page.chooseAvatar(choice)
  assert.equal(f.page.data.avatarPreviewUrl, choice.detail.avatarUrl)
  assert.equal(f.page.data.user.avatar_url, oldAvatar)
  assert.equal(auth.readSession().user.avatar_url, oldAvatar)
  await f.page.saveAvatar()
  assert.match(f.page.data.avatarErrorText, /暂未开放/)
  assert.equal(f.uploads.length + f.saves.length + f.toasts.length, 0)
  f.page.discardAvatar()
  assert.equal(f.page.data.avatarPreviewUrl, '')
  assert.equal(auth.readSession().token, token)
  await f.newPage().refresh()
  assert.equal(auth.readSession().user.avatar_url, oldAvatar)
})

test('picker cancellation or rejected image keeps existing avatar and makes no requests', async t => {
  const f = setup(t)
  for (const event of [undefined, {}, { detail: {} }, { detail: { avatarUrl: '' } }]) await f.page.chooseAvatar(event)
  assert.equal(f.page.data.user.avatar_url, oldAvatar)
  assert.equal(f.page.data.avatarSaving, false)
  assert.deepEqual([f.uploads, f.saves, f.toasts], [[], [], []])
})

test('upload then profile save preserves nickname/token and survives reopening from server', async t => {
  const f = setup(t)
  const pending = deferred()
  f.api.uploadAvatar = async file => { f.uploads.push(file); return pending.promise }
  const saving = f.page.chooseAvatar(choice)
  assert.equal(f.page.data.avatarPreviewUrl, choice.detail.avatarUrl)
  assert.equal(f.page.data.avatarSaving, true)
  assert.equal(auth.readSession().user.avatar_url, oldAvatar)
  pending.resolve({ avatar_url: newAvatar })
  await saving
  assert.deepEqual(f.saves, [{ avatar_url: newAvatar }])
  assert.equal(f.page.data.user.nickname, '原昵称')
  assert.equal(f.page.data.avatarPreviewUrl, '')
  assert.equal(f.page.data.avatarSaving, false)
  assert.equal(auth.readSession().user.avatar_url, newAvatar)
  assert.equal(auth.readSession().token, token)
  assert.deepEqual(f.toasts, [{ title: '头像已保存', icon: 'success' }])
  const reopened = f.newPage()
  await reopened.refresh()
  assert.equal(reopened.data.user.avatar_url, newAvatar)
})

test('upload failure restores old image, uses safe errors and permits manual retry', async t => {
  const f = setup(t)
  f.api.uploadAvatar = async () => { throw new Error('internal stack/private path') }
  await f.page.chooseAvatar(choice)
  assert.equal(f.page.data.avatarPreviewUrl, '')
  assert.equal(f.page.data.avatarDraftUrl, choice.detail.avatarUrl)
  assert.match(f.page.data.avatarErrorText, /上传失败/)
  assert.doesNotMatch(f.page.data.avatarErrorText, /internal|private/)
  assert.equal(auth.readSession().user.avatar_url, oldAvatar)
  assert.equal(auth.readSession().token, token)
  assert.equal(f.saves.length + f.toasts.length, 0)
  f.api.uploadAvatar = async () => ({ avatar_url: newAvatar })
  await f.page.saveAvatar()
  assert.equal(auth.readSession().user.avatar_url, newAvatar)
})

test('profile save failure is not upload success, and leaves nickname and login untouched', async t => {
  const f = setup(t)
  f.api.updateProfile = async () => { throw Object.assign(new Error('internal'), { statusCode: 503 }) }
  await f.page.chooseAvatar(choice)
  assert.equal(f.page.data.avatarPreviewUrl, '')
  assert.match(f.page.data.avatarErrorText, /未确认头像保存结果/)
  assert.equal(auth.readSession().user.nickname, '原昵称')
  assert.equal(auth.readSession().user.avatar_url, oldAvatar)
  assert.equal(f.toasts.length, 0)
})

test('invalid upload URLs never reach profile save', async t => {
  const f = setup(t)
  for (const url of ['', 'wxfile://tmp/a', 'http://example.com/a.jpg', 'https://user@example.com/a.jpg']) {
    f.api.uploadAvatar = async () => ({ avatar_url: url })
    await f.page.chooseAvatar(choice)
    assert.equal(f.page.data.avatarSaving, false)
  }
  assert.equal(f.saves.length + f.toasts.length, 0)
  assert.equal(auth.readSession().user.avatar_url, oldAvatar)
})

test('partial or incorrect profile responses never become a successful cached avatar', async t => {
  const f = setup(t)
  for (const user of [{ avatar_url: newAvatar }, { id: 8, nickname: '原昵称', avatar_url: newAvatar }, { id: 7, nickname: '', avatar_url: newAvatar }]) {
    f.api.updateProfile = async () => user
    await f.page.chooseAvatar(choice)
    assert.match(f.page.data.avatarErrorText, /未确认/)
  }
  assert.equal(f.toasts.length, 0)
  assert.equal(auth.readSession().user.nickname, '原昵称')
})

test('401 clears only the current expired session and never reports avatar success', async t => {
  const f = setup(t)
  f.api.uploadAvatar = async () => { throw Object.assign(new Error(), { statusCode: 401 }) }
  await f.page.chooseAvatar(choice)
  assert.equal(auth.readSession(), null)
  assert.equal(f.page.data.isLoggedIn, false)
  assert.equal(f.page.data.avatarDraftUrl, '')
  assert.equal(f.toasts.some(item => item.icon === 'success'), false)
})

test('duplicate choice, save and nickname editing cannot race an active avatar upload', async t => {
  const f = setup(t)
  const pending = deferred()
  f.api.uploadAvatar = async file => { f.uploads.push(file); return pending.promise }
  const saving = f.page.chooseAvatar(choice)
  await f.page.chooseAvatar({ detail: { avatarUrl: 'wxfile://tmp/other' } })
  await f.page.saveAvatar()
  f.page.startEditProfile()
  assert.equal(f.page.data.editingProfile, false)
  assert.equal(f.uploads.length, 1)
  pending.resolve({ avatar_url: newAvatar })
  await saving
  assert.equal(f.saves.length, 1)
})

test('a late refresh cannot overwrite the newly saved avatar', async t => {
  const f = setup(t)
  const pending = deferred()
  f.api.getMe = () => pending.promise
  const refreshing = f.page.refresh()
  await f.page.chooseAvatar(choice)
  pending.resolve({ id: 7, nickname: '原昵称', avatar_url: oldAvatar })
  await refreshing
  assert.equal(f.page.data.user.avatar_url, newAvatar)
  assert.equal(auth.readSession().user.avatar_url, newAvatar)
})

test('logout during upload prevents subsequent profile save or stale success', async t => {
  const f = setup(t)
  const pending = deferred()
  f.api.uploadAvatar = () => pending.promise
  const saving = f.page.chooseAvatar(choice)
  await f.page.confirmLogout()
  pending.resolve({ avatar_url: newAvatar })
  await saving
  assert.equal(f.saves.length, 0)
  assert.equal(f.page.data.user, null)
  assert.equal(f.toasts.some(item => item.title === '头像已保存'), false)
})

test('account switch during profile save ignores old success and never changes the new session', async t => {
  const f = setup(t)
  const pending = deferred(), entered = deferred()
  f.api.updateProfile = () => { entered.resolve(); return pending.promise }
  const saving = f.page.chooseAvatar(choice)
  await entered.promise
  auth.saveSession({ token: `${token}-new`, expires_in: 3600, user: { id: 8, nickname: '另一账号', avatar_url: oldAvatar } })
  pending.resolve({ id: 7, nickname: '原昵称', avatar_url: newAvatar })
  await saving
  assert.equal(auth.readSession().user.id, 8)
  assert.equal(auth.readSession().user.avatar_url, oldAvatar)
  assert.equal(f.page.data.avatarSaving, false)
  assert.equal(f.toasts.length, 0)
})

test('an old upload 401 cannot clear a newly logged in account', async t => {
  const f = setup(t)
  const pending = deferred()
  f.api.uploadAvatar = () => pending.promise
  const saving = f.page.chooseAvatar(choice)
  auth.saveSession({ token: `${token}-new`, expires_in: 3600, user: { id: 8, nickname: '另一账号' } })
  pending.reject(Object.assign(new Error(), { statusCode: 401 }))
  await saving
  assert.equal(auth.readSession().user.id, 8)
  assert.equal(f.toasts.length, 0)
})

test('unloading while uploading never updates the unloaded page or starts saving', async t => {
  const f = setup(t)
  const pending = deferred()
  f.api.uploadAvatar = () => pending.promise
  const saving = f.page.chooseAvatar(choice)
  f.page.onUnload()
  f.page.setData = () => assert.fail('unloaded page must not be updated')
  pending.resolve({ avatar_url: newAvatar })
  await saving
  assert.equal(f.saves.length + f.toasts.length, 0)
})

test('cache write failure is distinguished from successful server persistence', async t => {
  const f = setup(t)
  global.wx.setStorageSync = () => { throw new Error('storage full') }
  await f.page.chooseAvatar(choice)
  assert.equal(f.page.data.user.avatar_url, newAvatar)
  assert.match(f.page.data.avatarErrorText, /本机暂未记住更新/)
  assert.equal(auth.readSession().user.avatar_url, oldAvatar)
  const reopened = f.newPage()
  await reopened.refresh()
  assert.equal(reopened.data.user.avatar_url, newAvatar)
})

test('preview read failure and unsupported clients retain the old avatar', async t => {
  const f = setup(t, false)
  await f.page.chooseAvatar(choice)
  f.page.avatarError()
  assert.equal(f.page.data.avatarDraftUrl, '')
  assert.match(f.page.data.avatarErrorText, /重新选择/)
  assert.equal(f.page.data.user.avatar_url, oldAvatar)
  f.page.avatarUnavailable()
  assert.match(f.toasts[0].title, /更新微信/)
})

test('an expired session never uploads a chosen image', async t => {
  const f = setup(t)
  auth.clearSession()
  await f.page.chooseAvatar(choice)
  assert.equal(f.page.data.isLoggedIn, false)
  assert.equal(f.page.data.avatarDraftUrl, '')
  assert.equal(f.uploads.length + f.saves.length, 0)
  assert.match(f.toasts[0].title, /先登录/)
})

test('a session expiring during upload prevents profile save and restores logged-out UI', async t => {
  const f = setup(t)
  const pending = deferred()
  f.api.uploadAvatar = () => pending.promise
  const saving = f.page.chooseAvatar(choice)
  auth.clearSession()
  pending.resolve({ avatar_url: newAvatar })
  await saving
  assert.equal(f.saves.length, 0)
  assert.equal(f.page.data.isLoggedIn, false)
  assert.equal(f.page.data.avatarSaving, false)
  assert.equal(f.toasts.some(item => item.icon === 'success'), false)
})

test('reference upload adapter remains disabled with zero transport calls', async () => {
  const transport = new Proxy({}, { get() { return () => assert.fail('unconfirmed endpoint must not be called') } })
  const api = createPublicApi(transport, { apiProfile: 'reference' })
  assert.equal(api.isAvatarUploadAvailable(), false)
  await assert.rejects(api.uploadAvatar(choice.detail.avatarUrl), { code: 'AVATAR_UPLOAD_UNAVAILABLE' })
})

test('avatar-only profile requests omit nickname and reject temporary/empty addresses', async () => {
  const calls = []
  const api = createPublicApi({ async post(route, body, options) { calls.push({ route, body, options }); return { user: { id: 7, nickname: '原昵称', ...body } } } }, { apiProfile: 'production' })
  await api.updateProfile({ avatar_url: newAvatar })
  assert.deepEqual(calls, [{ route: '/me/profile', body: { avatar_url: newAvatar }, options: { auth: 'required' } }])
  for (const value of ['', null, choice.detail.avatarUrl, 'http://example.com/a.jpg']) {
    await assert.rejects(api.updateProfile({ avatar_url: value }), { code: 'INVALID_AVATAR_URL' })
  }
  assert.equal(calls.length, 1)
  await api.updateProfile({ nickname: ' 新昵称 ' })
  assert.deepEqual(calls[1].body, { nickname: '新昵称' })
})

test('avatar UI uses native chooser, states preview explicitly and preserves submission/feedback entry points', () => {
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/profile/index.wxml'), 'utf8')
  assert.match(source, /open-type="chooseAvatar" bindchooseavatar="chooseAvatar"/)
  assert.match(source, /当前为预览，尚未保存/)
  assert.match(source, /bindtap="discardAvatar"/)
  assert.match(source, /bindtap="openSubmit"/)
  assert.match(source, /bindtap="openFeedback"/)
})

test('profile-save retries reuse an uploaded avatar without consuming another upload', async t => {
  const f = setup(t)
  const update = f.api.updateProfile
  f.api.updateProfile = async () => { throw new Error('temporary failure') }
  await f.page.chooseAvatar(choice)
  assert.equal(f.uploads.length, 1)
  assert.equal(f.page.data.user.avatar_url, oldAvatar)
  assert.equal(f.toasts.length, 0)
  f.api.updateProfile = update
  await f.page.saveAvatar()
  assert.equal(f.uploads.length, 1)
  assert.equal(f.page.data.user.avatar_url, newAvatar)
})

test('a rejected binding discards the uploaded URL before retry', async t => {
  const f = setup(t)
  const update = f.api.updateProfile
  f.api.updateProfile = async () => { throw Object.assign(new Error(), { code: 'AVATAR_NOT_OWNED' }) }
  await f.page.chooseAvatar(choice)
  assert.match(f.page.data.avatarErrorText, /失效/)
  f.api.updateProfile = update
  await f.page.saveAvatar()
  assert.equal(f.uploads.length, 2)
  assert.equal(f.page.data.user.avatar_url, newAvatar)
})

test('retry does not reuse an unbound avatar beyond its 24 hour lifetime', async t => {
  const f = setup(t)
  const update = f.api.updateProfile
  const now = Date.now
  const startedAt = now()
  t.after(() => { Date.now = now })
  auth.saveSession({ token, expires_in: 3 * 86400, user: f.page.data.user })
  Date.now = () => startedAt
  f.api.updateProfile = async () => { throw new Error('temporary failure') }
  await f.page.chooseAvatar(choice)
  Date.now = () => startedAt + 86400000
  f.api.updateProfile = update
  await f.page.saveAvatar()
  assert.equal(f.uploads.length, 2)
  assert.equal(f.page.data.user.avatar_url, newAvatar)
})
