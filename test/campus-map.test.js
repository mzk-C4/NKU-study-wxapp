const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { buildings, campuses, categories } = require('../miniprogram/features/campus-map/data')
function page() {
  let definition
  global.Page = value => { definition = value }
  const modulePath = require.resolve('../miniprogram/pages/campus-map/index')
  delete require.cache[modulePath]
  require(modulePath)
  delete global.Page
  const instance = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() } }
  instance.onLoad()
  return instance
}
test('all imported places have unique numeric markers and valid GCJ02 coordinates', () => {
  assert.equal(buildings.length, 76)
  assert.equal(new Set(buildings.map(place => place.markerId)).size, buildings.length)
  for (const place of buildings) {
    assert.ok(campuses[place.campusId]); assert.ok(categories[place.category])
    assert.ok(place.coord[0] > 117 && place.coord[0] < 118)
    assert.ok(place.coord[1] > 38 && place.coord[1] < 40)
  }
})
test('campus, category, search and selection remain consistent', () => {
  const instance = page()
  assert.ok(instance.data.places.every(place => place.campusId === 'n'))
  instance.selectMarker({ detail: { markerId: instance.data.places[0].markerId } })
  assert.ok(instance.data.selected)
  instance.changeCampus({ currentTarget: { dataset: { id: 'j' } } })
  assert.equal(instance.data.selected, null)
  assert.ok(instance.data.places.every(place => place.campusId === 'j'))
  instance.changeCategory({ currentTarget: { dataset: { value: 'college' } } })
  assert.ok(instance.data.places.length)
  assert.ok(instance.data.places.every(place => place.category === 'college'))
  instance.search({ detail: { value: '不存在的建筑' } })
  assert.equal(instance.data.markers.length, 0)
  instance.selectById(buildings[0].markerId)
  assert.equal(instance.data.selected, null)
})
test('navigation uses selected longitude and latitude in correct order and handles failure', () => {
  const instance = page()
  const place = instance.data.places[0]
  instance.selectById(place.markerId)
  let options; let toast
  global.wx = { openLocation(value) { options = value }, showToast(value) { toast = value } }
  try {
    instance.navigate()
    assert.equal(options.latitude, place.coord[1]); assert.equal(options.longitude, place.coord[0])
    options.fail(); assert.equal(toast.icon, 'none')
  } finally { delete global.wx }
})

test('map failure can remount while preserving selection and ignores callbacks after unload', () => {
  const instance = page()
  const place = instance.data.places[0]
  instance.selectById(place.markerId)
  instance.mapFailed()
  assert.equal(instance.data.mapError, true)
  const pending = []
  global.wx = { nextTick(callback) { pending.push(callback) } }
  try {
    instance.retryMap()
    assert.equal(instance.data.mapVisible, false)
    instance.retryMap()
    assert.equal(pending.length, 1)
    pending.shift()()
    assert.equal(instance.data.mapVisible, true)
    assert.equal(instance.data.mapError, false)
    assert.equal(instance.data.selected.id, place.id)
    instance.retryMap()
    instance.onUnload()
    pending.shift()()
    assert.equal(instance.data.mapVisible, false)
    instance.mapFailed()
    assert.equal(instance.data.mapError, false)
  } finally { delete global.wx }
})

test('map boots with the mini-program JS-only module loader, including source attribution', () => {
  let definition
  const cache = new Map()
  function load(file) {
    const target = file.endsWith('.js') ? file : `${file}.js`
    assert.ok(fs.existsSync(target), `Mini-program cannot require this module: ${target}`)
    if (cache.has(target)) return cache.get(target).exports
    const module = { exports: {} }; cache.set(target, module)
    vm.runInNewContext(fs.readFileSync(target, 'utf8'), {
      module, exports: module.exports, Page: value => { definition = value }, wx: {},
      require: request => { assert.ok(request.startsWith('.')); return load(path.resolve(path.dirname(target), request)) }
    }, { filename: target })
    return module.exports
  }
  load(path.resolve(__dirname, '../miniprogram/pages/campus-map/index'))
  const instance = { ...definition, data: definition.data, setData(patch) { Object.assign(this.data, patch) } }
  instance.onLoad()
  assert.equal(instance.data.places.length, 42)
  assert.equal(instance.data.markers.length, 42)
  assert.equal(typeof instance.showSource, 'function')
})

