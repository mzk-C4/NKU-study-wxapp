Component({
  properties: {
    nodes: { type: Array, value: [] },
    large: { type: Boolean, value: false }
  },
  methods: {
    onSpanTap(e) {
      const url = e.currentTarget.dataset.url
      if (url) this.triggerEvent('linktap', { url })
    }
  }
})
