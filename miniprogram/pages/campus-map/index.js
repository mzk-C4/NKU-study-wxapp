const { categories, campuses, buildings } = require('../../features/campus-map/data')
const local = require('../../utils/local-preferences')
const source = require('../../features/campus-map/source')
const validIds = new Set(buildings.map(place => place.markerId))
const ALL = { value: '', label: '全部' }
function filterPlaces(campusId, category, query) {
  const keyword = String(query || '').trim().toLowerCase()
  return buildings.filter(place => place.campusId === campusId && (!category || place.category === category) &&
    (!keyword || [place.name, place.desc, categories[place.category].label].join(' ').toLowerCase().includes(keyword)))
}
function markersFor(places, selected) {
  const visible = places.slice()
  if (selected && !visible.some(place => place.markerId === selected.markerId)) visible.push(selected)
  return visible.map(place => {
    const active = Boolean(selected && selected.markerId === place.markerId)
    return { id: place.markerId, longitude: place.coord[0], latitude: place.coord[1],
      iconPath: categories[place.category].markerIcon, width: active ? 38 : 28, height: active ? 48 : 35,
      zIndex: active ? 10 : 1, anchor: { x: 0.5, y: 1 },
      callout: { content: place.name, display: active ? 'ALWAYS' : 'BYCLICK', padding: 7, borderRadius: 8,
        color: '#2B174A', bgColor: '#FFFFFF', fontSize: 13 } }
  })
}
Page({
  data: { campusId: 'n', campusOptions: [{ id: 'n', label: '八里台' }, { id: 'j', label: '津南' }],
    category: '', query: '', categoryOptions: [], places: [], markers: [], selected: null,
    categoryIndex: 0, categoryLabel: '全部分类', panelCollapsed: false, keyboardFocused: false, keyboardHeight: 0, includePoints: [],
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
    const places = source.map(place => ({ ...place, images: place.images || [], categoryLabel: categories[place.category].label,
      categoryIcon: categories[place.category].markerIcon, favorite: favoriteIds.includes(place.markerId),
      canExpand: place.desc.length > 65 || Boolean(place.images && place.images.length) || Boolean(place.article) }))
    const available = new Set(buildings.filter(place => place.campusId === campusId).map(place => place.category))
    const categoryOptions = [ALL].concat(Object.keys(categories).filter(key => available.has(key)).map(key => ({ value: key, label: categories[key].label })))
    const selected = options.keepSelection ? this.data.selected : null
    this.setData({ places, markers: markersFor(places, selected), categoryOptions, selected,
      categoryIndex: Math.max(0, categoryOptions.findIndex(item => item.value === category)),
      categoryLabel: category ? categories[category].label : '全部分类',
      selectedFavorite: Boolean(selected && favoriteIds.includes(selected.markerId)), detailExpanded: selected ? this.data.detailExpanded : false })
    if (options.fit) this.fitResults()
  },
  fitResults() {
    const { places, campusId } = this.data
    if (!places.length) { this.setData({ includePoints: [] }); return }
    if (places.length === 1) {
      this.setData({ includePoints: [], longitude: places[0].coord[0], latitude: places[0].coord[1], scale: 17 }); return
    }
    // Invisible bounds leave room for marker heads at the edges of the native map.
    const lng = places.map(place => place.coord[0]); const lat = places.map(place => place.coord[1])
    const west = Math.min(...lng); const east = Math.max(...lng); const south = Math.min(...lat); const north = Math.max(...lat)
    const dx = Math.max((east - west) * 0.12, 0.0004); const dy = Math.max((north - south) * 0.18, 0.0004)
    this.setData({ longitude: campuses[campusId].coord[0], latitude: campuses[campusId].coord[1],
      includePoints: [{ longitude: west - dx, latitude: south - dy }, { longitude: east + dx, latitude: north + dy }] })
  },
  togglePanel() { this.setData({ panelCollapsed: !this.data.panelCollapsed }) },
  searchFocus() { this.setData({ keyboardFocused: true }) },
  searchBlur() { this.setData({ keyboardFocused: false, keyboardHeight: 0 }) },
  keyboardChanged(event) {
    if (this._isUnloaded) return
    const height = Math.max(0, Number(event.detail.height) || 0)
    this.setData({ keyboardHeight: this.data.keyboardFocused ? height : 0 })
  },
  confirmSearch() {
    this.searchBlur(); this.setData({ panelCollapsed: false }); this.fitResults()
    if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') wx.hideKeyboard()
  },
  clearSearch() { this.setData({ query: '' }); this.refresh({ fit: true }) },
  pickCategory(event) {
    const item = this.data.categoryOptions[Number(event.detail.value)]
    if (item) this.changeCategory({ currentTarget: { dataset: { value: item.value } } })
  },
  changePlaceMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (!['all', 'favorites', 'recent'].includes(mode)) return
    this.setData({ placeMode: mode }); this.refresh({ fit: true })
  },
  toggleFavorite() {
    const place = this.data.selected
    if (!place) return
    const favoriteIds = this.data.favoriteIds.includes(place.markerId)
      ? this.data.favoriteIds.filter(id => id !== place.markerId) : [place.markerId, ...this.data.favoriteIds]
    const saved = local.savePlaces('favorites', favoriteIds, validIds.size)
    this.setData({ favoriteIds, storageNotice: saved ? '' : '本机存储暂不可用，退出后可能无法保留。' })
    this.refresh({ keepSelection: true })
  },
  toggleDetail() { if (this.data.selected) this.setData({ detailExpanded: !this.data.detailExpanded }) },
  showAllPlaces() { this.setData({ placeMode: 'all', category: '', query: '', panelCollapsed: false }); this.refresh({ fit: true }) },
  changeCampus(event) {
    const campusId = event.currentTarget.dataset.id
    if (!campuses[campusId]) return
    const campus = campuses[campusId]
    this.setData({ campusId, category: '', query: '', includePoints: [], longitude: campus.coord[0], latitude: campus.coord[1], scale: campus.zoom })
    this.refresh({ fit: this.data.placeMode !== 'all' })
  },
  changeCategory(event) {
    const category = event.currentTarget.dataset.value
    if (!this.data.categoryOptions.some(item => item.value === category)) return
    this.setData({ category }); this.refresh({ fit: true })
  },
  search(event) { this.setData({ query: String(event.detail.value || '').slice(0, 80) }); this.refresh({ fit: true }) },
  selectPlace(event) { this.selectById(Number(event.currentTarget.dataset.id)) },
  selectMarker(event) { this.selectById(Number(event.detail.markerId)) },
  selectById(id) {
    const place = this.data.places.find(item => item.markerId === id) || (this.data.selected && this.data.selected.markerId === id ? this.data.selected : null)
    if (!place) return
    const recentIds = [id, ...this.data.recentIds.filter(value => value !== id)].slice(0, 12)
    const saved = local.savePlaces('recent', recentIds)
    this.setData({ selected: place, selectedFavorite: this.data.favoriteIds.includes(id), detailExpanded: false, recentIds,
      panelCollapsed: false, includePoints: [],
      storageNotice: saved ? '' : '本机存储暂不可用，退出后可能无法保留。', longitude: place.coord[0], latitude: place.coord[1], scale: 18 })
    this.refresh({ keepSelection: true })
  },
  closeDetail() { this.setData({ selected: null, detailExpanded: false }); this.refresh() },
  resetMap() {
    const campus = campuses[this.data.campusId]
    this.setData({ longitude: campus.coord[0], latitude: campus.coord[1], scale: campus.zoom, selected: null, includePoints: [] })
    this.refresh()
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
    const current = event.currentTarget.dataset.src
    if (urls.includes(current)) wx.previewImage({ current, urls })
  },
  copyArticle() {
    const article = this.data.selected && this.data.selected.article
    if (!article || !/^https:\/\/freshnkuer\.wiki\/pages\/[^\s\\]+$/.test(article)) return
    wx.setClipboardData({ data: article,
      success() { wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' }) },
      fail() { wx.showToast({ title: '复制失败，请重试', icon: 'none' }) } })
  },
  showSource() {
    wx.showModal({ title: '感谢地图贡献者',
      content: `地图内容由 ${source.contributor} 提供，感谢贡献！\n来源：NKUwiki（${source.revision.slice(0, 7)}）\n内容许可：${source.contentLicense}\n本小程序适配了原生地图、图标与布局。`,
      confirmText: '复制来源', cancelText: '关闭',
      success: result => {
        if (!result.confirm || this._isUnloaded) return
        wx.setClipboardData({ data: source.url, fail() { wx.showToast({ title: '复制失败，请重试', icon: 'none' }) } })
      } })
  }
})