test('category assets exist, IDs stay compatible, and unused categories are hidden', () => {
  const registry = require('../scripts/campus-map-source.json').markerIds
  for (const place of buildings) {
    assert.equal(place.markerId, registry[place.id])
    const file = path.join(__dirname, '../miniprogram', categories[place.category].markerIcon)
    assert.equal(fs.readFileSync(file).subarray(1, 4).toString(), 'PNG')
  }
  const instance = page()
  assert.ok(!instance.data.categoryOptions.some(item => item.value === 'shop' || item.value === 'tool'))
  instance.pickCategory({ detail: { value: instance.data.categoryOptions.findIndex(item => item.value === 'library') } })
  assert.ok(instance.data.places.every(place => place.category === 'library'))
  instance.search({ detail: { value: '找不到' } }); assert.equal(instance.data.places.length, 0)
  instance.clearSearch(); assert.ok(instance.data.places.length)
})

test('selected marker remains visible after removing its favorite until detail is closed', () => {
  const instance = page(); const place = instance.data.places[0]
  instance.selectById(place.markerId); instance.toggleFavorite()
  instance.changePlaceMode({ currentTarget: { dataset: { mode: 'favorites' } } })
  instance.selectById(place.markerId); instance.toggleFavorite()
  assert.equal(instance.data.places.length, 0)
  assert.equal(instance.data.markers.length, 1)
  assert.equal(instance.data.markers[0].id, place.markerId)
  assert.equal(instance.data.markers[0].callout.display, 'ALWAYS')
  instance.togglePanel(); assert.equal(instance.data.panelCollapsed, true)
  instance.togglePanel(); assert.equal(instance.data.selected.id, place.id)
  instance.closeDetail(); assert.equal(instance.data.markers.length, 0)
})

test('filtered map bounds contain results and selection/reset remove stale bounds', () => {
  const instance = page()
  instance.search({ detail: { value: '图书馆' } })
  const [sw, ne] = instance.data.includePoints
  for (const place of instance.data.places) {
    assert.ok(place.coord[0] > sw.longitude && place.coord[0] < ne.longitude)
    assert.ok(place.coord[1] > sw.latitude && place.coord[1] < ne.latitude)
  }
  instance.selectById(instance.data.places[0].markerId)
  assert.deepEqual(instance.data.includePoints, [])
  assert.equal(instance.data.markers.filter(marker => marker.zIndex === 10).length, 1)
  instance.resetMap(); assert.equal(instance.data.selected, null)
  assert.equal(instance.data.longitude, campuses.n.coord[0])
})

test('keyboard compacts the panel, confirm restores results, and late events are ignored', () => {
  const instance = page()
  instance.searchFocus(); instance.keyboardChanged({ detail: { height: 260 } })
  assert.equal(instance.data.keyboardFocused, true); assert.equal(instance.data.keyboardHeight, 260)
  instance.confirmSearch()
  assert.equal(instance.data.keyboardHeight, 0); assert.equal(instance.data.panelCollapsed, false)
  instance.keyboardChanged({ detail: { height: 260 } }); assert.equal(instance.data.keyboardHeight, 0)
  instance.onUnload(); instance.keyboardChanged({ detail: { height: 200 } })
  assert.equal(instance.data.keyboardHeight, 0)
})

test('favorite storage follows available IDs instead of truncating at the original 76 points', () => {
  const local = require('../miniprogram/utils/local-preferences')
  const values = Array.from({ length: 250 }, (_, index) => index + 1)
  const storage = new Map()
  global.wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) }
  try {
    local.savePlaces('favorites', values, values.length)
    assert.deepEqual(local.readPlaces('favorites', new Set(values)), values)
    local.savePlaces('recent', values)
    assert.equal(local.readPlaces('recent', new Set(values)).length, 12)
  } finally { delete global.wx }
})

