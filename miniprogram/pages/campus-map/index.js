const { categories, campuses, buildings } = require('../../features/campus-map/data')
const ALL = { value: '', label: '全部' }
function filterPlaces(campusId, category, query) {
  const keyword = String(query || '').trim().toLowerCase()
  return buildings.filter(place => place.campusId === campusId && (!category || place.category === category) &&
    (!keyword || [place.name, place.desc, categories[place.category].label].join(' ').toLowerCase().includes(keyword)))
}
Page({
  data: { campusId: 'n', campusOptions: [{ id: 'n', label: '八里台' }, { id: 'j', label: '津南' }],
    category: '', query: '', categoryOptions: [], places: [], markers: [], selected: null,
    longitude: campuses.n.coord[0], latitude: campuses.n.coord[1], scale: campuses.n.zoom },
  onLoad() { this.refresh() },
  refresh() {
    const { campusId, category, query } = this.data
    const places = filterPlaces(campusId, category, query).map(place => ({ ...place, categoryLabel: categories[place.category].label }))
    const available = new Set(buildings.filter(place => place.campusId === campusId).map(place => place.category))
    const categoryOptions = [ALL].concat(Object.keys(categories).filter(key => available.has(key)).map(key => ({ value: key, label: categories[key].label })))
    const markers = places.map(place => ({ id: place.markerId, longitude: place.coord[0], latitude: place.coord[1],
      iconPath: '/assets/campus-map/marker.png', width: 26, height: 34,
      callout: { content: place.name, display: 'BYCLICK', padding: 8, borderRadius: 8, color: '#2B174A', fontSize: 13 } }))
    this.setData({ places, markers, categoryOptions, selected: null })
  },
  changeCampus(event) {
    const campusId = event.currentTarget.dataset.id
    if (!campuses[campusId]) return
    const campus = campuses[campusId]
    this.setData({ campusId, category: '', query: '', longitude: campus.coord[0], latitude: campus.coord[1], scale: campus.zoom })
    this.refresh()
  },
  changeCategory(event) {
    const category = event.currentTarget.dataset.value
    if (!this.data.categoryOptions.some(item => item.value === category)) return
    this.setData({ category }); this.refresh()
  },
  search(event) { this.setData({ query: event.detail.value }); this.refresh() },
  selectPlace(event) { this.selectById(Number(event.currentTarget.dataset.id)) },
  selectMarker(event) { this.selectById(Number(event.detail.markerId)) },
  selectById(id) {
    const place = this.data.places.find(item => item.markerId === id)
    if (!place) return
    this.setData({ selected: place, longitude: place.coord[0], latitude: place.coord[1], scale: 18 })
  },
  closeDetail() { this.setData({ selected: null }) },
  resetMap() {
    const campus = campuses[this.data.campusId]
    this.setData({ longitude: campus.coord[0], latitude: campus.coord[1], scale: campus.zoom, selected: null })
  },
  navigate() {
    const place = this.data.selected
    if (!place) return
    wx.openLocation({ latitude: place.coord[1], longitude: place.coord[0], name: place.name,
      address: campuses[place.campusId].name + ' · ' + place.desc, scale: 18,
      fail() { wx.showToast({ title: '地图打开失败，请稍后重试', icon: 'none' }) } })
  },
  previewImage(event) {
    const urls = (this.data.selected && this.data.selected.images || []).map(item => item.src)
    if (urls.length) wx.previewImage({ current: event.currentTarget.dataset.src, urls })
  }
})
