import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Area, Building, CampusSeed, Point } from './data/jinnan-seed'

const GYM_PITCH_ID = 'osm-area-1328585387'
export const SCIENCE_PITCH_ID = 'osm-area-1328585384'
export const STADIUM_STAND_ID = 'osm-building-1474145904'

export function getGymSportsAreas(areas: Area[]) {
  return areas.filter(area => {
    const id = Number(area.id.replace('osm-area-', ''))
    return id >= 1456224131 && id <= 1456224167 && /^(网球场|篮球场|排球场)$/.test(area.name)
  }).sort((a, b) => Number(a.id.replace('osm-area-', '')) - Number(b.id.replace('osm-area-', '')))
}

export function getScienceCourtAreas(areas: Area[]) {
  return areas.filter(area => {
    const id = Number(area.id.replace('osm-area-', ''))
    return (id >= 1456226521 && id <= 1456226529) || (id >= 1473410506 && id <= 1473410518)
  }).sort((a, b) => a.id.localeCompare(b.id))
}

function bounds(points: Point[], angle: number, center: Point = [0, 0]) {
  const c = Math.cos(angle), s = Math.sin(angle)
  const local = points.map(([x, z]) => [c * (x - center[0]) - s * (z - center[1]), s * (x - center[0]) + c * (z - center[1])])
  return {
    minX: Math.min(...local.map(p => p[0])), maxX: Math.max(...local.map(p => p[0])),
    minZ: Math.min(...local.map(p => p[1])), maxZ: Math.max(...local.map(p => p[1]))
  }
}

function courtFrame(area: Area) {
  const center: Point = [area.polygon.reduce((sum, p) => sum + p[0], 0) / area.polygon.length, area.polygon.reduce((sum, p) => sum + p[1], 0) / area.polygon.length]
  const a = area.polygon[0], b = area.polygon[1]
  const angle = Math.atan2(-(b[1] - a[1]), b[0] - a[0])
  const local = bounds(area.polygon, angle, center)
  return { center, angle, width: local.maxX - local.minX, length: local.maxZ - local.minZ }
}

function box(parent: THREE.Group, material: THREE.Material, width: number, height: number, length: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material)
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

function shape(points: Point[]) {
  const result = new THREE.Shape()
  points.forEach(([x, z], i) => i ? result.lineTo(x, -z) : result.moveTo(x, -z))
  result.closePath()
  return result
}

function surface(parent: THREE.Group, outline: THREE.Shape, material: THREE.Material, y: number) {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(outline), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = y
  parent.add(mesh)
}

// 水平细条使用实际宽度，不依赖浏览器不支持的粗线宽。
function stroke(parent: THREE.Group, material: THREE.Material, points: Point[], width = .18, y = .76, closed = false) {
  const vertices: number[] = []
  for (let i = 0; i < points.length - (closed ? 0 : 1); i += 1) {
    const a = points[i], b = points[(i + 1) % points.length]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length < .00001) continue
    const dx = -(b[1] - a[1]) / length * width / 2, dz = (b[0] - a[0]) / length * width / 2
    const p = [a[0] + dx, y, a[1] + dz], q = [a[0] - dx, y, a[1] - dz]
    const r = [b[0] + dx, y, b[1] + dz], s = [b[0] - dx, y, b[1] - dz]
    vertices.push(...p, ...r, ...q, ...q, ...r, ...s)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  parent.add(new THREE.Mesh(geometry, material))
}

function rectangle(parent: THREE.Group, material: THREE.Material, width: number, length: number, x = 0, z = 0) {
  stroke(parent, material, [[x - width / 2, z - length / 2], [x + width / 2, z - length / 2], [x + width / 2, z + length / 2], [x - width / 2, z + length / 2]], .18, .76, true)
}

function circle(parent: THREE.Group, material: THREE.Material, radius: number, x = 0, z = 0, width = .18) {
  const points = Array.from({ length: 64 }, (_, i) => [x + Math.cos(i * Math.PI / 32) * radius, z + Math.sin(i * Math.PI / 32) * radius] as Point)
  stroke(parent, material, points, width, .76, true)
}

