const test = require('node:test')
const assert = require('node:assert/strict')
const { buildings, campuses, categories } = require('../miniprogram/features/campus-map/data')
function page() {
  let definition
  global.Page = value => { definition = value }
  const modulePath = require.resolve('../miniprogram/pages/campus-map/index')
  delete require.cache[modulePath]
  require(modulePath)
  delete global.Page
  const instance = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch) } }
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