test('article copying and multi-image preview use only the selected place data', () => {
  const instance = page(); instance.selectById(buildings[0].markerId)
  let copied; let preview; let toast
  global.wx = { setClipboardData(value) { copied = value }, previewImage(value) { preview = value }, showToast(value) { toast = value } }
  try {
    instance.copyArticle(); assert.equal(copied.data, 'https://freshnkuer.wiki/pages/BalitaiCampus/#主楼')
    copied.fail(); assert.match(toast.title, /复制失败/)
    instance.previewImage({ currentTarget: { dataset: { src: instance.data.selected.images[0].src } } })
    assert.equal(preview.urls.length, 1)
    instance.data.selected.images.push({ src: '/assets/campus-map/extra-test.png', caption: '第二张' })
    instance.previewImage({ currentTarget: { dataset: { src: '/assets/campus-map/extra-test.png' } } })
    assert.equal(preview.urls.length, 2)
    instance.data.selected.images.pop()
    instance.data.selected = { ...instance.data.selected, article: 'https://example.com/unsafe' }
    copied = null; instance.copyArticle(); assert.equal(copied, null)
  } finally { delete global.wx }
})

const { literalExport, adapt } = require('../scripts/sync-campus-map')
function upstreamFixture(places, icon = '<path d="M2 2v4"/>') {
  const category = places[0].category
  return [
    ['CATEGORY_CONFIG', { [category]: { label: '地标', color: '#711A5F' } }],
    ['CATEGORY_ICON_PATHS', { [category]: icon }],
    ['CAMPUS_CONFIG', campuses], ['BUILDINGS', places]
  ].map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`).join('\n')
}
test('sync never evaluates expressions and rejects malformed or executable source', () => {
  assert.equal(literalExport("export const X = { a: '中文', /* comment */ b: [1, true,], }", 'X').a, '中文')
  assert.throws(() => literalExport('export const X = (() => 42)()', 'X'))
  assert.throws(() => literalExport('export const X = {} + unsafe()', 'X'))
  assert.throws(() => literalExport('export const X = { __proto__: {} }', 'X'))
  assert.throws(() => literalExport('export const X = { a: 1, a: 2 }', 'X'))
})

test('sync preserves IDs across reorder/removal and allocates after all reserved IDs', () => {
  const config = require('../scripts/campus-map-source.json')
  const [first, second] = buildings.slice(0, 2)
  const fresh = { ...first, id: 'n_landmark_new', name: '新增测试点', article: undefined }
  const result = adapt(upstreamFixture([second, fresh]), config)
  assert.equal(result.data.buildings[0].markerId, second.markerId)
  assert.equal(result.markerIds[first.id], first.markerId)
  assert.equal(result.data.buildings[1].markerId, 77)
  assert.equal(config.markerIds.n_landmark_new, undefined)
})

test('sync validates coordinates, duplicate IDs, image mappings, article origin and SVG geometry', () => {
  const config = require('../scripts/campus-map-source.json')
  const place = { ...buildings[1] }
  assert.throws(() => adapt(upstreamFixture([place, place]), config), /duplicate/)
  assert.throws(() => adapt(upstreamFixture([{ ...place, coord: [0, 0] }]), config), /Invalid place/)
  assert.throws(() => adapt(upstreamFixture([{ ...place, photos: ['/unknown.png'] }]), config), /image mapping/)
  assert.throws(() => adapt(upstreamFixture([{ ...place, article: '//evil.test' }]), config), /Invalid article/)
  assert.throws(() => adapt(upstreamFixture([place], '<script>alert(1)</script>'), config), /Unsafe SVG/)
  const adapted = adapt(upstreamFixture([{ ...place, photos: ['/map/pic/nankai-main-building.png'], article: '/pages/BalitaiCampus/#主楼' }]), config)
  assert.equal(adapted.data.buildings[0].images[0].caption, '南开大学主楼与周恩来总理塑像')
})