function consolidate(group: THREE.Group) {
  group.updateMatrixWorld(true)
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const inverse = group.matrixWorld.clone().invert()
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return
    // 统一 position / normal 属性，场线与盒状设备也可以放进同一批次。
    let geometry = object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld))
    if (geometry.index) { const nonIndexed = geometry.toNonIndexed(); geometry.dispose(); geometry = nonIndexed }
    for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(key)) geometry.deleteAttribute(key)
    const batch = batches.get(object.material) ?? []
    batch.push(geometry)
    batches.set(object.material, batch)
    object.geometry.dispose()
  })
  group.clear()
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false)
    geometries.forEach(geometry => geometry.dispose())
    if (!merged) throw new Error('Sports ground geometry merge failed')
    group.add(new THREE.Mesh(merged, material))
  }
}

function createSportsMaterials() {
  const material = (color: number) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
  return {
    blue: material(0x48a9ba), red: material(0x993f38), court: material(0x627d43),
    basketball: material(0x526543), stripe: material(0x59763d), line: material(0xf8f5df),
    fence: new THREE.MeshLambertMaterial({ color: 0x687368 }), net: material(0x7d8a84), paving: material(0xd8d1bc)
  }
}

function createCourtBlock(plots: Area[], color: THREE.Material, paving: THREE.Material, marginX: number, marginZ: number) {
  if (!plots.length) throw new Error('Court block has no plots')
  const angle = courtFrame(plots[0]).angle
  const frame = bounds(plots.flatMap(area => area.polygon), angle)
  const c = Math.cos(angle), s = Math.sin(angle)
  const x = (frame.minX + frame.maxX) / 2, z = (frame.minZ + frame.maxZ) / 2
  const block = new THREE.Group()
  block.position.set(c * x + s * z, 0, -s * x + c * z)
  block.rotation.y = angle
  const width = frame.maxX - frame.minX + marginX * 2, length = frame.maxZ - frame.minZ + marginZ * 2
  box(block, paving, width + .5, .08, length + .5, 0, .61, 0)
  box(block, color, width, .06, length, 0, .68, 0)
  block.userData.dimensions = { width, length }
  return block
}

function createCourt(area: Area, m: ReturnType<typeof createSportsMaterials>, science = false) {
  const frame = courtFrame(area)
  const w = frame.width * (science && area.name === '网球场' ? .80 : 1)
  const d = frame.length * (science && area.name === '网球场' ? .88 : 1)
  const court = new THREE.Group()
  court.position.set(frame.center[0], 0, frame.center[1])
  court.rotation.y = frame.angle
  box(court, area.name === '排球场' ? (science ? m.basketball : m.red) : area.name === '篮球场' ? m.basketball : m.court, w, .035, d, 0, .735, 0)
  rectangle(court, m.line, w, d)
  stroke(court, m.line, [[-w / 2, 0], [w / 2, 0]])
  if (area.name === '网球场') {
    for (const x of [-w * .375, w * .375]) stroke(court, m.line, [[x, -d / 2], [x, d / 2]])
    for (const z of [-d * .27, d * .27]) stroke(court, m.line, [[-w * .375, z], [w * .375, z]])
    stroke(court, m.line, [[0, -d * .27], [0, d * .27]])
  } else if (area.name === '排球场') {
    for (const z of [-d / 6, d / 6]) stroke(court, m.line, [[-w / 2, z], [w / 2, z]])
  } else {
    circle(court, m.line, w * .12)
    for (const sign of [-1, 1]) {
      const basketZ = sign * d * .44
      if (science) {
        const keyZ = sign * d * .40
        surface(court, shape([[-w * .16, keyZ - d * .10], [w * .16, keyZ - d * .10], [w * .16, keyZ + d * .10], [-w * .16, keyZ + d * .10]]), m.red, .754)
      }
      rectangle(court, m.line, w * .32, d * .20, 0, sign * d * .40)
      circle(court, m.line, w * .12, 0, sign * d * .30)
      const radius = w * .41
      const arc = Array.from({ length: 49 }, (_, i) => [Math.cos(i * Math.PI / 48) * radius, sign * (d * .44 - Math.sin(i * Math.PI / 48) * radius)] as Point)
      stroke(court, m.line, arc)
      for (const side of [-1, 1]) stroke(court, m.line, [[side * radius, basketZ], [side * radius, sign * d / 2]])
      box(court, m.fence, .10, 3.10, .10, 0, 2.3, sign * (d / 2 + .65))
      box(court, m.fence, .10, .12, d * .06 + .65, 0, 3.65, sign * (d * .47 + .325))
      box(court, m.line, 1.75, 1.0, .10, 0, 3.65, basketZ)
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(.23, .04, 5, 16), m.red)
      hoop.rotation.x = Math.PI / 2
      hoop.position.set(0, 3.25, basketZ - sign * .28)
      court.add(hoop)
    }
  }
  if (area.name !== '篮球场') {
    const height = area.name === '网球场' ? 1.05 : 2.25
    for (const x of [-w / 2 - .35, w / 2 + .35]) box(court, m.fence, .08, height, .08, x, .74 + height / 2, 0)
    box(court, m.net, w + .5, .025, .08, 0, .74 + height, 0)
    for (let i = 0; i < 8; i += 1) box(court, m.net, .025, height * .72, .035, -w / 2 + w * i / 7, .74 + height * .6, 0)
  }
  return court
}

