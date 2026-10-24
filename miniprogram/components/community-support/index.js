const support = require('../../features/community-support/index')
const { countLabel } = require('../../features/community-support/contract')
const auth = require('../../utils/auth-session')

Component({
  properties: {
    mode: { type: String, value: 'header' },
    account: { type: null, value: '', observer() { if (this._attached) this.refreshPersonal() } },
    blocked: { type: Boolean, value: false, observer() { if (this._attached) this.refreshSupport() } }
  },
  data: { flowers: '—', coins: '—', flowerExact: '暂无统计', coinExact: '暂无统计', personal: null, personalLoading: false, personalError: false, notice: null, rulesOpen: false, muteChecked: false, illustrationFailed: false },
  lifetimes: {
    attached() {
      this._attached = true
      this._active = true
      this._unsubscribe = support.subscribe(() => this.refreshSupport())
      this.refreshSupport()
      if (this.properties.mode === 'personal') this.refreshPersonal()
    },
    detached() { this._attached = false; this._active = false; if (this._unsubscribe) this._unsubscribe() }
  },
  pageLifetimes: {
    show() { this._active = true; this.refreshSupport(); if (this.properties.mode === 'personal') this.refreshPersonal() },
    hide() { this._active = false }
  },
  methods: {
    refreshSupport() {
      if (!this._attached) return
      const stats = support.snapshot()
      if (this.properties.mode === 'personal' && (!stats || !stats.personal_stats)) {
        this._personalEpoch = (this._personalEpoch || 0) + 1
        this.setData({ personal: null, personalLoading: false, personalError: Boolean(this.properties.account) })
      }
      this.setData({ flowers: countLabel(stats && stats.flowers), coins: countLabel(stats && stats.coins),
        flowerExact: stats ? String(stats.flowers) : '暂无统计', coinExact: stats ? String(stats.coins) : '暂无统计' })
      if (this.properties.mode === 'thanks' && this._active && !this.properties.blocked && !this.data.notice) {
        const notice = support.takeNotice()
        if (notice) {
          this._notice = notice
          this.setData({ notice: { kind: notice.kind, title: notice.title, message: notice.message, action: notice.action, state: notice.state }, muteChecked: false })
        }
      }
    },
    async refreshPersonal() {
      if (this.properties.mode !== 'personal') return
      const token = auth.getToken(), epoch = this._personalEpoch = (this._personalEpoch || 0) + 1
      this.setData({ personal: null, personalLoading: Boolean(token && this.properties.account), personalError: false })
      if (!token || !this.properties.account) return
      const personal = await support.loadPersonal()
      if (!this._attached || epoch !== this._personalEpoch) return
      if (token !== auth.getToken()) { this.setData({ personal: null, personalLoading: false }); return }
      this.setData({ personal, personalLoading: false, personalError: !personal })
    },
    showRules() { this.setData({ rulesOpen: true }) },
    illustrationError() { this.setData({ illustrationFailed: true }) },
    closeRules() { this.setData({ rulesOpen: false }) },
    changeMute(event) { this.setData({ muteChecked: event.detail.value.includes('mute') }) },
    closeThanks() {
      const notice = this._notice
      this._notice = null
      this.setData({ notice: null })
      if (this.data.muteChecked) support.mute()
      support.finishNotice(notice)
      this.refreshSupport()
    },
    openWebsite() { wx.navigateTo({ url: '/pages/donate/index' }) },
    noop() {}
  }
})
