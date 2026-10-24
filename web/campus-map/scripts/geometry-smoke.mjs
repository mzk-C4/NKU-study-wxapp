/** Exercises every generated geometry without requiring a GPU or browser. */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = await readFile(resolve('src', 'data', 'jinnan-model.ts'), 'utf8')
const expression = source
  .replace(/^\/\*\*[^]*?\*\/\n/, '')
  .replace(/^import[^\n]+\n/, '')
  .replace('export const campusModel: CampusSeed =', 'return')
const campusModel = new Function(expression)()
const originalBuildings = [...campusModel.buildings]
const supplementalSource = await readFile(resolve('src', 'data', 'supplemental-buildings.ts'), 'utf8')
const supplementalModule = ts.transpileModule(supplementalSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { SUPPLEMENTAL_BUILDINGS, SUPPLEMENTAL_FRAMES } = await import(`data:text/javascript;base64,${Buffer.from(supplementalModule).toString('base64')}`)
campusModel.buildings.push(...SUPPLEMENTAL_BUILDINGS)
const statueDataSource = await readFile(resolve('src', 'data', 'zhou-enlai-monument.ts'), 'utf8')
const statueDataModule = ts.transpileModule(statueDataSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const statueDataUrl = `data:text/javascript;base64,${Buffer.from(statueDataModule).toString('base64')}`
const { ZHOU_ENLAI_STATUE_BUILDING, ZHOU_ENLAI_STATUE_SITE, ZHOU_ENLAI_STATUE_ID } = await import(statueDataUrl)
campusModel.buildings.push(ZHOU_ENLAI_STATUE_BUILDING)
const whiteBuildingSource = await readFile(resolve('src', 'white-building.ts'), 'utf8')
const whiteBuildingModule = ts.transpileModule(whiteBuildingSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
const { createWhiteBuildingGeometry } = await import(`data:text/javascript;base64,${Buffer.from(whiteBuildingModule).toString('base64')}`)

function shapeFrom(points) {
  const shape = new THREE.Shape()
  points.forEach(([x, z], index) => index === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z))
  shape.closePath()
  return shape
}

function roadGeometry(road) {
  const halfWidth = road.kind === 'primary' ? 15 : road.kind === 'secondary' ? 9 : 3.5
  const vertices = []
  const indices = []
  road.points.forEach(([x, z], index) => {
    const previous = road.points[Math.max(0, index - 1)]
    const next = road.points[Math.min(road.points.length - 1, index + 1)]
    const dx = next[0] - previous[0]
    const dz = next[1] - previous[1]
    const length = Math.hypot(dx, dz) || 1
    const offsetX = (-dz / length) * halfWidth
    const offsetZ = (dx / length) * halfWidth
    vertices.push(x + offsetX, .18, z + offsetZ, x - offsetX, .18, z - offsetZ)
    if (index > 0) {
      const base = index * 2
      indices.push(base - 2, base, base - 1, base - 1, base, base + 1)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  return geometry
}

const diagnostics = { buildings: 0, areas: 0, roads: 0, triangles: 0 }
try {
  for (const building of campusModel.buildings) {
    const geometry = createWhiteBuildingGeometry(building)
    if (!geometry.getAttribute('position').count) throw new Error(`${building.id}: empty building geometry`)
    diagnostics.buildings += 1
    diagnostics.triangles += geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3
    geometry.dispose()
  }
  assert.equal(SUPPLEMENTAL_BUILDINGS.length, 3)
  assert.deepEqual(SUPPLEMENTAL_BUILDINGS.map(building => building.name), ['旅游与服务学院', '周恩来政府管理学院', '学生宿舍1'])
  assert.equal(new Set(campusModel.buildings.map(building => building.id)).size, campusModel.buildings.length, 'Do not duplicate imported buildings')
  assert.equal(originalBuildings.length, 89, 'Keep all existing imported buildings')
  for (const building of SUPPLEMENTAL_BUILDINGS) {
    assert.equal(building.verified, 'user-reference', 'Do not label approximate satellite reconstruction as OSM or measured data')
    assert(building.volumes.length >= 6)
    const geometry = createWhiteBuildingGeometry(building)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    mesh.updateMatrixWorld(true)
    for (const volume of building.volumes) {
      const x = volume.footprint.reduce((sum, p) => sum + p[0], 0) / 4
      const z = volume.footprint.reduce((sum, p) => sum + p[1], 0) / 4
      const hit = new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0]
      assert(hit && Math.abs(hit.point.y - volume.height) < .01, 'Every satellite-traced wing needs its own white volume and correct roof height')
    }
    const frame = building.name === '旅游与服务学院' ? SUPPLEMENTAL_FRAMES.tourism : building.name === '学生宿舍1' ? SUPPLEMENTAL_FRAMES.dormitory1 : SUPPLEMENTAL_FRAMES.government
    const localSamples = building.name === '旅游与服务学院' ? [[-14, -8], [37, 22]] : building.name === '学生宿舍1' ? [[0, 0], [-28.5, -37], [13, 35]] : [[0, -15], [-13.5, 0]]
    for (const [x, z] of localSamples) {
      const origin = new THREE.Vector3(frame.x + x * Math.cos(frame.angle) - z * Math.sin(frame.angle), 60, frame.z + x * Math.sin(frame.angle) + z * Math.cos(frame.angle))
      assert.equal(new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObject(mesh).length, 0, 'Courtyards and reference entrance gaps must not be filled by a solid envelope')
    }
    geometry.dispose(); mesh.material.dispose()
  }
  console.log('Supplemental white models check passed: tourism courtyard and east entrance, government ring/low atrium/west porch, dormitory 1 split wings and north/south openings; 3 searchable buildings, existing models preserved.')
  const statueSource = await readFile(resolve('src', 'zhou-enlai-statue.ts'), 'utf8')
  const statueModule = ts.transpileModule(statueSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
    .replace(/from (['"])\.\/data\/zhou-enlai-monument\1/g, () => `from ${JSON.stringify(statueDataUrl)}`)
  const { createZhouEnlaiStatue } = await import(`data:text/javascript;base64,${Buffer.from(statueModule).toString('base64')}`)
  const statue = createZhouEnlaiStatue()
  statue.updateMatrixWorld(true)
  assert.equal(campusModel.buildings.find(building => building.id === ZHOU_ENLAI_STATUE_ID).name, '周总理雕像')
  assert.equal(ZHOU_ENLAI_STATUE_BUILDING.category, 'landmark')
  assert.equal(ZHOU_ENLAI_STATUE_BUILDING.verified, 'user-reference')
  assert(ZHOU_ENLAI_STATUE_BUILDING.aliases.includes('图书馆前雕像'))
  assert.equal(statue.userData.layout.posture, 'standing-silhouette')
  assert.equal(statue.userData.layout.facialFeatures, false)
  assert.equal(statue.userData.layout.clothingDetails, false)
  assert(statue.userData.layout.figureHeight / statue.userData.layout.headHeight > 6.8 && statue.userData.layout.figureHeight / statue.userData.layout.headHeight < 7.2, 'Keep the silhouette close to seven-head human proportions')
  assert.equal(statue.userData.layout.surfaceStyle, 'angular-planar')
  assert.equal(statue.userData.layout.radialSegments, 8)
  const bronzeFigure = statue.children.find(mesh => mesh.material.color.getHex() === 0x806a58)
  assert(bronzeFigure.material.flatShading, 'The figure must use crisp planar shading, not rounded gradients')
  const figureNormals = bronzeFigure.geometry.getAttribute('normal')
  for (let i = 0; i < figureNormals.count; i += 3) for (const j of [i + 1, i + 2]) {
    assert(Math.abs(figureNormals.getX(i) - figureNormals.getX(j)) < .000001 && Math.abs(figureNormals.getY(i) - figureNormals.getY(j)) < .000001 && Math.abs(figureNormals.getZ(i) - figureNormals.getZ(j)) < .000001, 'Each sculpted triangle must retain a hard-edged plane normal')
  }
  assert(!statueSource.includes('materials.relief') && !statueSource.includes('materials.hair'), 'Do not reintroduce clothing, facial or hair details')
  assert.equal(statue.userData.layout.steppedBase, 3)
  assert.equal(statue.userData.layout.inscription, '我是爱南开的')
  assert.equal(statue.children.length, 4, 'Keep only stone, base edging, a plain bronze figure and the plaque')
  const statueBox = new THREE.Box3().setFromObject(statue)
  assert(statueBox.max.y > 6 && statueBox.max.y < 7, 'Keep the human figure and stone plinth at campus scale')
  const library = campusModel.buildings.find(building => building.id === 'osm-building-616829077')
  assert(ZHOU_ENLAI_STATUE_SITE.z > Math.max(...library.footprint.map(p => p[1])) + 20, 'Place the sculpture on the southern library forecourt, not inside the library')
  for (const child of statue.children) {
    for (const coordinate of child.geometry.getAttribute('position').array) assert(Number.isFinite(coordinate), 'Statue geometry must remain finite')
  }
  const libraryCrossPath = campusModel.roads.find(road => road.id === 'osm-road-1458201953-1')
  assert(ZHOU_ENLAI_STATUE_BUILDING.footprint.every(p => p[1] > Math.max(...libraryCrossPath.points.map(p => p[1])) + 5), 'Move the entire stepped base south of the cross-path without occupying its edging')
  const plaque = statue.getObjectByName('我是爱南开的铭牌')
  assert(plaque)
  assert(plaque.position.z > 1.2, 'The plaque must be on the south-facing pedestal front')
  statue.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose() })
  console.log('Premier Zhou statue check passed: angular seven-head silhouette with hard planar normals, no face/clothing details, posed arms, preserved inscription/name/site south of the library cross-path.')
  for (const area of campusModel.greens) {
    const geometry = new THREE.ShapeGeometry(shapeFrom(area.polygon))
    geometry.rotateX(-Math.PI / 2)
    if (!geometry.getAttribute('position').count) throw new Error(`${area.id}: empty landscape geometry`)
    diagnostics.areas += 1
    geometry.dispose()
  }
  for (const kind of ['primary', 'secondary', 'walkway']) {
    const parts = campusModel.roads.filter((road) => road.kind === kind).map(roadGeometry)
    if (!parts.length) continue
    const merged = mergeGeometries(parts, false)
    parts.forEach((part) => part.dispose())
    if (!merged) throw new Error(`${kind}: geometry merge failed`)
    if (!merged.getAttribute('position').count) throw new Error(`${kind}: merged road geometry is empty`)
    diagnostics.roads += campusModel.roads.filter((road) => road.kind === kind).length
    merged.dispose()
  }
  // 直接测试实际运动场生成器；内存转译不产生检查用的临时源码文件。
  const sportsSource = await readFile(resolve('src', 'sports-grounds.ts'), 'utf8')
  const sportsModule = ts.transpileModule(sportsSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
  const { createGymSportsGrounds, createScienceSportsGrounds, createScienceCourtGrounds, createStadiumStand, STADIUM_STAND_ID, getScienceCourtAreas, SCIENCE_PITCH_ID } = await import(`data:text/javascript;base64,${Buffer.from(sportsModule).toString('base64')}`)
  const gymGrounds = createGymSportsGrounds(campusModel)
  const scienceGrounds = createScienceSportsGrounds(campusModel)
  const scienceCourts = createScienceCourtGrounds(campusModel)
  const standSource = campusModel.buildings.find(building => building.id === STADIUM_STAND_ID)
  const standBrick = new THREE.MeshLambertMaterial({ color: 0x9c6249 })
  const stand = createStadiumStand(standSource, campusModel.greens, standBrick)
  assert.equal(standSource.name, '文科主体育场主席台')
  assert(standSource.aliases.includes('主席台'), 'Stadium stand must be searchable')
  assert.equal(stand.userData.layout.canopyColumns, 12)
  assert.equal(stand.userData.layout.rearWindowBays, 14)
  assert.equal(stand.userData.layout.seatRows, 20)
  assert.equal(stand.userData.layout.centralRows, 12)
  assert.equal(stand.userData.layout.centralBooth, true)
  assert.deepEqual(stand.userData.layout.seatZones.map(zone => zone.color), ['blue', 'teal', 'red', 'red', 'teal', 'blue'])
  assert(stand.children.length <= 13, 'Stadium stand should use material batches')
  assert(stand.children.some(mesh => mesh.material === standBrick), 'Stadium stand must reuse the library brown brick')
  const standCenter = [0, 1].map(axis => standSource.footprint.reduce((sum, point) => sum + point[axis], 0) / standSource.footprint.length)
  assert(Math.hypot(stand.position.x - standCenter[0], stand.position.z - standCenter[1]) < .0001, 'Stadium stand must stay at its original position')
  stand.updateMatrixWorld(true)
  const { width: sw, length: sl } = stand.userData.layout
  const canopyOrigin = new THREE.Vector3(0, 40, sl * .22).applyMatrix4(stand.matrixWorld)
  const canopyHit = new THREE.Raycaster(canopyOrigin, new THREE.Vector3(0, -1, 0)).intersectObject(stand, true)[0]
  assert(Math.abs(canopyHit.point.y - 18.98) < .02, 'Long canopy must cover the center stands')
  const endOrigin = new THREE.Vector3(0, 40, sl * .455).applyMatrix4(stand.matrixWorld)
  const endHit = new THREE.Raycaster(endOrigin, new THREE.Vector3(0, -1, 0)).intersectObject(stand, true)[0]
  assert(endHit.point.y < 14, 'Blue end seating must remain exposed outside the canopy')
  for (const sign of [-1, 1]) {
    const rayOrigin = new THREE.Vector3(sw, 5, sign * sl * .18).applyMatrix4(stand.matrixWorld)
    const direction = new THREE.Vector3(-1, 0, 0).transformDirection(stand.matrixWorld)
    const hits = new THREE.Raycaster(rayOrigin, direction).intersectObject(stand, true)
    assert(hits.length > 0, 'Both central red seating blocks must be completed')
  }
  const standMaterials = new Set()
  for (const mesh of stand.children) {
    for (const coordinate of mesh.geometry.getAttribute('position').array) assert(Number.isFinite(coordinate), 'Invalid stadium stand geometry')
    mesh.geometry.dispose(); standMaterials.add(mesh.material)
  }
  standMaterials.forEach(material => material.dispose())
  console.log('Main stadium stand check passed: blue/teal/red mirrored seating, 12 canopy columns, rear window wall, central booth and original position.')
  assert.deepEqual([gymGrounds.userData.layout.tennis, gymGrounds.userData.layout.basketball, gymGrounds.userData.layout.volleyball], [12, 12, 11])
  assert.deepEqual([scienceGrounds.userData.layout.football, scienceGrounds.userData.layout.lanes, scienceGrounds.userData.layout.sprintLanes, scienceGrounds.userData.layout.goals, scienceGrounds.userData.layout.stand], [1, 4, 6, 2, false])
  const sciencePitch = campusModel.greens.find(area => area.id === SCIENCE_PITCH_ID)
  assert(sciencePitch, 'Science pitch source missing')
  const pitchCenter = [0, 1].map(axis => sciencePitch.polygon.reduce((total, point) => total + point[axis], 0) / sciencePitch.polygon.length)
  assert(Math.abs(scienceGrounds.position.x - pitchCenter[0]) < .0001 && Math.abs(scienceGrounds.position.z - pitchCenter[1]) < .0001, 'Science pitch was moved')
  assert.equal(scienceGrounds.userData.layout.outerLawn, false)
  scienceGrounds.updateMatrixWorld(true)
  const outsideTrack = new THREE.Vector3(-scienceGrounds.userData.layout.pitchWidth * .78, 10, scienceGrounds.userData.layout.pitchLength * .80).applyMatrix4(scienceGrounds.matrixWorld)
  const outsideRay = new THREE.Raycaster(outsideTrack, new THREE.Vector3(0, -1, 0))
  assert.equal(outsideRay.intersectObject(scienceGrounds, true).length, 0, 'Rectangular outer lawn/base must not cover the area outside the track')
  assert.deepEqual([scienceCourts.userData.layout.tennis, scienceCourts.userData.layout.basketball, scienceCourts.userData.layout.volleyball, scienceCourts.userData.layout.hoops, scienceCourts.userData.layout.nets], [5, 9, 8, 18, 13])
  assert.deepEqual(scienceCourts.userData.layout.tennisRows, [3, 2])
  assert.deepEqual(scienceCourts.userData.layout.basketballRows, [3, 3, 3])
  assert.deepEqual(scienceCourts.userData.layout.volleyballRows, [4, 4])
  const courtSources = getScienceCourtAreas(campusModel.greens)
  assert.equal(scienceCourts.userData.courts.length, courtSources.length)
  for (const court of scienceCourts.userData.courts) {
    const source = courtSources.find(area => area.id === court.id)
    assert(source, `Court source missing: ${court.id}`)
    for (const axis of [0, 1]) assert(Math.abs(court.center[axis] - source.polygon.reduce((sum, point) => sum + point[axis], 0) / source.polygon.length) < .0001, `Court moved: ${court.id}`)
  }
  for (const group of [gymGrounds, scienceGrounds, scienceCourts]) {
    assert(!new THREE.Box3().setFromObject(group).isEmpty(), `${group.name}: empty sports bounds`)
    let meshes = 0
    const materials = new Set()
    group.traverse(object => {
      if (!object.isMesh) return
      meshes++
      const positions = object.geometry.getAttribute('position')
      assert(positions.count > 0, `${group.name}: empty mesh`)
      for (const coordinate of positions.array) assert(Number.isFinite(coordinate), `${group.name}: non-finite coordinate`)
      object.geometry.dispose()
      materials.add(object.material)
    })
    assert(meshes > 0 && meshes <= 12, `${group.name}: unexpected batch count ${meshes}`)
    materials.forEach(material => material.dispose())
  }
  console.log('Sports geometry check passed: gym 12 tennis / 12 basketball / 11 volleyball; science 1 pitch / 4 oval lanes / 6 sprint lanes / 2 goals, original position preserved.')
  console.log('Science adjacent courts check passed: 5 tennis (3+2) / 9 basketball (3x3) / 8 volleyball (2x4), original positions preserved.')
  const pavilionSource = await readFile(resolve('src', 'lakeside-pavilion.ts'), 'utf8')
  const pavilionModule = ts.transpileModule(pavilionSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
  const { createLakesidePavilion, LAKESIDE_PAVILION_SITE } = await import(`data:text/javascript;base64,${Buffer.from(pavilionModule).toString('base64')}`)
  const pavilion = createLakesidePavilion()
  assert.equal(pavilion.userData.layout.columns.length, 4)
  assert.equal(pavilion.userData.layout.roofTiers, 2)
  assert.equal(pavilion.userData.layout.openSides, 4)
  assert.equal(pavilion.children.length, 5)
  const approach = campusModel.roads.find(road => road.id === LAKESIDE_PAVILION_SITE.pathId)
  assert(approach.points.some(([x, z]) => Math.hypot(x - pavilion.position.x, z - pavilion.position.z) < .1), 'Pavilion must stand at the peninsula walkway endpoint')
  const lake = campusModel.greens.find(area => area.id === LAKESIDE_PAVILION_SITE.lakeId)
  function insidePolygon(x, z, polygon) {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, zi] = polygon[i], [xj, zj] = polygon[j]
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
    }
    return inside
  }
  for (let i = 0; i < 48; i++) {
    const theta = i * Math.PI / 24
    assert(!insidePolygon(pavilion.position.x + Math.cos(theta) * 5.35, pavilion.position.z + Math.sin(theta) * 5.35, lake.polygon), 'Pavilion platform must stay on the peninsula, not in the lake')
  }
  pavilion.updateMatrixWorld(true)
  for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
    const origin = direction.clone().multiplyScalar(-5).setY(2.0).applyMatrix4(pavilion.matrixWorld)
    const rayDirection = direction.clone().transformDirection(pavilion.matrixWorld)
    assert.equal(new THREE.Raycaster(origin, rayDirection, 0, 10).intersectObject(pavilion, true).length, 0, 'Pavilion sides must remain open')
  }
  for (const mesh of pavilion.children) {
    for (const coordinate of mesh.geometry.getAttribute('position').array) assert(Number.isFinite(coordinate))
    mesh.geometry.dispose(); mesh.material.dispose()
  }
  console.log('Lakeside pavilion check passed: four columns, two roof tiers, four open sides, walkway endpoint, platform on dry land.')
  const teachingSource = await readFile(resolve('src', 'public-teaching.ts'), 'utf8')
  const mainSource = await readFile(resolve('src', 'main.ts'), 'utf8')
  assert(!/\baddTrees\s*\(/.test(mainSource), 'Automatic map trees must not be restored')
  assert(!/\btrunk\b|materials\.foliage/.test(mainSource), 'Business courtyard trees must be removed too')
  assert(!/\bfunction tree\b|materials\.bark|materials\.darkBark/.test(teachingSource), 'Teaching courtyard trees must be removed too')
  console.log('Tree removal check passed: original random landscape trees and both detailed courtyard tree systems remain removed; shrubs retained.')
  const rowsSource = await readFile(resolve('src', 'eastern-row-trees.ts'), 'utf8')
  const rowsModule = ts.transpileModule(rowsSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
  const rowsModuleUrl = `data:text/javascript;base64,${Buffer.from(rowsModule).toString('base64')}`
  const { createEasternRowTrees, createEasternPlantedGround, EASTERN_TREE_SCOPE, NORTHEAST_LAKE_RESERVE, EASTERN_TREE_GRID, inTreePolygon } = await import(rowsModuleUrl)
  const reservedSports = [gymGrounds, scienceGrounds, scienceCourts].map(group => {
    const bounds = new THREE.Box3().setFromObject(group)
    return { minX: bounds.min.x - 5, maxX: bounds.max.x + 5, minZ: bounds.min.z - 5, maxZ: bounds.max.z + 5 }
  })
  const easternTrees = createEasternRowTrees(campusModel, reservedSports)
  assert(easternTrees.userData.layout.trees > 300 && easternTrees.userData.layout.trees < 850, 'Eastern planting should be considerably sparser than the previous 1431-tree grid')
  assert.equal(easternTrees.children.length, 2, 'Uniform pine model should use two instanced batches')
  assert.deepEqual(easternTrees.userData.layout.species, { pine: easternTrees.userData.layout.trees })
  assert.equal(easternTrees.userData.layout.pattern, 'regular-pine-rows')
  assert.equal(easternTrees.userData.layout.style, 'nkustudy-soft-garden')
  assert.equal(easternTrees.userData.layout.height, 9.64, 'Approved theme uses smaller soft garden crowns')
  assert.equal(easternTrees.userData.layout.canopyDiameter, 6.4)
  assert.equal(easternTrees.children[0].geometry.parameters.radiusTop, .38)
  assert.equal(easternTrees.children[0].geometry.parameters.radiusBottom, .56)
  assert.equal(easternTrees.userData.layout.trunkDiameter, 1.12, 'Both eastern and western pine models need thicker stems')
  assert.equal(easternTrees.userData.layout.scope, 'east-only')
  for (const { point, row, column, style } of easternTrees.userData.layout.sites) {
    assert(inTreePolygon(point, EASTERN_TREE_SCOPE), 'No trees may be placed outside the user-selected eastern region')
    assert(!inTreePolygon(point, NORTHEAST_LAKE_RESERVE), 'Northeast lakes and their surrounding wetland must remain tree-free')
    assert(!campusModel.greens.some(area => inTreePolygon(point, area.polygon)), 'Trees are limited to sandy empty plots, not water/green/sports surfaces')
    assert(!reservedSports.some(b => point[0] >= b.minX && point[0] <= b.maxX && point[1] >= b.minZ && point[1] <= b.maxZ), 'Trees must not cover sports grounds')
    const { x, z, yaw, spacing } = EASTERN_TREE_GRID
    const dx = point[0] - x, dz = point[1] - z
    assert(Math.abs(Math.cos(yaw) * dx - Math.sin(yaw) * dz - column * spacing) < .000001)
    assert(Math.abs(Math.sin(yaw) * dx + Math.cos(yaw) * dz - row * spacing) < .000001, 'Pines must form exact straight rows without jitter')
    assert.equal(style, 'pine')
  }
  const treeSites = easternTrees.userData.layout.sites
  const plantedGround = createEasternPlantedGround(campusModel, reservedSports, treeSites)
  assert.equal(plantedGround.material.color.getHex(), 0xb8d0a0, 'Wooded parcels must match the approved reference grass-green palette')
  assert(plantedGround.userData.layout.plantedPatches > 0)
  plantedGround.updateMatrixWorld(true)
  for (const { point: [x, z] } of treeSites) {
    assert(new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)).intersectObject(plantedGround).length > 0, `Every existing pine must remain on a pale-green planted parcel: ${x}, ${z}`)
  }
  for (const [x, z] of [[1200, -1000], [2040, -1100], [1475, -1110], [1905.63, -624.02]]) {
    assert.equal(new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)).intersectObject(plantedGround).length, 0, 'Do not recolor west campus, northeast lake, sports ground or roads')
  }
  plantedGround.geometry.dispose(); plantedGround.material.dispose()
  for (let i = 0; i < treeSites.length; i++) for (let j = i + 1; j < treeSites.length; j++) assert(Math.hypot(treeSites[i].point[0] - treeSites[j].point[0], treeSites[i].point[1] - treeSites[j].point[1]) >= 21.999, 'Keep the wider pine spacing')
  easternTrees.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose() })
  console.log(`Eastern garden rows check passed: ${easternTrees.userData.layout.trees} soft sage crowns, exact 22 m rows; east only, northeast wetland and roads/sports/water reserved.`)
  const roadProfileSource = await readFile(resolve('src', 'road-profile.ts'), 'utf8')
  const roadProfileModule = ts.transpileModule(roadProfileSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const roadProfileUrl = `data:text/javascript;base64,${Buffer.from(roadProfileModule).toString('base64')}`
  const { roadStripPolygons, ROAD_PROFILE } = await import(roadProfileUrl)
  const overlapConvex = (a, b) => [...a.map((p, i) => [p, a[(i + 1) % a.length]]), ...b.map((p, i) => [p, b[(i + 1) % b.length]])].every(([p, q]) => {
    const nx = p[1] - q[1], nz = q[0] - p[0]
    const left = a.map(([x, z]) => x * nx + z * nz), right = b.map(([x, z]) => x * nx + z * nz)
    return Math.min(Math.max(...left), Math.max(...right)) - Math.max(Math.min(...left), Math.min(...right)) > .001
  })
  for (const building of SUPPLEMENTAL_BUILDINGS) for (const volume of building.volumes) {
    for (const road of campusModel.roads.filter(road => road.kind !== 'walkway')) {
      assert(!roadStripPolygons(road, ROAD_PROFILE.edgeScale).some(triangle => overlapConvex(volume.footprint, triangle)), `${building.name} must clear the complete road including its brown border: ${road.id}`)
    }
    for (const previous of originalBuildings) {
      const geometry = new THREE.ShapeGeometry(shapeFrom(previous.footprint))
      const positions = geometry.getAttribute('position'), indices = geometry.getIndex()
      for (let i = 0; i < indices.count; i += 3) {
        const triangle = [0, 1, 2].map(offset => { const index = indices.getX(i + offset); return [positions.getX(index), -positions.getY(index)] })
        assert(!overlapConvex(volume.footprint, triangle), `${building.name} must not overlap existing building ${previous.name}`)
      }
      geometry.dispose()
    }
  }
  const westRowsSource = await readFile(resolve('src', 'west-road-trees.ts'), 'utf8')
  const westRowsModule = ts.transpileModule(westRowsSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
    .replace(/from (['"])\.\/eastern-row-trees\1/g, () => `from ${JSON.stringify(rowsModuleUrl)}`)
    .replace(/from (['"])\.\/road-profile\1/g, () => `from ${JSON.stringify(roadProfileUrl)}`)
  const { createWestRoadTrees, WEST_ROAD_TREE_LAYOUT, TREE_FREE_ROAD_IDS } = await import(`data:text/javascript;base64,${Buffer.from(westRowsModule).toString('base64')}`)
  const westRoadTrees = createWestRoadTrees(campusModel, [], reservedSports)
  assert(westRoadTrees.userData.layout.trees > 100, 'West primary road sides should be planted')
  assert.equal(westRoadTrees.children.length, 2)
  assert.equal(westRoadTrees.userData.layout.trunkDiameter, 1.12)
  assert.equal(westRoadTrees.userData.layout.placement, 'dark-road-border')
  assert.deepEqual(TREE_FREE_ROAD_IDS, ['osm-road-477379218-1'], 'Only the user-designated road north of the central library is tree-free')
  assert(!westRoadTrees.userData.layout.sites.some(site => TREE_FREE_ROAD_IDS.includes(site.roadId)), 'The designated road must have no roadside trees')
  assert(westRoadTrees.userData.layout.sites.some(site => campusModel.roads.find(road => road.id === site.roadId).name === '日新道'), 'Other segments of the same named road must retain their trees')
  assert.equal(westRoadTrees.position.y, ROAD_PROFILE.edgeHeight, 'Tree feet must rest on the raised brown road border')
  const roadSurfaces = campusModel.roads.flatMap(road => roadStripPolygons(road, ROAD_PROFILE.surfaceScale))
  const roadEdges = new Map(campusModel.roads.map(road => [road.id, roadStripPolygons(road, ROAD_PROFILE.edgeScale)]))
  assert(westRoadTrees.userData.layout.sites.some(site => site.side === -1) && westRoadTrees.userData.layout.sites.some(site => site.side === 1), 'Plant both sides where there is room')
  for (const { point: [x, z], roadId } of westRoadTrees.userData.layout.sites) {
    assert(x < WEST_ROAD_TREE_LAYOUT.maxX, 'West road planting may not expand into the eastern district')
    assert.equal(campusModel.roads.find(road => road.id === roadId).kind, 'primary')
    assert(roadEdges.get(roadId).some(polygon => inTreePolygon([x, z], polygon)), 'Every roadside trunk must sit on the actual rendered road edging, including bends')
    assert(!roadSurfaces.some(polygon => inTreePolygon([x, z], polygon)), 'Trunks must not sit on any beige road surface or intersection')
    // 检查树干截面的全部圆周，而不只是中心落点。
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const rim = [x + Math.cos(angle) * .56, z + Math.sin(angle) * .56]
      assert(roadEdges.get(roadId).some(polygon => inTreePolygon(rim, polygon)), 'The entire trunk base must remain inside the road edging')
      assert(!roadSurfaces.some(polygon => inTreePolygon(rim, polygon)), 'The trunk base must clear all road surfaces')
    }
    for (const building of campusModel.buildings) {
      const pad = WEST_ROAD_TREE_LAYOUT.buildingClearance
      const xs = building.footprint.map(p => p[0]), zs = building.footprint.map(p => p[1])
      assert(!(x >= Math.min(...xs) - pad && x <= Math.max(...xs) + pad && z >= Math.min(...zs) - pad && z <= Math.max(...zs) + pad), 'Tree canopy must clear the complete building footprint')
    }
  }
  // 模拟比数据轮廓更宽的实际模型，证明外伸体量能够否决原本有效的种植位置。
  const firstWestTree = westRoadTrees.userData.layout.sites[0].point
  const overhang = { minX: firstWestTree[0] - 10, maxX: firstWestTree[0] + 10, minZ: firstWestTree[1] - 10, maxZ: firstWestTree[1] + 10 }
  const protectedWestTrees = createWestRoadTrees(campusModel, [overhang], reservedSports)
  assert(protectedWestTrees.userData.layout.skipped.buildings > westRoadTrees.userData.layout.skipped.buildings)
  assert(!protectedWestTrees.userData.layout.sites.some(({ point: [x, z] }) => x >= overhang.minX - 5.1 && x <= overhang.maxX + 5.1 && z >= overhang.minZ - 5.1 && z <= overhang.maxZ + 5.1), 'Rendered-model overhangs must remain tree-free')
  for (const group of [westRoadTrees, protectedWestTrees]) group.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose() })
  console.log(`West road trees check passed: ${westRoadTrees.userData.layout.trees} pines along both sides of primary roads; footprint/overhang, road, water and sports clearance verified.`)
  const teachingModule = ts.transpileModule(teachingSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
  const { createWestPublicTeachingLandmark, WEST_PUBLIC_TEACHING_IDS, WEST_TEACHING_FRAME } = await import(`data:text/javascript;base64,${Buffer.from(teachingModule).toString('base64')}`)
  assert.equal(WEST_PUBLIC_TEACHING_IDS.length, 6)
  for (const eastId of ['osm-building-1456224124', 'osm-building-1456224123', 'osm-building-1456224121', 'osm-building-1456224120']) {
    assert(!WEST_PUBLIC_TEACHING_IDS.includes(eastId), 'East teaching buildings must remain unchanged')
  }
  const libraryBrick = new THREE.MeshLambertMaterial({ color: 0x9c6249 })
  const teachingGroups = WEST_PUBLIC_TEACHING_IDS.map(id => {
    const building = campusModel.buildings.find(item => item.id === id)
    assert(building, `Missing west teaching source: ${id}`)
    const group = createWestPublicTeachingLandmark(building, libraryBrick)
    assert.equal(group.userData.layout.sourceId, id)
    assert.equal(group.userData.layout.side, 'west')
    assert.equal(group.position.x, WEST_TEACHING_FRAME.x)
    assert.equal(group.position.z, WEST_TEACHING_FRAME.z)
    assert.equal(group.rotation.y, WEST_TEACHING_FRAME.yaw)
    assert(group.children.length <= 13, `${id}: excess draw batches`)
    assert(group.children.some(mesh => mesh.material === libraryBrick), `${id}: library brick must be shared by identity`)
    assert(!group.children.some(mesh => mesh.material.color?.getHex() === 0x7c9256), 'Teaching building bases must no longer use grass green')
    for (const mesh of group.children) {
      const positions = mesh.geometry.getAttribute('position')
      assert(positions.count > 0)
      for (const coordinate of positions.array) assert(Number.isFinite(coordinate), `${id}: invalid geometry`)
    }
    group.updateMatrixWorld(true)
    return group
  })
  assert(teachingGroups.slice(0, 4).every(group => group.userData.layout.windows > 100))
  assert.equal(teachingGroups.reduce((sum, group) => sum + group.userData.layout.passages, 0), 5)
  assert.equal(teachingGroups.reduce((sum, group) => sum + group.userData.layout.eastDetails.teachingFronts, 0), 2)
  assert.equal(teachingGroups.reduce((sum, group) => sum + group.userData.layout.eastDetails.sideJunctions, 0), 2)
  assert.equal(teachingGroups[5].userData.layout.eastDetails.openUpperBridge, true)
  for (const group of teachingGroups) {
    const hole = group.userData.layout.eastDetails.screenHoles.find(h => h.y < 13.0 && h.y > 12.0)
    if (!hole) continue
    const origin = new THREE.Vector3(hole.x + 1, hole.y, hole.z).applyMatrix4(group.matrixWorld)
    const direction = new THREE.Vector3(-1, 0, 0).transformDirection(group.matrixWorld)
    const screenHits = new THREE.Raycaster(origin, direction, 0, 2).intersectObject(group, true)
    assert.equal(screenHits.length, 0, `East brick screen must have real openings: ${group.name}, ${JSON.stringify(hole)}, ${screenHits.map(hit => hit.distance).join(',')}`)
  }
  const bridgeOrigin = new THREE.Vector3(70, 16, 0).applyMatrix4(teachingGroups[5].matrixWorld)
  const bridgeDirection = new THREE.Vector3(-1, 0, 0).transformDirection(teachingGroups[5].matrixWorld)
  assert.equal(new THREE.Raycaster(bridgeOrigin, bridgeDirection, 0, 32).intersectObjects(teachingGroups, true).length, 0, 'Upper central bridge opening must not be filled with glazing')
  // 沿穿堂的实际通行方向投射水平射线；任何实墙、楼板或窗玻璃封堵均会失败。
  for (const [x, z, distance] of [[-85, 68.5, 45], [14, 68.5, 35], [-85, -61, 45], [10, -73.5, 35], [40, 0, 30]]) {
    const origin = new THREE.Vector3(x, 2.5, z).applyMatrix4(teachingGroups[0].matrixWorld)
    const direction = new THREE.Vector3(1, 0, 0).transformDirection(teachingGroups[0].matrixWorld)
    const ray = new THREE.Raycaster(origin, direction, 0, distance)
    assert.equal(ray.intersectObjects(teachingGroups, true).length, 0, `West teaching passage at z=${z} is blocked`)
  }
  // A/D 内庭和 B/C 中部花园必须露天，而不是用大体块或屋顶盖住。
  for (const [x, z] of [[-5, 76], [-5, -82], [0, 0]]) {
    const origin = new THREE.Vector3(x, 80, z).applyMatrix4(teachingGroups[0].matrixWorld)
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 70)
    assert.equal(ray.intersectObjects(teachingGroups, true).length, 0, 'West teaching courtyard was roofed over')
  }
  const teachingMaterials = new Set()
  for (const group of teachingGroups) for (const mesh of group.children) {
    mesh.geometry.dispose()
    teachingMaterials.add(mesh.material)
  }
  teachingMaterials.forEach(material => material.dispose())
  console.log('West public teaching check passed: A/B/C/D + 2 connectors, shared library brown brick, 5 open passages, 3 open-air gardens; west-only ID scope preserved.')
  const labSource = await readFile(resolve('src', 'laboratory-buildings.ts'), 'utf8')
  const labModule = ts.transpileModule(labSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
    .replace(/from (['"])\.\/public-teaching\1/g, () => `from ${JSON.stringify(`data:text/javascript;base64,${Buffer.from(teachingModule).toString('base64')}`)}`)
  const { createEastLaboratoryLandmark, EAST_LABORATORY_IDS, EAST_LABORATORY_FRAME } = await import(`data:text/javascript;base64,${Buffer.from(labModule).toString('base64')}`)
  const laboratoryBrick = new THREE.MeshLambertMaterial({ color: 0x9c6249 })
  assert.equal(EAST_LABORATORY_IDS.length, 6)
  assert(EAST_LABORATORY_IDS.every(id => !WEST_PUBLIC_TEACHING_IDS.includes(id)), 'East and west source IDs must be disjoint')
  const labGroups = EAST_LABORATORY_IDS.map((id, index) => {
    const source = campusModel.buildings.find(building => building.id === id)
    assert(source, `Laboratory source missing: ${id}`)
    if (index < 4) {
      assert.equal(source.name, `实验楼${'ABCD'[index]}`)
      assert(source.aliases.includes(source.name), `${id}: new laboratory name missing from search`)
      assert(source.aliases.includes(`${'ABCD'[index]}区`), `${id}: original search alias must be retained`)
    }
    const group = createEastLaboratoryLandmark(source, laboratoryBrick)
    assert.equal(group.userData.layout.sourceId, id)
    assert.equal(group.userData.layout.name, source.name)
    assert.equal(group.userData.layout.side, 'east')
    assert.equal(group.userData.layout.courtyardSurface, 'paved')
    assert.equal(group.scale.x, -1)
    assert.equal(group.rotation.y, EAST_LABORATORY_FRAME.yaw)
    assert(group.children.length <= 17, `${id}: excessive laboratory batches`)
    assert(group.children.some(mesh => mesh.material === laboratoryBrick), `${id}: library brown brick material must be reused`)
    for (const mesh of group.children) {
      const positions = mesh.geometry.getAttribute('position')
      assert(positions.count > 0)
      for (const coordinate of positions.array) assert(Number.isFinite(coordinate), `${id}: invalid laboratory geometry`)
    }
    group.updateMatrixWorld(true)
    return group
  })
  const labCorner = new THREE.Vector3(35.90, 0, 108.53).applyMatrix4(labGroups[0].matrixWorld)
  const labACorner = campusModel.buildings.find(building => building.id === EAST_LABORATORY_IDS[0]).footprint[0]
  assert(Math.hypot(labCorner.x - labACorner[0], labCorner.z - labACorner[1]) < .25, 'Laboratory A must remain at its original footprint anchor')
  assert(labGroups.slice(0, 4).every(group => group.userData.layout.roofServiceRuns >= 7), 'All laboratory wings need reference-derived rooftop equipment')
  for (const [x, z, distance] of [[-85, 68.5, 45], [14, 68.5, 35], [-85, -61, 45], [10, -73.5, 35], [40, 0, 30]]) {
    const origin = new THREE.Vector3(x, 2.5, z).applyMatrix4(labGroups[0].matrixWorld)
    const direction = new THREE.Vector3(1, 0, 0).transformDirection(labGroups[0].matrixWorld)
    assert.equal(new THREE.Raycaster(origin, direction, 0, distance).intersectObjects(labGroups, true).length, 0, 'Laboratory underpass is blocked')
  }
  for (const [x, z] of [[-5, 76], [-5, -82], [0, 0]]) {
    const origin = new THREE.Vector3(x, 80, z).applyMatrix4(labGroups[0].matrixWorld)
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 80)
    const hits = ray.intersectObjects(labGroups, true)
    assert(hits.length > 0, 'Laboratory courtyard needs a paved surface')
    assert(hits[0].point.y < 1.6, 'Laboratory courtyards must be open, without grass trees or roofs')
  }
  const labMaterials = new Set()
  for (const group of labGroups) for (const mesh of group.children) {
    mesh.geometry.dispose()
    labMaterials.add(mesh.material)
  }
  labMaterials.forEach(material => material.dispose())
  console.log('East laboratory check passed: 实验楼A/B/C/D + 2 connectors, 3 open paved courts, 5 open passages, roof services and original footprint anchor verified.')
  const frontierSource = await readFile(resolve('src', 'frontier-center.ts'), 'utf8')
  const frontierModule = ts.transpileModule(frontierSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from (['"])(three(?:\/[^'"]+)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
  const { createFrontierCenterLandmark, FRONTIER_CENTER_ID, FRONTIER_CENTER_FRAME } = await import(`data:text/javascript;base64,${Buffer.from(frontierModule).toString('base64')}`)
  const frontierBuilding = campusModel.buildings.find(building => building.id === FRONTIER_CENTER_ID)
  assert(frontierBuilding)
  const frontierBrick = new THREE.MeshLambertMaterial({ color: 0x9c6249 })
  const frontier = createFrontierCenterLandmark(frontierBuilding, frontierBrick)
  assert.equal(frontier.userData.layout.name, '前沿交叉学科中心')
  assert.equal(frontier.rotation.y, FRONTIER_CENTER_FRAME.yaw)
  assert(!frontier.children.some(mesh => mesh.material.color?.getHex() === 0x7d9259), 'Frontier building base must no longer use grass green')
  assert(frontier.children.some(mesh => mesh.material === frontierBrick), 'Frontier center must reuse library brown brick')
  assert(frontier.children.length <= 9, 'Frontier geometry should be batched by material')
  assert(frontier.userData.layout.fins >= 80 && frontier.userData.layout.windows > 180)
  assert(frontier.userData.layout.screens >= 6)
  for (const mesh of frontier.children) {
    const positions = mesh.geometry.getAttribute('position')
    assert(positions.count > 0)
    for (const coordinate of positions.array) assert(Number.isFinite(coordinate), 'Invalid frontier geometry')
  }
  frontier.updateMatrixWorld(true)
  const courtyardRay = new THREE.Raycaster(new THREE.Vector3(10, 60, 23).applyMatrix4(frontier.matrixWorld), new THREE.Vector3(0, -1, 0))
  const courtyardHits = courtyardRay.intersectObject(frontier, true)
  assert(courtyardHits.length && courtyardHits[0].point.y < 1.5, 'Central courtyard must be open all the way to ground')
  assert.equal(courtyardHits[0].object.material.color.getHex(), 0xefebe2, 'Frontier courtyard base must match the surrounding sand ground')
  const gardenRay = new THREE.Raycaster(new THREE.Vector3(10, 60, -20).applyMatrix4(frontier.matrixWorld), new THREE.Vector3(0, -1, 0))
  assert(gardenRay.intersectObject(frontier, true)[0].point.y < 1.5, 'North annex courtyard must remain open')
  const passageOrigin = new THREE.Vector3(35, 2.5, -24).applyMatrix4(frontier.matrixWorld)
  const passageDirection = new THREE.Vector3(0, 0, 1).transformDirection(frontier.matrixWorld)
  assert.equal(new THREE.Raycaster(passageOrigin, passageDirection, 0, 9).intersectObject(frontier, true).length, 0, 'Rear raised annex connection must have an open underpass')
  const terraceOrigin = new THREE.Vector3(-42, 60, 30).applyMatrix4(frontier.matrixWorld)
  const terraceHit = new THREE.Raycaster(terraceOrigin, new THREE.Vector3(0, -1, 0)).intersectObject(frontier, true)[0]
  assert(Math.abs(terraceHit.point.y - 23.08) < .02, 'West podium must have a clear four-storey roof terrace in front of the white crown')
  const porchOrigin = new THREE.Vector3(-33, 60, -20).applyMatrix4(frontier.matrixWorld)
  const porchHit = new THREE.Raycaster(porchOrigin, new THREE.Vector3(0, -1, 0)).intersectObject(frontier, true)[0]
  assert(Math.abs(porchHit.point.y - 11.18) < .02, 'Low north entrance porch must project in front of the tall annex')
  const lawnOrigin = new THREE.Vector3(-45, 60, -20).applyMatrix4(frontier.matrixWorld)
  const forecourtHit = new THREE.Raycaster(lawnOrigin, new THREE.Vector3(0, -1, 0)).intersectObject(frontier, true)[0]
  assert(forecourtHit.point.y < 1.5, 'The western forecourt must remain open')
  assert.equal(forecourtHit.object.material.color.getHex(), 0xefebe2, 'Frontier forecourt base must match the surrounding sand ground')
  const returnWallOrigin = new THREE.Vector3(-43, 19.5, -10).applyMatrix4(frontier.matrixWorld)
  const returnWallDirection = new THREE.Vector3(0, 0, 1).transformDirection(frontier.matrixWorld)
  assert(new THREE.Raycaster(returnWallOrigin, returnWallDirection, 0, 10).intersectObject(frontier, true).length > 0, 'Four-storey west wing needs its north return wall')
  const anchor = new THREE.Vector3(-30.13, 0, -63.8).applyMatrix4(frontier.matrixWorld)
  const original = frontierBuilding.footprint[2]
  assert(Math.hypot(anchor.x - original[0], anchor.z - original[1]) < .1, 'Frontier center footprint anchor moved')
  const frontierMaterials = new Set()
  frontier.children.forEach(mesh => { mesh.geometry.dispose(); frontierMaterials.add(mesh.material) })
  frontierMaterials.forEach(material => material.dispose())
  console.log('Frontier center check passed: brick podium, white finned crown, open central/north courtyards, tapered annex, original anchor and open underpass.')
} catch (error) {
  throw new Error(`Geometry smoke check failed: ${error instanceof Error ? error.message : String(error)}`)
}

console.log(`Geometry smoke check passed: ${diagnostics.buildings} buildings, ${diagnostics.roads} roads, ${diagnostics.areas} landscape areas, ${Math.round(diagnostics.triangles)} triangles.`)
