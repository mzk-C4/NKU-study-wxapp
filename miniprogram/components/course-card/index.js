Component({
  options: { styleIsolation: 'shared' },
  properties: { course: Object },
  methods: {
    select() { this.triggerEvent('select', { course: this.data.course }) }
  }
})