export function createGymSportsGrounds(model: CampusSeed) {
  const group = new THREE.Group()
  group.name = '体育馆两侧运动场'
  const areas = getGymSportsAreas(model.greens)
  const m = createSportsMaterials()
  const tennis = areas.filter(area => area.name === '网球场')
  const volleyball = areas.filter(area => area.name === '排球场')
  const basketball = areas.filter(area => area.name === '篮球场')
  group.userData.layout = { tennis: tennis.length, basketball: basketball.length, volleyball: volleyball.length, football: 1, lanes: 8, tennisRows: [4, 4, 4], basketballRows: [4, 4, 4], volleyballRows: [6, 5] }

  const addCourtBlock = (plots: Area[], color: THREE.Material, marginX: number, marginZ: number) => {
    if (plots.length) group.add(createCourtBlock(plots, color, m.paving, marginX, marginZ))
  }
  addCourtBlock(tennis.slice(0, 4), m.blue, 5, 4.7)
  addCourtBlock(tennis.slice(4), m.blue, 5, 4.7)
  addCourtBlock(volleyball.slice(0, 6), m.red, 4, 1.4)
  addCourtBlock(volleyball.slice(6), m.red, 4, 1.4)
  addCourtBlock(basketball, m.red, 2.4, 2.2)

  for (const area of areas) group.add(createCourt(area, m))

  const pitch = model.greens.find(area => area.id === GYM_PITCH_ID)
  if (pitch) group.add(createAthleticsGround(pitch, m))
  consolidate(group)
  return group
}

