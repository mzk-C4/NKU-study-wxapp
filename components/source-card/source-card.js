Component({
  properties: {
    source: { type: Object, value: {} }
  },
  methods: {
    onOpen() { this.triggerEvent('open', { source: this.data.source }) },
    onCopy() { this.triggerEvent('copy', { source: this.data.source }) }
  }
})
