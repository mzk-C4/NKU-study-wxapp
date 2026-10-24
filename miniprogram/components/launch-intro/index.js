Component({
  properties: {
    dark: { type: Boolean, value: false },
    leaving: { type: Boolean, value: false }
  },
  data: { logoFailed: false },
  methods: {
    logoError() { this.setData({ logoFailed: true }) },
    skip() { this.triggerEvent('skip') },
    noop() {}
  }
})