// 两个操场共用场线和设备，但理科操场独立设置外场边界、直道和弯道比例。
function createAthleticsGround(pitch: Area, m: ReturnType<typeof createSportsMaterials>, science = false) {
  const frame = courtFrame(pitch), w = frame.width, d = frame.length
  const stadium = new THREE.Group()
  stadium.position.set(frame.center[0], 0, frame.center[1])
  stadium.rotation.y = frame.angle
  // 理科参考图为 4 道环道、6 道延长直道，长轴比例也与体育馆操场不同。
  const innerR = w / 2 + 3.0, laneWidth = science ? 1.55 : 1.22, straight = d * (science ? .84 : .87)
  const ringLanes = science ? 4 : 8, sprintLanes = science ? 6 : 8
  const capsule = (r: number): Point[] => [
    ...Array.from({ length: 49 }, (_, i) => [Math.cos(i * Math.PI / 48) * r, straight / 2 + Math.sin(i * Math.PI / 48) * r] as Point),
    ...Array.from({ length: 49 }, (_, i) => [Math.cos(Math.PI + i * Math.PI / 48) * r, -straight / 2 + Math.sin(Math.PI + i * Math.PI / 48) * r] as Point)
  ]
  surface(stadium, shape(capsule(innerR + laneWidth * ringLanes + 1.4)), m.paving, .64)
  surface(stadium, shape(capsule(innerR + laneWidth * ringLanes)), m.red, .70)
  surface(stadium, shape(capsule(innerR)), m.red, .735)
  if (science) {
    // 参考图的两侧短跑直道延伸至弯道区外，不能只画成椭圆的两条切线。
    const extension = d * 1.26
    for (const sign of [-1, 1]) {
      box(stadium, m.red, laneWidth * sprintLanes, .012, extension, sign * (innerR + laneWidth * sprintLanes / 2), .709, 0)
      for (let lane = 0; lane <= sprintLanes; lane += 1) stroke(stadium, m.line, [[sign * (innerR + laneWidth * lane), -extension / 2], [sign * (innerR + laneWidth * lane), extension / 2]], .14, .79)
      stroke(stadium, m.line, [[sign * innerR, -extension / 2], [sign * (innerR + laneWidth * sprintLanes), -extension / 2]], .18, .79)
      stroke(stadium, m.line, [[sign * innerR, extension / 2], [sign * (innerR + laneWidth * sprintLanes), extension / 2]], .18, .79)
    }
  }
  box(stadium, m.court, w + 2, .015, d + 4, 0, .738, 0)
  // 参考图中的南北半圆区保留红色运动地坪，而非把整片内场铺成草地。
  for (const sign of [-1, 1]) surface(stadium, shape([[sign * w * .39, -d * .56], [sign * w * .07, -d * .56], [sign * w * .16, -d * .72]]), m.court, .747)
  const throwingCenter: Point = [-w * .24, d * .65]
  surface(stadium, shape(Array.from({ length: 48 }, (_, i) => [throwingCenter[0] + Math.cos(i * Math.PI / 24) * 4.2, throwingCenter[1] + Math.sin(i * Math.PI / 24) * 4.2] as Point)), m.paving, .747)
  circle(stadium, m.net, 4.2, ...throwingCenter, .22)
  box(stadium, m.paving, 8, .18, 6, 0, .83, d * .67)
  for (let lane = 0; lane <= ringLanes; lane += 1) stroke(stadium, m.line, capsule(innerR + lane * laneWidth), .14, .77, true)
  for (let lane = 0; lane < ringLanes; lane += 1) {
    const r = innerR + (lane + .5) * laneWidth
    const angle = .15 + lane * .045
    stroke(stadium, m.line, [[Math.cos(angle) * (r - laneWidth / 2), straight / 2 + Math.sin(angle) * (r - laneWidth / 2)], [Math.cos(angle) * (r + laneWidth / 2), straight / 2 + Math.sin(angle) * (r + laneWidth / 2)]], .18, .78)
  }
  stroke(stadium, m.line, [[innerR, -straight * .30], [innerR + laneWidth * sprintLanes, -straight * .30]], .24, .78)
  for (let stripe = 0; stripe < 14; stripe += 1) if (stripe % 2 === 0) box(stadium, m.stripe, w, .018, d / 14, 0, .745, -d / 2 + d * (stripe + .5) / 14)
  rectangle(stadium, m.line, w, d)
  stroke(stadium, m.line, [[-w / 2, 0], [w / 2, 0]])
  circle(stadium, m.line, w * .1365)
  for (const sign of [-1, 1]) {
    rectangle(stadium, m.line, w * .60, d * .157, 0, sign * d * (.5 - .157 / 2))
    rectangle(stadium, m.line, w * .273, d * .0524, 0, sign * d * (.5 - .0524 / 2))
    const radius = w * .1365, mark = d * .395
    const theta = Math.asin(Math.min(.9, d * (.157 - .105) / radius))
    const arc = Array.from({ length: 40 }, (_, i) => [Math.cos(theta + (Math.PI - theta * 2) * i / 39) * radius, sign * (mark - Math.sin(theta + (Math.PI - theta * 2) * i / 39) * radius)] as Point)
    stroke(stadium, m.line, arc)
    circle(stadium, m.line, .25, 0, sign * mark, .25)
    // 球门立柱、横梁和后框，保留通透的门内区域。
    for (const x of [-w * .0546, w * .0546]) {
      box(stadium, m.line, .12, 2.44, .12, x, 1.96, sign * d / 2)
      box(stadium, m.net, .08, 1.6, .08, x, 1.54, sign * (d / 2 + 1.8))
      box(stadium, m.net, .06, .06, 1.8, x, .82, sign * (d / 2 + .9))
    }
    box(stadium, m.line, w * .1092, .12, .12, 0, 3.18, sign * d / 2)
    box(stadium, m.net, w * .1092, .06, .06, 0, 2.34, sign * (d / 2 + 1.8))
    for (let i = 0; i < 10; i += 1) box(stadium, m.net, .018, 1.6, .03, -w * .0546 + w * .1092 * i / 9, 1.54, sign * (d / 2 + 1.8))
  }
  // 东侧直道外的蓝色辅助区，与西侧看台分开。
  const auxiliaryLength = science ? d * 1.30 : straight + innerR * .6
  const auxiliaryZ = science ? d * .035 : 0
  box(stadium, m.blue, 5.2, .08, auxiliaryLength, innerR + laneWidth * sprintLanes + 4.0, .70, auxiliaryZ)
  box(stadium, m.red, 2.0, .09, science ? auxiliaryLength * .76 : straight * .85, innerR + laneWidth * sprintLanes + 2.4, .74, auxiliaryZ)
  if (science) box(stadium, m.paving, 4.2, .10, 6.5, innerR + laneWidth * sprintLanes + 4.0, .81, auxiliaryZ + auxiliaryLength * .31)
  return stadium
}

