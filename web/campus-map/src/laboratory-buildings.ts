import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Building } from './data/jinnan-seed'
import { createTeachingClusterPart, WEST_PUBLIC_TEACHING_IDS } from './public-teaching'

/** A/B/C/D、A 区内侧连接体、B/C 主连廊。 */
export const EAST_LABORATORY_IDS = [
  'osm-building-1456224124', 'osm-building-1456224123',
  'osm-building-1456224121', 'osm-building-1456224120',
  'osm-building-1456224125', 'osm-building-1456224122',
]
// 从东侧 A 楼的长边建立轴线，再以原始端点定位；镜像的是细部模板而不是数据轮廓。
export const EAST_LABORATORY_FRAME = { x: 1322.90, z: -684.46, yaw: -Math.atan2(7.19, 100.17) }

export function createEastLaboratoryLandmark(building: Building, brick: THREE.Material) {
  const role = EAST_LABORATORY_IDS.indexOf(building.id)
  if (role < 0) throw new Error(`Not an east laboratory building: ${building.id}`)
  const group = createTeachingClusterPart({ ...building, id: WEST_PUBLIC_TEACHING_IDS[role] }, brick, true)
  group.name = `east-laboratory-${building.id}`
  group.position.set(EAST_LABORATORY_FRAME.x, 1.22, EAST_LABORATORY_FRAME.z)
  group.rotation.y = EAST_LABORATORY_FRAME.yaw
  group.scale.x = -1
  group.userData.layout.sourceId = building.id
  group.userData.layout.side = 'east'
  group.userData.layout.name = building.name
  group.userData.layout.roofServiceRuns = 0

  const duct = new THREE.MeshLambertMaterial({ color: 0xc9cec8 })
  const equipment = new THREE.MeshLambertMaterial({ color: 0x43494b })
  const roofBatches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
    const geometry = new THREE.BoxGeometry(w, h, d).toNonIndexed()
    geometry.translate(x, y, z)
    const batch = roofBatches.get(material) ?? []
    batch.push(geometry)
    roofBatches.set(material, batch)
  }
  function run(points: [number, number][], y: number) {
    for (let n = 1; n < points.length; n++) {
      const [x0, z0] = points[n - 1], [x1, z1] = points[n]
      box(Math.abs(x1 - x0) + .52, .38, Math.abs(z1 - z0) + .52, (x0 + x1) / 2, y + .45, (z0 + z1) / 2, duct)
    }
    for (const [x, z] of [points[0], points[points.length - 1]]) box(.85, .72, .85, x, y + .46, z, equipment)
    group.userData.layout.roofServiceRuns++
  }
  function parallelRoutes(x: number, z: number, width: number, depth: number, y: number, count = 4) {
    // 平行折返设备管线，保留独立间隙和横向棕色支架。
    for (let n = 0; n < count; n++) {
      const inset = n * 1.1
      run([[x, z + inset], [x + width - inset, z + inset], [x + width - inset, z + depth - inset], [x + width * .38, z + depth - inset]], y)
    }
    for (const dx of [width * .25, width * .65]) box(1.05, .38, depth + 1.1, x + dx, y + .24, z + depth / 2, brick)
  }
  if (role === 0) {
    parallelRoutes(-48, 94.5, 34, 10, 18.6)
    parallelRoutes(2, 97, 20, 7, 18.6, 3)
    run([[-59.8, 91], [-59.8, 106], [29.2, 106]], 18.6)
  } else if (role === 1) {
    parallelRoutes(-12, 23.5, 59, 26, 22.65)
    parallelRoutes(-59, 22, 25, 7.5, 18.65, 3)
    // 庭院侧玻璃楼梯厅的窗格，避免大型深色面缺少分格。
    const hallX = -22.3, hallZ = 36.85
    for (let y = 1.2; y < 21.7; y += 1.4) box(4.55, .07, 7.10, hallX, y, hallZ, equipment)
  } else if (role === 2) {
    parallelRoutes(-16, -50.6, 18, 10.2, 22.65)
    parallelRoutes(-59, -29.8, 25, 6, 18.65, 3)
    for (let y = 1.2; y < 21.7; y += 1.4) box(4.55, .07, 7.10, -22.3, y, -38.575, equipment)
    for (let n = 0; n < 3; n++) box(2, .65, 1.7, 6 + n * 2.7, 23.02, -50, duct)
  } else if (role === 3) {
    parallelRoutes(-53, -107, 32, 12, 18.65)
    parallelRoutes(3, -105.5, 20, 8, 18.65, 3)
    run([[-61, -84], [-61, -108], [26.5, -108]], 18.65)
  } else if (role === 4) {
    run([[27, 60], [27, 84], [32, 84]], 18.65)
    run([[29, 60], [29, 81]], 18.65)
  }
  for (const [material, geometries] of roofBatches) {
    const geometry = mergeGeometries(geometries, false)
    geometries.forEach(part => part.dispose())
    if (!geometry) throw new Error(`Unable to merge laboratory services: ${building.id}`)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'laboratory-roof-services'
    group.add(mesh)
  }
  return group
}
