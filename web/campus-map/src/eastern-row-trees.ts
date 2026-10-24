import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { CampusSeed, Point } from './data/jinnan-seed'

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }
type Mask = Bounds & { polygon: Point[]; clearance: number }

// 仅响应用户指定的东部空地：不恢复此前全校按绿地撒树的逻辑。
export const EASTERN_TREE_SCOPE: Point[] = [[1430, -1345], [2230, -1275], [2126, 23], [1410, -47]]
// 东北湿地整片留白，包括湖间陆地，而非只排除蓝色水面。
export const NORTHEAST_LAKE_RESERVE: Point[] = [[1824, -1299], [2230, -1275], [2183, -704], [1908, -736], [1919, -903], [1812, -985]]
export const EASTERN_TREE_GRID = { x: 1500, z: -1320, yaw: -Math.atan2(68.6, 800), spacing: 22 }
export const PINE_MODEL = { trunkTopRadius: .38, trunkBottomRadius: .56, trunkHeight: 2.4, height: 9.64, canopyRadius: 3.2 }
export const GARDEN_TREE_COLORS = [0x708968, 0x7e9471, 0x657f5e, 0x8a9e79]
export function gardenTreeStyle([x,z]: Point) {
  const code = Math.abs(Math.round(x * 13 + z * 7))
  const rounded = code % 5 === 0
  return { scale: new THREE.Vector3(rounded ? 1 : .86 + (code % 3) * .04, rounded ? .88 : .96 + (code % 3) * .02, rounded ? 1 : .86 + (code % 3) * .04), color: GARDEN_TREE_COLORS[code % GARDEN_TREE_COLORS.length] }
}
export function createGardenCanopyGeometry(detail: 'fine' | 'medium' | 'coarse') {
  // Soft teardrop/ovoid garden crowns from the approved board, not stacked sharp cones.
  const profile = (detail === 'coarse'
    ? [[0,2.1],[3.2,4.6],[0,9.6]]
    : [[0,2.1],[1.7,2.4],[2.8,3.1],[3.2,4.3],[3.05,5.3],[2.55,6.4],[1.8,7.7],[.85,8.9],[0,9.6]])
    .map(([radius,y]) => new THREE.Vector2(radius,y))
  const geometry = new THREE.LatheGeometry(profile, detail === 'fine' ? 10 : detail === 'medium' ? 6 : 5)
  geometry.computeVertexNormals()
  return geometry
}
type TreeSite = { point: Point; row: number; column: number; style: 'pine' }

export function inTreePolygon([x, z]: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i], [xj, zj] = polygon[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)
}
function mask(polygon: Point[], clearance: number): Mask {
  return { polygon, clearance, minX: Math.min(...polygon.map(p => p[0])) - clearance, maxX: Math.max(...polygon.map(p => p[0])) + clearance, minZ: Math.min(...polygon.map(p => p[1])) - clearance, maxZ: Math.max(...polygon.map(p => p[1])) + clearance }
}
function inBounds([x, z]: Point, b: Bounds) { return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ }
function nearMask(point: Point, m: Mask, closed = true) {
  if (!inBounds(point, m)) return false
  if (closed && inTreePolygon(point, m.polygon)) return true
  for (let i = 0; i < m.polygon.length - (closed ? 0 : 1); i++) {
    if (segmentDistance(point, m.polygon[i], m.polygon[(i + 1) % m.polygon.length]) <= m.clearance) return true
  }
  return false
}

export function getEasternTreeSites(model: CampusSeed, reserved: Bounds[] = []) {
  const buildings = model.buildings.map(building => mask(building.footprint, 10))
  // 大通、教学楼等凹形轮廓的内院也保留为空，避免树挤入门厅与建筑底盘。
  const buildingBounds = buildings.map(({ minX, maxX, minZ, maxZ }) => ({ minX, maxX, minZ, maxZ }))
  const surfaces = model.greens.map(area => mask(area.polygon, area.kind === 'water' ? 5 : /球场|运动|跑道/.test(area.name) ? 7 : 2.5))
  const roads = model.roads.map(road => mask(road.points, road.kind === 'primary' ? 22 : road.kind === 'secondary' ? 15 : 8))
  const c = Math.cos(EASTERN_TREE_GRID.yaw), s = Math.sin(EASTERN_TREE_GRID.yaw)
  const sites: TreeSite[] = []
  function allowed(point: Point) {
    if (!inTreePolygon(point, EASTERN_TREE_SCOPE) || inTreePolygon(point, NORTHEAST_LAKE_RESERVE)) return false
    if (reserved.some(b => inBounds(point, b)) || buildingBounds.some(b => inBounds(point, b))) return false
    return !surfaces.some(m => nearMask(point, m)) && !roads.some(m => nearMask(point, m, false))
  }
  for (let row = -5; row <= 105; row++) for (let column = -12; column <= 59; column++) {
    const x = column * EASTERN_TREE_GRID.spacing
    const z = row * EASTERN_TREE_GRID.spacing
    const point: Point = [EASTERN_TREE_GRID.x + c * x + s * z, EASTERN_TREE_GRID.z - s * x + c * z]
    if (allowed(point)) sites.push({ point, row, column, style: 'pine' })
  }
  return sites
}