export function createScienceSportsGrounds(model: CampusSeed) {
  const pitch = model.greens.find(area => area.id === SCIENCE_PITCH_ID)
  if (!pitch) throw new Error('Science sports ground pitch missing')
  const m = createSportsMaterials()
  m.blue.color.setHex(0x3e348c)
  const group = createAthleticsGround(pitch, m, true)
  group.name = '理科区操场'
  const frame = courtFrame(pitch)
  const innerR = frame.width / 2 + 3, outerR = innerR + 1.55 * 4
  const trackLength = frame.length * .84 + outerR * 2
  // 仅保留跑道及运动设施，不再铺设外围长方形草地和底板。
  group.userData.layout = { football: 1, lanes: 4, sprintLanes: 6, goals: 2, stand: false, outerLawn: false, pitchId: SCIENCE_PITCH_ID, pitchWidth: frame.width, pitchLength: frame.length, trackLength, auxiliaryLength: frame.length * 1.30 }
  consolidate(group)
  return group
}

function addCourtFence(block: THREE.Group, height: number, pole: THREE.Material, wire: THREE.Material) {
  const { width, length } = block.userData.dimensions as { width: number, length: number }
  // 细网丝保持通透；每个分区只围一圈，并在东侧留出入口。
  const vertices: number[] = []
  const segment = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const span = Math.hypot(bx - ax, by - ay, bz - az)
    if (span < .0001) return
    const vertical = Math.abs(by - ay) > .001, offset = .018
    const dx = vertical ? offset : -(bz - az) / span * offset
    const dy = vertical ? 0 : offset
    const dz = vertical ? 0 : (bx - ax) / span * offset
    const a = [ax + dx, ay + dy, az + dz], b = [ax - dx, ay - dy, az - dz]
    const c = [bx + dx, by + dy, bz + dz], d = [bx - dx, by - dy, bz - dz]
    vertices.push(...a, ...c, ...b, ...b, ...c, ...d)
  }
  const edges = [[-width / 2, -length / 2, width / 2, -length / 2], [width / 2, -length / 2, width / 2, length / 2], [width / 2, length / 2, -width / 2, length / 2], [-width / 2, length / 2, -width / 2, -length / 2]]
  for (let edge = 0; edge < edges.length; edge++) {
    const [ax, az, bx, bz] = edges[edge], distance = Math.hypot(bx - ax, bz - az)
    const entranceStart = edge === 1 ? distance * .5 - 1.2 : -1
    const entranceEnd = edge === 1 ? distance * .5 + 1.2 : -1
    const pointAt = (t: number): Point => [ax + (bx - ax) * t / distance, az + (bz - az) * t / distance]
    for (let t = 0; t <= distance; t += .8) {
      if (t > entranceStart && t < entranceEnd) continue
      const [x, z] = pointAt(t)
      segment(x, .76, z, x, .76 + height, z)
    }
    const spans = edge === 1 ? [[0, entranceStart], [entranceEnd, distance]] : [[0, distance]]
    for (const [start, end] of spans) {
      for (let y = .95; y < .76 + height; y += .4) {
        const [aX, aZ] = pointAt(start), [bX, bZ] = pointAt(end)
        segment(aX, y, aZ, bX, y, bZ)
      }
      const [aX, aZ] = pointAt(start), [bX, bZ] = pointAt(end)
      box(block, pole, Math.abs(bX - aX) + .07, .055, Math.abs(bZ - aZ) + .07, (aX + bX) / 2, .76 + height, (aZ + bZ) / 2)
      const sections = Math.ceil((end - start) / 4)
      for (let i = 0; i <= sections; i++) {
        const [x, z] = pointAt(start + (end - start) * i / sections)
        box(block, pole, .075, height, .075, x, .76 + height / 2, z)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  block.add(new THREE.Mesh(geometry, wire))
}

export function createScienceCourtGrounds(model: CampusSeed) {
  const group = new THREE.Group()
  group.name = '理科操场东侧球场'
  const areas = getScienceCourtAreas(model.greens)
  const tennis = areas.filter(area => area.name === '网球场')
  const basketball = areas.filter(area => area.name === '篮球场')
  const volleyball = areas.filter(area => area.name === '排球场')
  if (tennis.length !== 5 || basketball.length !== 9 || volleyball.length !== 8) throw new Error('Science court source layout changed')
  const m = createSportsMaterials()
  m.blue.color.setHex(0x638074)
  m.court.color.setHex(0x62718b)
  m.red.color.setHex(0xaa7965)
  m.basketball.color.setHex(0x657b6d)
  m.line.color.setHex(0xece8d9)
  m.fence.color.setHex(0x38534b)
  const wire = new THREE.MeshBasicMaterial({ color: 0x456358, transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide })
  const blocks = [
    { name: '北侧三联网球区', height: 3.2, plots: tennis.filter(area => !['osm-area-1473410515', 'osm-area-1473410516'].includes(area.id)) },
    { name: '南侧双联网球区', height: 3.2, plots: tennis.filter(area => ['osm-area-1473410515', 'osm-area-1473410516'].includes(area.id)) },
    { name: '三乘三篮球区', height: 2.4, plots: basketball },
    { name: '两排四列排球区', height: 1.8, plots: volleyball }
  ]
  for (const block of blocks) {
    const isTennis = block.name.includes('网球')
    const enclosure = createCourtBlock(block.plots, isTennis ? m.blue : m.red, m.paving, isTennis ? 2.2 : 1.4, isTennis ? 3.0 : 1.7)
    enclosure.name = block.name
    addCourtFence(enclosure, block.height, m.fence, wire)
    group.add(enclosure)
  }
  for (const area of areas) group.add(createCourt(area, m, true))
  group.userData.layout = { tennis: tennis.length, basketball: basketball.length, volleyball: volleyball.length, tennisRows: [3, 2], basketballRows: [3, 3, 3], volleyballRows: [4, 4], hoops: basketball.length * 2, nets: tennis.length + volleyball.length, enclosures: blocks.length }
  group.userData.courts = areas.map(area => ({ id: area.id, sport: area.name, center: courtFrame(area).center }))
  consolidate(group)
  return group
}

export function createStadiumStand(building: Building, areas: Area[], brick: THREE.Material = new THREE.MeshLambertMaterial({ color: 0x9c6249 })) {
  const pitch = areas.find(area => area.id === GYM_PITCH_ID)
  const angle = pitch ? courtFrame(pitch).angle : 0
  const center: Point = [building.footprint.reduce((sum, p) => sum + p[0], 0) / building.footprint.length, building.footprint.reduce((sum, p) => sum + p[1], 0) / building.footprint.length]
  const frame = bounds(building.footprint, angle, center)
  const width = frame.maxX - frame.minX, length = (frame.maxZ - frame.minZ) * 1.17
  const group = new THREE.Group()
  group.name = '文科主体育场主席台'
  group.position.set(center[0], 1.22, center[1])
  group.rotation.y = angle
  const stone = new THREE.MeshLambertMaterial({ color: 0xaeb1a9 })
  const paving = new THREE.MeshLambertMaterial({ color: 0xd8cbb2 })
  const roof = new THREE.MeshLambertMaterial({ color: 0x795c50 })
  const underside = new THREE.MeshLambertMaterial({ color: 0x4b4039 })
  const blue = new THREE.MeshLambertMaterial({ color: 0x353f91 })
  const teal = new THREE.MeshLambertMaterial({ color: 0x176b70 })
  const red = new THREE.MeshLambertMaterial({ color: 0x894837 })
  const glass = new THREE.MeshLambertMaterial({ color: 0x222c30 })
  const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x6e7776 })
  const white = new THREE.MeshLambertMaterial({ color: 0xe0dbce })
  const lights = new THREE.MeshBasicMaterial({ color: 0xc5ae79 })
  const rearX = -width * .5, frontX = width * .40
  const top = 11.7, platform = 1.8, rowDepth = width * .78 / 20, rowRise = .47
  const seatZones = [
    { lo: -length * .475, hi: -length * .405, rows: 20, material: blue, color: 'blue' },
    { lo: -length * .385, hi: -length * .285, rows: 20, material: teal, color: 'teal' },
    { lo: -length * .265, hi: -length * .070, rows: 12, material: red, color: 'red' },
    { lo: length * .070, hi: length * .265, rows: 12, material: red, color: 'red' },
    { lo: length * .285, hi: length * .385, rows: 20, material: teal, color: 'teal' },
    { lo: length * .405, hi: length * .475, rows: 20, material: blue, color: 'blue' },
  ]
  box(group, paving, width + 6, .20, length + 8, 0, .12, 0)
  // 实体阶梯从场地一侧升向西侧背墙；分区间留灰色通行台阶。
  for (let row = 0; row < 20; row++) {
    const x = frontX - rowDepth * (row + .5), y = platform + (row + 1) * rowRise
    box(group, stone, rowDepth, y - .28, length, x, .28 + (y - .28) / 2, 0)
    for (const zone of seatZones) {
      if (row >= zone.rows) continue
      box(group, zone.material, rowDepth * .76, .15, zone.hi - zone.lo, x - rowDepth * .05, y + .075, (zone.lo + zone.hi) / 2)
      // 椅面与窄靠背均按整排合并，远看保留阶梯节奏而非一整块色面。
      box(group, zone.material, .12, .24, zone.hi - zone.lo, x - rowDepth * .40, y + .20, (zone.lo + zone.hi) / 2)
    }
  }
  // 中段最高八排替换成水平廊台，补齐参考正视图缺损处。
  box(group, stone, width * .32, .30, length * .53, rearX + width * .19, top + .02, 0)
  for (const sign of [-1, 1]) {
    const endProfile = new THREE.Shape()
    endProfile.moveTo(rearX, .25)
    endProfile.lineTo(frontX + rowDepth, .25)
    endProfile.lineTo(frontX + rowDepth, platform)
    endProfile.lineTo(rearX, top)
    endProfile.closePath()
    const endWall = new THREE.ExtrudeGeometry(endProfile, { depth: .64, bevelEnabled: false })
    endWall.translate(0, 0, sign > 0 ? length / 2 : -length / 2 - .64)
    group.add(new THREE.Mesh(endWall, brick))
    for (let rib = 0; rib < 6; rib++) {
      const x = rearX + .35 + rib * width * .043
      const h = top - (x - rearX) / (frontX + rowDepth - rearX) * (top - platform)
      box(group, brick, .30, h, 1.15, x, h / 2, sign * (length / 2 + .32))
    }
    for (let row = 0; row < 20; row++) {
      const x = frontX - rowDepth * (row + .5), y = platform + (row + 1) * rowRise
      box(group, brick, rowDepth + .07, .52, .52, x, y + .22, sign * (length / 2 + .22))
    }
    // 两侧轮廓以砖阶顺着观众席升高，底部外绕灰色通道。
    box(group, stone, width, .22, 3.1, 0, .36, sign * (length / 2 + 2.2))
    for (let tier = 0; tier < 11; tier++) box(group, brick, width / 11, .45 + tier * .07, .35, frontX - tier * width / 11, .65 + tier * .035, sign * (length / 2 + 3.6))
  }
  // 背面两层高砖窗墙，中央突出门厅，窗口采用真实退进而非白框。
  const rearWindows = 14, rearPitch = (length - 5) / rearWindows
  box(group, brick, .62, 1.1, length, rearX, .85, 0)
  box(group, brick, .62, 1.25, length, rearX, 5.45, 0)
  box(group, brick, .62, 1.5, length, rearX, 10.95, 0)
  for (let col = 0; col < rearWindows; col++) {
    const z = -length / 2 + 2.5 + (col + .5) * rearPitch, opening = rearPitch * .60
    for (const [y0, y1] of [[1.4, 4.82], [6.1, 10.2]]) {
      box(group, glass, .09, y1 - y0, opening, rearX + .13, (y0 + y1) / 2, z)
      for (let dz = -opening / 2 + 1.1; dz < opening / 2; dz += 1.1) box(group, frameMaterial, .11, y1 - y0, .065, rearX + .04, (y0 + y1) / 2, z + dz)
      box(group, frameMaterial, .11, .08, opening, rearX + .04, (y0 + y1) / 2, z)
      box(group, brick, .62, y1 - y0, rearPitch - opening, rearX, (y0 + y1) / 2, z + rearPitch / 2)
    }
  }
  for (const sign of [-1, 1]) box(group, brick, .70, top, 2.6, rearX, top / 2, sign * (length / 2 - 1.3))
  const vestibuleX = rearX - 1.8
  box(group, brick, 3.6, 3.3, 1.8, vestibuleX, 1.95, -7.1)
  box(group, brick, 3.6, 3.3, 1.8, vestibuleX, 1.95, 7.1)
  box(group, brick, .5, 1.0, 16, rearX - 3.4, 3.1, 0)
  box(group, glass, .12, 2.5, 12.6, rearX - 3.1, 1.65, 0)
  box(group, white, 4.4, .32, 16.6, vestibuleX - .2, 3.8, 0)
  for (let step = 0; step < 3; step++) box(group, stone, .65, .17 * (step + 1), 13.2, rearX - 4.7 + step * .65, .12 + .085 * (step + 1), 0)

  function rail(x: number, y: number, z0: number, z1: number) {
    box(group, frameMaterial, .075, .075, z1 - z0, x, y + 1.0, (z0 + z1) / 2)
    for (let z = z0; z <= z1; z += 1.15) box(group, frameMaterial, .075, 1.0, .075, x, y + .50, z)
  }
  box(group, white, .9, .26, length + .6, rearX, top + .18, 0)
  rail(rearX - .03, top + .32, -length / 2, length / 2)
  rail(rearX - 4.0, 4.0, -8, 8)
  // 长悬挑棚顶下单排粗柱，柱脚以砖墩过渡；两端蓝区露在雨棚外。
  const canopyLength = length * .82, canopyY = 17.4, columns = 12
  const columnX = rearX + 2.1
  for (let col = 0; col < columns; col++) {
    const z = -canopyLength / 2 + 3.4 + col * (canopyLength - 6.8) / (columns - 1)
    box(group, brick, 2.0, .9, 2.0, columnX, top + .45, z)
    box(group, stone, 1.22, canopyY - top - 1.25, 1.22, columnX, (canopyY + top + .55) / 2, z)
    box(group, underside, width * 1.12, .20, .46, .0, canopyY - .48, z)
    for (const x of [-width * .15, width * .25]) box(group, lights, 1.55, .035, 1.1, x, canopyY - .60, z)
  }
  box(group, roof, width * 1.15, .72, canopyLength, -.1, canopyY, 0)
  // 中央主席区：独立砖亭、三个前窗、覆盖亭前平台的小平顶。
  const boothLength = length * .095, boothX = .7, boothBottom = 5.5, boothTop = 9.0
  box(group, brick, 4.4, .30, boothLength, boothX, boothBottom + .15, 0)
  box(group, brick, .45, boothTop - boothBottom, boothLength, boothX - 2.2, (boothTop + boothBottom) / 2, 0)
  for (const sign of [-1, 1]) box(group, brick, 4.4, boothTop - boothBottom, .45, boothX, (boothTop + boothBottom) / 2, sign * boothLength / 2)
  box(group, brick, .5, .75, boothLength, boothX + 2.2, boothTop - .375, 0)
  box(group, brick, .5, 1.0, boothLength, boothX + 2.2, boothBottom + .50, 0)
  for (let col = 0; col < 3; col++) {
    const z = (col - 1) * boothLength / 3
    box(group, glass, .09, 1.75, boothLength / 3 - 1.05, boothX + 2.17, 7.35, z)
    box(group, brick, .5, 1.75, 1.05, boothX + 2.2, 7.35, z + boothLength / 6)
  }
  box(group, roof, 6.6, .30, boothLength + 1.2, boothX + .55, boothTop + .15, 0)
  // 看台前平台下保留重复开间；中央两组下行阶梯补齐缺失的正立面。
  const apronX = width * .46
  box(group, stone, 3.4, .28, length + 2, apronX, platform - .14, 0)
  const arcadeBays = 24
  for (let col = 0; col <= arcadeBays; col++) box(group, brick, 3.4, platform - .28, .55, apronX, (platform - .28) / 2, -length / 2 + col * length / arcadeBays)
  for (const sign of [-1, 1]) for (let step = 0; step < 7; step++) {
    const h = .24 * (step + 1), x = apronX + 4.15 - step * .43
    box(group, stone, .44, h, 3.1, x, h / 2, sign * length * .065)
    for (const z of [sign * length * .065 - 1.8, sign * length * .065 + 1.8]) box(group, brick, .44, h + .36, .36, x, (h + .36) / 2, z)
  }
  group.userData.layout = { sourceId: building.id, width, length, seatRows: 20, centralRows: 12, seatZones: seatZones.map(zone => ({ lo: zone.lo, hi: zone.hi, rows: zone.rows, color: zone.color })), canopyColumns: columns, canopyLength, canopyY, rearWindowBays: rearWindows, arcadeBays, centralBooth: true, reconstructedFront: true, facesPitch: 'east' }
  consolidate(group)
  return group
}
