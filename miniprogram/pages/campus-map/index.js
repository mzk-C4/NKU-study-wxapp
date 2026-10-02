const { categories, campuses, buildings } = require('../../features/campus-map/data')
const local = require('../../utils/local-preferences')
const validIds = new Set(buildings.map(place => place.markerId))
const ALL = { value: '', label: '全部' }
function filterPlaces(campusId, category, query) {
  const keyword = String(query || '').trim().toLowerCase()
  return buildings.filter(place => place.campusId === campusId && (!category || place.category === category) &&
    (!keyword || [place.name, place.desc, categories[place.category].label].join(' ').toLowerCase().includes(keyword)))
}
Page({
  data: { campusId: 'n', campusOptions: [{ id: 'n', label: '八里台' }, { id: 'j', label: '津南' }],
    category: '', query: '', categoryOptions: [], places: [], markers: [], selected: null,
    mapVisible: true, mapError: false, favoriteIds: [], recentIds: [], placeMode: 'all', selectedFavorite: false, detailExpanded: false, storageNotice: '',
    longitude: campuses.n.coord[0], latitude: campuses.n.coord[1], scale: campuses.n.zoom },
  onLoad() {
    this._isUnloaded = false
    this.setData({ favoriteIds: local.readPlaces('favorites', validIds), recentIds: local.readPlaces('recent', validIds) })
    this.refresh()
  },
  onUnload() { this._isUnloaded = true },
  mapFailed() { if (!this._isUnloaded) this.setData({ mapError: true }) },
  retryMap() {
    if (this._isUnloaded || !this.data.mapVisible) return
    this.setData({ mapVisible: false, mapError: false }, () => {
      if (!this._isUnloaded) wx.nextTick(() => {
        if (!this._isUnloaded) this.setData({ mapVisible: true })
      })
    })
  },
  refresh(options = {}) {
    const { campusId, category, query, placeMode, favoriteIds, recentIds } = this.data
    let source = filterPlaces(campusId, category, query)
    if (placeMode !== 'all') {
      const ids = placeMode === 'favorites' ? favoriteIds : recentIds
      source = source.filter(place => ids.includes(place.markerId)).sort((a, b) => ids.indexOf(a.markerId) - ids.indexOf(b.markerId))
    }
    const places = source.map(place => ({ ...place, categoryLabel: categories[place.category].label, favorite: favoriteIds.includes(place.markerId) }))
    const available = new Set(buildings.filter(place => place.campusId === campusId).map(place => place.category))
    const categoryOptions = [ALL].concat(Object.keys(categories).filter(key => available.has(key)).map(key => ({ value: key, label: categories[key].label })))
    const markers = places.map(place => ({ id: place.markerId, longitude: place.coord[0], latitude: place.coord[1],
      iconPath: '/assets/campus-map/marker.png', width: 26, height: 34,
      callout: { content: place.name, display: 'BYCLICK', padding: 8, borderRadius: 8, color: '#2B174A', fontSize: 13 } }))
    const selected = options.keepSelection ? this.data.selected : null
    this.setData({ places, markers, categoryOptions, selected, selectedFavorite: Boolean(selected && favoriteIds.includes(selected.markerId)), detailExpanded: selected ? this.data.detailExpanded : false })
  },
  changePlaceMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (!['all', 'favorites', 'recent'].includes(mode)) return
    this.setData({ placeMode: mode }); this.refresh()
  },
  toggleFavorite() {
    const place = this.data.selected
    if (!place) return
    const favoriteIds = this.data.favoriteIds.includes(place.markerId)
      ? this.data.favoriteIds.filter(id => id !== place.markerId) : [place.markerId, ...this.data.favoriteIds]
    const saved = local.savePlaces('favorites', favoriteIds)
    this.setData({ favoriteIds, storageNotice: saved ? '' : '本机存储暂不可用，退出后可能无法保留。' })
    this.refresh({ keepSelection: true })
  },
  toggleDetail() { if (this.data.selected) this.setData({ detailExpanded: !this.data.detailExpanded }) },
  showAllPlaces() { this.setData({ placeMode: 'all', category: '', query: '' }); this.refresh() },
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
  search(event) { this.setData({ query: String(event.detail.value || '').slice(0, 80) }); this.refresh() },
  selectPlace(event) { this.selectById(Number(event.currentTarget.dataset.id)) },
  selectMarker(event) { this.selectById(Number(event.detail.markerId)) },
  selectById(id) {
    const place = this.data.places.find(item => item.markerId === id)
    if (!place) return
    const recentIds = [id, ...this.data.recentIds.filter(value => value !== id)].slice(0, 12)
    const saved = local.savePlaces('recent', recentIds)
    this.setData({ selected: place, selectedFavorite: this.data.favoriteIds.includes(id), detailExpanded: false, recentIds,
      storageNotice: saved ? '' : '本机存储暂不可用，退出后可能无法保留。', longitude: place.coord[0], latitude: place.coord[1], scale: 18 })
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
