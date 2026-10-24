import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Building } from './data/jinnan-seed'

export const FRONTIER_CENTER_ID = 'osm-building-1456224126'
// 沿原始北侧屋面长边定位，所有体块共用同一原地坐标系。
export const FRONTIER_CENTER_FRAME = { x: 1335, z: -890, yaw: -Math.atan2(7.18, 69.42) }
type Rect = [number, number, number, number]
type Face = 'north' | 'south' | 'east' | 'west'

export function createFrontierCenterLandmark(building: Building, brick: THREE.Material) {
  if (building.id !== FRONTIER_CENTER_ID) throw new Error(`Not the frontier center: ${building.id}`)
  const group = new THREE.Group()
  group.name = 'frontier-interdisciplinary-center'
  group.position.set(FRONTIER_CENTER_FRAME.x, 1.22, FRONTIER_CENTER_FRAME.z)
  group.rotation.y = FRONTIER_CENTER_FRAME.yaw
  const m = {
    brick,
    white: new THREE.MeshLambertMaterial({ color: 0xe4e2d9 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x394c50 }),
    shadow: new THREE.MeshLambertMaterial({ color: 0x202b30 }),
    frame: new THREE.MeshLambertMaterial({ color: 0x9fa9a5 }),
    roof: new THREE.MeshLambertMaterial({ color: 0x83877f }),
    // 地面底盘改为与周围主底板一致的沙色，不改建筑和植物配色。
    lawn: new THREE.MeshLambertMaterial({ color: 0xefebe2 }),
    paving: new THREE.MeshLambertMaterial({ color: 0xc9c3b7 }),
  }
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const parts: { name: string; bounds: Rect; bottom: number; top: number }[] = []
  let windows = 0, fins = 0, screens = 0
  function add(geometry: THREE.BufferGeometry, material: THREE.Material) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (flat !== geometry) geometry.dispose()
    const batch = batches.get(material) ?? []
    batch.push(flat)
    batches.set(material, batch)
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
    if (w <= 0 || h <= 0 || d <= 0) return
    const geometry = new THREE.BoxGeometry(w, h, d)
    geometry.translate(x, y, z)
    add(geometry, material)
  }
  function slab(r: Rect, y: number, h: number, material: THREE.Material) {
    box(r[1] - r[0], h, r[3] - r[2], (r[0] + r[1]) / 2, y + h / 2, (r[2] + r[3]) / 2, material)
  }
  function ring(outer: Rect, hole: Rect, y: number, h: number, material: THREE.Material) {
    slab([outer[0], outer[1], outer[2], hole[2]], y, h, material)
    slab([outer[0], outer[1], hole[3], outer[3]], y, h, material)
    slab([outer[0], hole[0], hole[2], hole[3]], y, h, material)
    slab([hole[1], outer[1], hole[2], hole[3]], y, h, material)
  }
  function surface(r: Rect, face: Face) {
    const alongX = face === 'north' || face === 'south'
    const lo = alongX ? r[0] : r[2], hi = alongX ? r[1] : r[3]
    const fixed = face === 'north' ? r[2] : face === 'south' ? r[3] : face === 'west' ? r[0] : r[1]
    const sign = face === 'north' || face === 'west' ? -1 : 1
    const piece = (a: number, b: number, y0: number, y1: number, material: THREE.Material, d = .55, offset = 0) => {
      if (alongX) box(b - a, y1 - y0, d, (a + b) / 2, (y0 + y1) / 2, fixed + sign * offset, material)
      else box(d, y1 - y0, b - a, fixed + sign * offset, (y0 + y1) / 2, (a + b) / 2, material)
    }
    return { lo, hi, piece, fixed, alongX, sign }
  }
  function grid(r: Rect, face: Face, lo: number, hi: number, y0: number, y1: number) {
    const { piece } = surface(r, face)
    piece(lo, hi, y0, y1, m.glass, .09, -.20)
    for (let u = lo + 1.45; u < hi; u += 1.45) piece(u - .04, u + .04, y0, y1, m.frame, .10, -.12)
    for (let y = y0 + 1.5; y < y1; y += 1.5) piece(lo, hi, y - .04, y + .04, m.frame, .10, -.12)
  }
  function windowWall(r: Rect, face: Face, top: number, bottom = 0, variant: 'mixed' | 'narrow' | 'plain' = 'mixed') {
    const { lo, hi, piece } = surface(r, face)
    if (variant === 'plain') { piece(lo, hi, bottom, top, brick); return }
    const count = Math.max(2, Math.floor((hi - lo - 3.5) / (variant === 'mixed' ? 6.1 : 5.2)))
    const pitch = (hi - lo - 3.5) / count
    for (let row = 0; row < 4; row++) {
      const base = bottom + row * 4.35, sill = base + .65, head = base + 3.6
      if (head > top) break
      piece(lo, hi, base, sill, brick)
      piece(lo, hi, head, Math.min(base + 4.35, top), brick)
      let cursor = lo
      for (let col = 0; col < count; col++) {
        const u = lo + 1.75 + (col + .5) * pitch
        const w = variant === 'narrow' ? 1.85 : row === 3 ? 3.3 : 3.55
        piece(cursor, u - w / 2, sill, head, brick)
        grid(r, face, u - w / 2, u + w / 2, sill, head)
        if (variant === 'mixed') {
          // 不完整的浅色 L 形窗套与深色腰梁，避免变成统一白框。
          piece(u + w / 2 - .43, u + w / 2, sill, head, m.white, .64, .08)
          if ((row + col) % 3 !== 0) piece(u - w / 2, u + w / 2, head - .33, head, m.white, .64, .08)
          if (row < 3) piece(u - w / 2, u + w / 2, base + 2.05, base + 2.29, m.frame, .70, .09)
        }
        cursor = u + w / 2
        windows++
      }
      piece(cursor, hi, sill, head, brick)
    }
    if (top > bottom + 17.4) piece(lo, hi, bottom + 17.4, top, brick)
  }
  function shell(name: string, r: Rect, top: number, styles: ('mixed' | 'narrow' | 'plain' | 'custom')[], bottom = 0) {
    parts.push({ name, bounds: r, bottom, top })
    ;(['north', 'south', 'west', 'east'] as Face[]).forEach((face, i) => { if (styles[i] !== 'custom') windowWall(r, face, top, bottom, styles[i]) })
    slab(r, top, .36, m.roof)
    for (const face of ['north', 'south', 'west', 'east'] as Face[]) {
      const { lo, hi, piece } = surface(r, face)
      piece(lo, hi, top + .36, top + .66, m.roof, .65)
    }
  }
  function lattice(r: Rect, face: Face, center: number, y0: number, width: number, height: number) {
    const { piece } = surface(r, face)
    // 独立细砖条形成穿孔屏风；后退的暗色衬层保证小孔有真实进深。
    piece(center - width / 2, center + width / 2, y0, y0 + height, m.shadow, .04, .30)
    const pitch = .80
    for (let u = center - width / 2; u <= center + width / 2; u += pitch) piece(u, Math.min(u + .16, center + width / 2), y0, y0 + height, brick, .32, .38)
    for (let y = y0; y < y0 + height; y += pitch) piece(center - width / 2, center + width / 2, y, Math.min(y + .16, y0 + height), brick, .32, .38)
    screens++
  }

  const main: Rect = [-30, 51, -14, 60]
  const courtyard: Rect = [1.5, 20, 14, 32.5]
  // 主体不是实心盒子：楼板、屋顶与内墙都绕开中庭。
  for (const y of [0, 4.35, 8.7, 13.05, 17.4]) ring(main, courtyard, y, .22, m.roof)
  windowWall(main, 'south', 21.5)
  windowWall(main, 'east', 21.5, 0, 'narrow')
  // 面向两楼间窄院的内侧为窄窗砖墙，主玻璃入口在向西伸出的四层裙楼上。
  windowWall(main, 'west', 21.5, 0, 'narrow')
  windowWall(main, 'north', 21.5, 0, 'narrow')
  for (const face of ['north', 'south', 'west', 'east'] as Face[]) {
    // 朝中庭的墙面，法向与外墙相反；反向朝向仍为双面墙体。
    windowWall(courtyard, face, 21.5, 0, 'narrow')
  }
  slab(courtyard, .02, .12, m.lawn)
  parts.push({ name: 'main-brick-ring', bounds: main, bottom: 0, top: 21.5 })

  // 白色顶冠：暗色退台、连续玻璃和向外伸出的独立竖向遮阳构件。
  ring([-29, 50, -13, 59], courtyard, 21.5, 2.4, m.shadow)
  ring([-32, 53, -16, 62], courtyard, 23.9, .42, m.white)
  const crown: Rect = [-30.8, 51.8, -14.8, 60.8]
  for (const face of ['north', 'south', 'west', 'east'] as Face[]) {
    const { lo, hi, piece } = surface(crown, face)
    piece(lo, hi, 24.32, 38.5, m.glass, .10, -.45)
    const count = Math.round((hi - lo) / 3.6)
    for (let i = 0; i <= count; i++) {
      const u = lo + i * (hi - lo) / count
      piece(u - .47, u + .47, 24.32, 38.5, m.white, 1.18, .15)
      if (i < count) piece(u + .57, u + (hi - lo) / count - .57, 32.8, 38.3, m.shadow, .12, -.33)
      fins++
    }
    for (let y = 24.5; y < 38.5; y += 1.45) piece(lo, hi, y, y + .06, m.frame, .10, -.33)
  }
  ring([-32.5, 53.5, -16.5, 62.5], courtyard, 38.5, .55, m.white)
  for (const face of ['north', 'south', 'west', 'east'] as Face[]) {
    const { lo, hi, piece } = surface(courtyard, face)
    piece(lo, hi, 24.3, 38.5, m.glass)
    for (let u = lo; u < hi; u += 3.1) piece(u, u + .65, 24.3, 38.5, m.white, .75)
  }
  parts.push({ name: 'white-finned-crown', bounds: crown, bottom: 23.9, top: 39.05 })

  const north: Rect = [-30.1, 39.7, -63.8, -26]
  shell('north-high-annex', north, 27.8, ['narrow', 'custom', 'custom', 'narrow'])
  const ns = surface(north, 'south')
  ns.piece(-30.1, 39.7, 0, 12.6, brick)
  ns.piece(-30.1, 39.7, 24.4, 27.8, brick)
  ns.piece(-30.1, -13.9, 12.6, 24.4, brick)
  ns.piece(24.9, 39.7, 12.6, 24.4, brick)
  ns.piece(-30.1, 39.7, 8.5, 9.1, m.frame, .7, .30)
  for (let x = -13; x < 26; x += 3) {
    grid(north, 'south', x - .9, x + .9, 12.6, 24.4)
    ns.piece(x + .9, x + 2.1, 12.6, 24.4, brick, .75, .10)
    windows++
  }
  for (const y of [16.3, 20.5]) ns.piece(-15, 26.5, y, y + .32, m.frame, .7, .4)
  lattice(north, 'south', -22.5, 12.6, 6.2, 11.8)
  lattice(north, 'south', 33, 12.6, 5.5, 11.8)
  const nw = surface(north, 'west')
  nw.piece(-63.8, -26, 0, 12.6, brick)
  nw.piece(-63.8, -26, 24.4, 27.8, brick)
  nw.piece(-63.8, -59.3, 12.6, 24.4, brick)
  nw.piece(-30.6, -26, 12.6, 24.4, brick)
  for (let z = -58.6; z < -30.6; z += 2.1) {
    grid(north, 'west', z - .7, z + .7, 12.6, 24.4)
    nw.piece(z + .7, Math.min(z + 1.4, -30.6), 12.6, 24.4, brick, .65, .10)
    windows++
  }
  for (const y of [16.3, 20.5]) nw.piece(-59.3, -30.6, y, y + .32, m.frame, .7, .4)
  lattice(north, 'west', -61.5, 12.6, 3.2, 11.8)
  lattice(north, 'west', -28.4, 12.6, 3.2, 11.8)
  // 跨接置于窄院后端；西侧低门廊与其不是同一体块。
  shell('raised-north-connection', [30, 39.7, -26, -14], 17.4, ['plain', 'plain', 'narrow', 'narrow'], 4.8)
  slab([-20.1, 39.5, -26, -14], .02, .12, m.lawn)

  const northPodium: Rect = [-35.8, -20.1, -63.8, -2.7]
  shell('north-projecting-porch', northPodium, 9.6, ['plain', 'custom', 'custom', 'plain'])
  const np = surface(northPodium, 'west')
  const porchSlots: [number, number][] = [[-59.7, -56.8], [-50, -39.2], [-35.7, -32.6], [-27, -23.9], [-18.3, -15.2], [-9.6, -6.5]]
  let porchCursor = northPodium[2]
  np.piece(northPodium[2], northPodium[3], 8.3, 9.6, brick)
  for (const [lo, hi] of porchSlots) {
    np.piece(porchCursor, lo, 0, 8.3, brick, .8)
    grid(northPodium, 'west', lo, hi, .1, 8.3)
    if (hi - lo < 4) np.piece(lo, hi, 3.5, 5.5, m.white, .22, -.05)
    porchCursor = hi
    windows++
  }
  np.piece(porchCursor, northPodium[3], 0, 8.3, brick, .8)
  for (const z of [-62, -54.7, -37.4, -29.2, -20.5, -11.8, -4.5]) lattice(northPodium, 'west', z, .5, 2.45, 7.5)
  const porchEnd = surface(northPodium, 'south')
  porchEnd.piece(-35.8, -20.1, 0, 9.6, brick)
  box(4.2, .28, 11.3, -37.6, 3.5, -44.6, m.frame)
  slab([-40.3, -35.8, -50.4, -38.8], 0, .16, m.paving)
  slab([-57, -35.8, -60, -2.7], .02, .12, m.lawn)

  const west: Rect = [-52.4, -30, -2.7, 60]
  // 四层砖裙楼高屋面向前伸出，白色冠体不挪动，从而形成约二十米深的退台。
  shell('west-terraced-brick-wing', west, 21.5, ['narrow', 'mixed', 'custom', 'custom'])
  const ws = surface(west, 'west')
  ws.piece(-2.7, 3.5, 0, 21.5, brick)
  ws.piece(54.5, 60, 0, 21.5, brick)
  grid(west, 'west', 3.5, 54.5, .3, 17.4)
  for (const y of [4.35, 8.7, 13.05]) ws.piece(3.5, 54.5, y, y + .40, m.frame, .16, -.06)
  ws.piece(3.5, 54.5, 17.4, 18.5, brick)
  let clerestoryCursor = -2.7
  for (let z = -.1; z < 59; z += 3.2) {
    ws.piece(clerestoryCursor, z - .80, 18.5, 20.7, brick)
    grid(west, 'west', z - .80, z + .80, 18.5, 20.7)
    ws.piece(z - .80, z + .80, 18.5, 19.05, m.white, .65, .07)
    clerestoryCursor = z + .80
    windows++
  }
  ws.piece(clerestoryCursor, 60, 18.5, 20.7, brick)
  ws.piece(-2.7, 60, 20.7, 21.5, brick)
  // 西玻璃面前只覆盖中段，两端的全高玻璃仍然显露。
  const entry: Rect = [-59.4, -52.6, 14, 53]
  const es = surface(entry, 'west')
  const entrySlots: [number, number][] = [[20.3, 23.1], [29.8, 32.6], [39.3, 42.1]]
  let entryCursor = 14
  es.piece(14, 53, 10.5, 12.5, brick)
  for (const [lo, hi] of entrySlots) {
    es.piece(entryCursor, lo, 0, 10.5, brick, .8)
    grid(entry, 'west', lo, hi, .3, 10.5)
    es.piece(lo, hi, 4.4, 6.2, m.white, .24, -.06)
    entryCursor = hi
    windows++
  }
  es.piece(entryCursor, 53, 0, 10.5, brick, .8)
  for (const z of [17.1, 26.2, 35.7, 45.2]) lattice(entry, 'west', z, 1.5, 4.1, 7.4)
  windowWall(entry, 'north', 12.5, 0, 'plain')
  windowWall(entry, 'south', 12.5, 0, 'plain')
  windowWall(entry, 'east', 12.5, 0, 'plain')
  slab(entry, 12.5, .36, brick)
  parts.push({ name: 'recessed-glass-entry-screen', bounds: entry, bottom: 0, top: 12.86 })
  slab([-59.4, -35.8, -2.5, 10], .02, .12, m.lawn)

  // 东侧附楼随原始斜边收分，避免矩形楼板伸入道路。
  const eastPolygon = [[51, -9.5], [58.7, -9.5], [75.1, 44.4], [71.3, 48.4], [51, 49]]
  const eastShape = new THREE.Shape()
  eastPolygon.forEach(([x, z], i) => i ? eastShape.lineTo(x, -z) : eastShape.moveTo(x, -z))
  eastShape.closePath()
  const eastBody = new THREE.ExtrudeGeometry(eastShape, { depth: 10.6, bevelEnabled: false })
  eastBody.rotateX(-Math.PI / 2)
  add(eastBody, brick)
  const eastRoof = new THREE.ExtrudeGeometry(eastShape, { depth: .28, bevelEnabled: false })
  eastRoof.rotateX(-Math.PI / 2)
  eastRoof.translate(0, 10.6, 0)
  add(eastRoof, m.roof)
  for (let z = -7; z < 45; z += 4.3) {
    const x = 58.7 + (z + 9.5) * 16.4 / 53.9
    box(1.15, 10.4, .68, x, 5.2, z, brick)
  }
  parts.push({ name: 'tapered-east-annex', bounds: [51, 75.1, -9.5, 49], bottom: 0, top: 10.88 })

  // 这一侧的高裙楼屋面为空平台，不再添加原先误放在低裙楼上的整排黑色杆件。
  for (let n = 0; n < 4; n++) box(3.2, 1.25, 2.3, -18 + n * 7, 29.05, -52, m.frame)
  for (let n = 0; n < 5; n++) box(2.4, .85, 1.8, -18 + n * 6.8, 39.48, 48, m.frame)
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false)
    geometries.forEach(part => part.dispose())
    if (!geometry) throw new Error('Frontier center batch failed')
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = material === brick ? 'frontier-brick-shell' : material === m.white ? 'frontier-white-fins' : 'frontier-detail'
    group.add(mesh)
  }
  group.userData.layout = { sourceId: building.id, name: building.name, parts, windows, fins, screens, courtyard, openCourtyard: true, westTerraceDepth: 21.6, westTerraceHeight: 21.86, northPorchHeight: 9.96, height: 39.9 }
  return group
}
