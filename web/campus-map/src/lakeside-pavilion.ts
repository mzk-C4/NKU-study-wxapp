import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// 圆形半岛上现有步道的端点；不改湖岸轮廓，也不另造水中岛屿。
export const LAKESIDE_PAVILION_SITE = {
  x: 632.13, z: -656.18, yaw: -Math.atan2(10.78, 31.89),
  lakeId: 'osm-area-768657102', pathId: 'osm-road-1431157140-1', clearance: 16,
}

export function createLakesidePavilion() {
  const group = new THREE.Group()
  group.name = '圆形半岛四柱亭'
  group.position.set(LAKESIDE_PAVILION_SITE.x, 0, LAKESIDE_PAVILION_SITE.z)
  group.rotation.y = LAKESIDE_PAVILION_SITE.yaw
  const materials = {
    wood: new THREE.MeshLambertMaterial({ color: 0x765041 }),
    edge: new THREE.MeshLambertMaterial({ color: 0x433a32 }),
    tiles: new THREE.MeshLambertMaterial({ color: 0xa18369, side: THREE.DoubleSide }),
    seams: new THREE.MeshLambertMaterial({ color: 0x7f6654 }),
    stone: new THREE.MeshLambertMaterial({ color: 0xd7c9ac }),
  }
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  function add(geometry: THREE.BufferGeometry, material: THREE.Material) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (flat !== geometry) geometry.dispose()
    const batch = batches.get(material) ?? []
    batch.push(flat); batches.set(material, batch)
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
    const geometry = new THREE.BoxGeometry(w, h, d)
    geometry.translate(x, y, z); add(geometry, material)
  }
  // 小圆形铺装台承接既有步道，亭内保持空地，不添加门窗或围栏。
  const platform = new THREE.CylinderGeometry(5.2, 5.35, .24, 48)
  platform.translate(0, .37, 0); add(platform, materials.stone)
  box(6.1, .16, 6.1, 0, .55, 0, materials.stone)
  const columns = [] as { x: number; z: number }[]
  for (const x of [-2.35, 2.35]) for (const z of [-2.35, 2.35]) {
    columns.push({ x, z })
    box(.76, .68, .76, x, .97, z, materials.stone)
    box(.52, 3.18, .52, x, 2.90, z, materials.wood)
    box(.70, .18, .70, x, 4.52, z, materials.edge)
  }
  for (const sign of [-1, 1]) {
    box(5.25, .28, .34, 0, 4.47, sign * 2.35, materials.wood)
    box(.34, .28, 5.25, sign * 2.35, 4.47, 0, materials.wood)
  }
  function roof(half: number, topHalf: number, y0: number, y1: number, rows: number) {
    const square = (r: number, y: number) => [
      new THREE.Vector3(-r, y, -r), new THREE.Vector3(r, y, -r),
      new THREE.Vector3(r, y, r), new THREE.Vector3(-r, y, r),
    ]
    const bottom = square(half, y0), top = square(topHalf, y1)
    const vertices: number[] = []
    for (let side = 0; side < 4; side++) {
      const a = bottom[side], b = bottom[(side + 1) % 4], c = top[(side + 1) % 4], d = top[side]
      vertices.push(...a.toArray(), ...d.toArray(), ...b.toArray(), ...b.toArray(), ...d.toArray(), ...c.toArray())
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.computeVertexNormals(); add(geometry, materials.tiles)
    for (const sign of [-1, 1]) {
      box(half * 2 + .12, .18, .18, 0, y0 - .04, sign * half, materials.edge)
      box(.18, .18, half * 2 + .12, sign * half, y0 - .04, 0, materials.edge)
    }
    // 顺着坡面逐层收分的瓦缝，不使用照片贴图。
    for (let row = 1; row < rows; row++) {
      const t = row / rows, r = half + (topHalf - half) * t, y = y0 + (y1 - y0) * t + .025
      for (const sign of [-1, 1]) {
        box(r * 2, .055, .065, 0, y, sign * r, materials.seams)
        box(.065, .055, r * 2, sign * r, y, 0, materials.seams)
      }
    }
  }
  roof(3.8, 1.35, 4.66, 6.24, 12)
  // 上下两层屋顶之间留通风缝，上檐缩小且高起，保持照片中的双檐轮廓。
  for (const x of [-1.12, 1.12]) for (const z of [-1.12, 1.12]) box(.16, .46, .16, x, 6.38, z, materials.edge)
  for (const sign of [-1, 1]) {
    box(2.8, .15, .16, 0, 6.52, sign * 1.12, materials.edge)
    box(.16, .15, 2.8, sign * 1.12, 6.52, 0, materials.edge)
  }
  roof(2.05, .055, 6.60, 8.12, 10)
  box(.16, .16, .16, 0, 8.15, 0, materials.edge)
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false)
    geometries.forEach(part => part.dispose())
    if (!geometry) throw new Error('Pavilion geometry merge failed')
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'pavilion-detail'
    group.add(mesh)
  }
  group.userData.layout = { columns, roofTiers: 2, openSides: 4, footprint: 7.6, height: 8.23, lakeId: LAKESIDE_PAVILION_SITE.lakeId, pathId: LAKESIDE_PAVILION_SITE.pathId }
  return group
}