/** 只给包含已种松树的连通地块铺浅绿，颜色与地图原有绿地一致。 */
export function createEasternPlantedGround(model: CampusSeed, reserved: Bounds[] = [], sites = getEasternTreeSites(model, reserved)) {
  const buildings = model.buildings.map(building => mask(building.footprint, 5))
  const waterAndPlazas = model.greens.filter(area => area.kind !== 'green' || /球场|运动|跑道/.test(area.name)).map(area => mask(area.polygon, 1))
  const roads = model.roads.map(road => mask(road.points, (road.kind === 'primary' ? 15 : road.kind === 'secondary' ? 9 : 3.5) * 1.18 + .5))
  const step = 8, originX = 1400, originZ = -1360, columns = 106, rows = 176
  const cache = new Map<string, boolean>()
  const buckets = new Map<string, { reserved: Bounds[]; buildings: Mask[]; surfaces: Mask[]; roads: Mask[] }>()
  function allowed(x: number, z: number) {
    const key = `${x},${z}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const bucketX = Math.floor(x / 64), bucketZ = Math.floor(z / 64), bucketKey = `${bucketX},${bucketZ}`
    let candidates = buckets.get(bucketKey)
    if (!candidates) {
      const overlaps = (b: Bounds) => b.maxX >= bucketX * 64 && b.minX <= (bucketX + 1) * 64 && b.maxZ >= bucketZ * 64 && b.minZ <= (bucketZ + 1) * 64
      candidates = { reserved: reserved.filter(overlaps), buildings: buildings.filter(overlaps), surfaces: waterAndPlazas.filter(overlaps), roads: roads.filter(overlaps) }
      buckets.set(bucketKey, candidates)
    }
    const point: Point = [x, z]
    const value = inTreePolygon(point, EASTERN_TREE_SCOPE) && !inTreePolygon(point, NORTHEAST_LAKE_RESERVE)
      && !candidates.reserved.some(b => inBounds(point, b)) && !candidates.buildings.some(b => inBounds(point, b))
      && !candidates.surfaces.some(m => nearMask(point, m)) && !candidates.roads.some(m => nearMask(point, m, false))
    cache.set(key, value)
    return value
  }
  const cells = new Uint8Array(columns * rows)
  const components = new Int32Array(columns * rows).fill(-1)
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    if (allowed(originX + (col + .5) * step, originZ + (row + .5) * step)) cells[row * columns + col] = 1
  }
  let componentCount = 0
  for (let start = 0; start < cells.length; start++) {
    if (!cells[start] || components[start] !== -1) continue
    const queue = [start]
    components[start] = componentCount
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], row = Math.floor(index / columns), col = index % columns
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const r = row + dr, c = col + dc
        if (r < 0 || r >= rows || c < 0 || c >= columns) continue
        const neighbor = r * columns + c
        if (cells[neighbor] && components[neighbor] === -1) { components[neighbor] = componentCount; queue.push(neighbor) }
      }
    }
    componentCount++
  }
  const planted = new Set<number>()
  for (const { point: [x, z] } of sites) {
    const col = Math.floor((x - originX) / step), row = Math.floor((z - originZ) / step)
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr, c = col + dc
      if (r >= 0 && r < rows && c >= 0 && c < columns && components[r * columns + c] >= 0) planted.add(components[r * columns + c])
    }
  }
  const vertices: number[] = []
  function boundaryTriangle(points: Point[]) {
    const clipped: Point[] = []
    for (let i = 0; i < 3; i++) {
      const a = points[i], b = points[(i + 1) % 3], aInside = allowed(...a), bInside = allowed(...b)
      if (aInside) clipped.push(a)
      if (aInside !== bInside) {
        let lo: Point = a, hi: Point = b
        for (let iteration = 0; iteration < 8; iteration++) {
          const mid: Point = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
          if (allowed(...mid) === aInside) lo = mid
          else hi = mid
        }
        clipped.push([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2])
      }
    }
    for (let i = 1; i < clipped.length - 1; i++) for (const [x, z] of [clipped[0], clipped[i], clipped[i + 1]]) vertices.push(x, .025, z)
  }
  function tile(x: number, z: number, size: number) {
    const flags = [allowed(x, z), allowed(x + size, z), allowed(x, z + size), allowed(x + size, z + size), allowed(x + size / 2, z + size / 2)]
    if (flags.every(value => !value)) return
    if (!flags.every(Boolean)) {
      if (size <= 1) {
        const corners: Point[] = [[x, z], [x, z + size], [x + size, z + size], [x + size, z]]
        const center: Point = [x + size / 2, z + size / 2]
        for (let side = 0; side < 4; side++) boundaryTriangle([corners[side], corners[(side + 1) % 4], center])
        return
      }
      const half = size / 2
      tile(x, z, half); tile(x + half, z, half); tile(x, z + half, half); tile(x + half, z + half, half)
      return
    }
    // 低于现有绿地、水面、道路及建筑，保留这些对象的原有显示关系。
    vertices.push(x, .025, z, x, .025, z + size, x + size, .025, z,
      x + size, .025, z, x, .025, z + size, x + size, .025, z + size)
  }
  // 米级细分后再裁切边界，避免浅绿地块出现明显锯齿或伸入道路。
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const index = row * columns + col
    if (planted.has(components[index])) tile(originX + col * step, originZ + row * step, step)
    else if (!cells[index] && [-1, 1, -columns, columns].some(offset => {
      const neighbor = index + offset
      return neighbor >= 0 && neighbor < components.length && planted.has(components[neighbor])
    })) tile(originX + col * step, originZ + row * step, step)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xb8d0a0 }))
  mesh.name = '东部松树林浅绿地块'
  mesh.userData.layout = { groundColor: 0xb8d0a0, plantedPatches: planted.size, trees: sites.length, northeastLakeExcluded: true }
  return mesh
}

export function createUniformPineGroup(points: Point[], name: string) {
  const group = new THREE.Group()
  group.name = name
  if (points.length) {
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(PINE_MODEL.trunkTopRadius, PINE_MODEL.trunkBottomRadius, PINE_MODEL.trunkHeight, 8), new THREE.MeshLambertMaterial({ color: 0x8a755c }), points.length)
    stems.name = 'pine-tree-stems'
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion()
    points.forEach(([x, z], index) => {
      matrix.compose(new THREE.Vector3(x, 1.24, z), rotation, new THREE.Vector3(1, 1, 1))
      stems.setMatrixAt(index, matrix)
    })
    stems.computeBoundingSphere(); group.add(stems)
    const foliage = new THREE.InstancedMesh(createGardenCanopyGeometry('fine'), new THREE.MeshLambertMaterial({ color: 0xffffff }), points.length)
    foliage.name = 'pine-tree-foliage'
    points.forEach(([x, z], index) => {
      const style = gardenTreeStyle([x,z])
      matrix.compose(new THREE.Vector3(x, .04, z), rotation, style.scale)
      foliage.setMatrixAt(index, matrix)
      foliage.setColorAt(index, new THREE.Color(style.color))
    })
    foliage.computeBoundingSphere(); group.add(foliage)
  }
  group.userData.layout = { trees: points.length, species: { pine: points.length }, style: 'nkustudy-soft-garden', height: PINE_MODEL.height, canopyDiameter: PINE_MODEL.canopyRadius * 2, trunkDiameter: PINE_MODEL.trunkBottomRadius * 2 }
  return group
}

export function createEasternRowTrees(model: CampusSeed, reserved: Bounds[] = []) {
  const sites = getEasternTreeSites(model, reserved)
  const group = createUniformPineGroup(sites.map(site => site.point), '用户指定东部整齐松树林')
  Object.assign(group.userData.layout, { sites, spacing: EASTERN_TREE_GRID.spacing, pattern: 'regular-pine-rows', northeastLakeExcluded: true, scope: 'east-only' })
  return group
}
