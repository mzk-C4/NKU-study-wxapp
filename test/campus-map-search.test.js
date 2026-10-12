const test = require('node:test')
const assert = require('node:assert/strict')
const { tokenize, createBuildingSearch } = require('../miniprogram/features/campus-map/search')
const { buildings, categories } = require('../miniprogram/features/campus-map/data')
const search = createBuildingSearch(buildings, categories)

test('map tokenization supports Chinese unigrams/bigrams, Latin words and full-width input', () => {
  assert.deepEqual(tokenize('图书馆，ＴＳＧ １２３'), ['图', '书', '馆', '图书', '书馆', 'tsg', '123'])
  assert.deepEqual(tokenize(''), [])
})

test('every upstream place remains searchable by its complete name without changing data', () => {
  const before = JSON.stringify(buildings)
  for (const place of buildings) {
    const ids = search(place.name)
    assert.ok(ids.includes(place.id), place.name)
    assert.equal(buildings.find(item => item.id === ids[0]).name, place.name)
  }
  assert.equal(JSON.stringify(buildings), before)
})

test('Chinese partial names, typos and missing characters recall the intended place', () => {
  for (const query of ['图书', '图书官', '图输馆']) assert.equal(search(query)[0], 'n_library_01', query)
  assert.equal(buildings.find(place => place.id === search('第二教学楼')[0]).name, '第二主教学楼')
  assert.ok(search('自习').includes('n_library_01'))
})

test('phrases combine across fields but a common single character does not recall unrelated places', () => {
  assert.deepEqual(new Set(search('图书 自习')), new Set(['n_library_01', 'j_library_01']))
  assert.deepEqual(search('图书 食堂'), [])
  assert.deepEqual(search('不存在的建筑'), [])
  assert.deepEqual(search('zzzunknown'), [])
  assert.ok(search('图').includes('n_library_01'))
  assert.ok(!search('教学').includes('n_landmark_01'))
})

test('optional aliases support Chinese, pinyin, initials, prefixes and Latin typo tolerance', () => {
  const lookup = createBuildingSearch([
    { id: 'library', name: '测试图书馆', desc: '可以自习', aliases: ['逸夫馆', 'tushuguan', 'tsg'] },
    { id: 'hall', name: '测试礼堂', desc: '演出' }
  ])
  for (const query of ['逸夫', 'TUSHU', 'ＴＳＧ', 'tushugun', 'tsg 自习']) assert.deepEqual(lookup(query), ['library'], query)
  assert.deepEqual(lookup('tsg 演出'), [])
  // Real upstream data currently supplies no pinyin aliases; do not invent them.
  assert.deepEqual(search('tsg'), [])
})

test('blank queries retain data order, punctuation is empty, queries are bounded and category search survives', () => {
  assert.deepEqual(search('  '), buildings.map(place => place.id))
  assert.deepEqual(search('，!!!'), [])
  const lookup = createBuildingSearch([{ id: 'bounded', name: 'x'.repeat(80), desc: '' }])
  assert.deepEqual(lookup('x'.repeat(5000)), ['bounded'])
  assert.ok(search('运动场馆').length)
  assert.ok(search('运动场馆').every(id => buildings.find(place => place.id === id).category === 'sports'))
})
