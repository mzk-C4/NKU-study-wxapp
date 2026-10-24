const authSession = require('../../utils/auth-session')
const { isMock } = require('./settings')
const PREFIX = 'nkustudy_guide_assistant_v2:'

function owner() {
  if (isMock()) return 'mock'
  const id = authSession.readSession()?.user?.id
  return Number.isSafeInteger(id) && id > 0 ? `user-${id}` : ''
}

function read(account = owner()) {
  if (!account || account !== owner()) return null
  try { return wx.getStorageSync(PREFIX + account) || null } catch (_) { return null }
}

function save(account, value) {
  // Never write an old page's content into a newly logged-in account.
  if (!account || account !== owner()) return false
  try { wx.setStorageSync(PREFIX + account, value); return true } catch (_) { return false }
}

module.exports = { PREFIX, owner, read, save }
