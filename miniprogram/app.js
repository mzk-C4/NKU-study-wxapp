const api = require('./utils/request')
const auth = require('./utils/auth')

App({
  globalData: {
    api,
    user: null
  },

  onLaunch() {
    this.globalData.user = auth.getStoredUser()
  },

  async ensureLogin() {
    const session = await auth.ensureLogin()
    this.globalData.user = session.user
    return session
  }
})
