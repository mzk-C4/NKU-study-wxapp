import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { campusModel } from './data/campus-model'
import type { Area, Building, BuildingCategory, Point, Road } from './data/jinnan-seed'
import { createGymSportsGrounds, createScienceCourtGrounds, createScienceSportsGrounds, createStadiumStand, STADIUM_STAND_ID } from './sports-grounds'
import { createWestPublicTeachingLandmark, WEST_PUBLIC_TEACHING_IDS } from './public-teaching'
import { createEastLaboratoryLandmark, EAST_LABORATORY_IDS } from './laboratory-buildings'
import { createFrontierCenterLandmark, FRONTIER_CENTER_ID } from './frontier-center'
import { createLakesidePavilion } from './lakeside-pavilion'
import { createEasternRowTrees, createEasternPlantedGround } from './eastern-row-trees'
import { createWestRoadTrees } from './west-road-trees'
import { roadEdgePoints, ROAD_PROFILE } from './road-profile'
import { createWhiteBuildingGeometry } from './white-building'
import { createZhouEnlaiStatue } from './zhou-enlai-statue'
import { ZHOU_ENLAI_STATUE_ID } from './data/zhou-enlai-monument'
import { installMapUI } from './map-ui'
import { createFlatMap } from './flat-map'
import { configureMapControls, constrainMapCamera } from './map-camera'
import { MapDetailManager } from './map-detail'
import { installTreeDetail } from './tree-detail'
import { installMapTouch } from './map-touch'
import { createMapRendering } from './map-rendering'
import { MAP_THEME } from './map-theme'
import { createMapMarkers } from './map-markers'
import { placePosition } from './map-places'
import './style.css'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Application mount point not found')
const pageParams = new URLSearchParams(location.search)
document.body.classList.toggle('map-debug', pageParams.get('debug') === '1')
document.body.classList.toggle('wechat-embed', pageParams.get('embed') === 'wechat')
const mobileRendering = pageParams.get('embed') === 'wechat' || matchMedia('(max-width: 760px)').matches
const compactMedia = matchMedia('(max-width: 760px)')
function updateCompactLayout() {
  document.body.classList.toggle('map-compact', pageParams.get('embed') === 'wechat' || compactMedia.matches)
  document.documentElement.style.setProperty('--map-height', `${window.visualViewport?.height ?? window.innerHeight}px`)
}
updateCompactLayout()
compactMedia.addEventListener('change', updateCompactLayout)
window.addEventListener('resize', updateCompactLayout)
window.visualViewport?.addEventListener('resize', updateCompactLayout)

root.innerHTML = `
  <main class="lab-shell">
    <section class="topbar">
      <div class="brand-block">
        <h1>NKUStudy <span>校园地图</span></h1>
        <p class="eyebrow">津南校区 · 让校园更好探索</p>
      </div>
      <div class="status-block" aria-live="polite">
        <span class="status-dot"></span>
        <span>校园导览试验 · 数据待核验</span>
      </div>
    </section>

    <section class="map-layout">
      <aside class="side-panel" aria-label="地图控制面板">
        <div class="mobile-brand"><strong>NKUStudy</strong><span>校园地图</span></div>
        <div class="campus-mode-row"><div class="campus-tabs" aria-label="校区选择"><button disabled title="八里台校区尚未接入此3D项目">八里台</button><button class="is-active" aria-current="true">津南</button></div><nav class="mode-tabs" aria-label="地图模式"><a id="map-mode-switch" href="?mode=2d">2D地图</a><a id="map-mode-3d" href="?">3D地图</a></nav></div>
        <div class="search-area">
        <label class="search-box" for="place-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 4.5 4.5"></path></svg>
          <input id="place-search" autocomplete="off" placeholder="搜索地点、简称，如公教A、二食堂" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="search-results" />
        </label>
        <div id="search-results" class="search-results" role="listbox" aria-label="地点搜索结果" aria-live="polite"></div>
        </div>
        <div id="category-chips" class="category-chips" aria-label="地点分类"><button data-category="all" aria-pressed="true">全部</button><button data-category="teaching" aria-pressed="false">教学</button><button data-category="food" aria-pressed="false">餐饮</button><button data-category="residence" aria-pressed="false">宿舍</button><button data-category="sport" aria-pressed="false">运动</button><button data-category="landmark" aria-pressed="false">景观</button><button data-category="services" aria-pressed="false">生活</button></div>
        <div id="map-panel-controls" role="region" aria-labelledby="map-panel-title">
        <div class="map-panel-heading"><strong id="map-panel-title">图层与地图设置</strong><button id="map-panel-close" aria-label="关闭图层面板">关闭 <span aria-hidden="true">×</span></button></div>
        <div class="map-toolbar">
          <button id="share-map-link">复制当前位置</button>
          <label class="detail-setting">模型精度 <select id="detail-mode" aria-label="模型精度"><option value="auto">远近自动</option><option value="full">完整精细</option></select></label>
        </div>
        <div class="panel-section">
          <p class="section-label">浏览图层</p>
          <div class="layer-list">
            <label><input id="layer-buildings" type="checkbox" checked><span class="toggle"></span>建筑体块</label>
            <label><input id="layer-roads" type="checkbox" checked><span class="toggle"></span>道路与步行轴</label>
            <label><input id="layer-landscape" type="checkbox" checked><span class="toggle"></span>绿地与水面</label>
            <label><input id="layer-labels" type="checkbox" checked><span class="toggle"></span>地点图钉与名称</label>
          </div>
        </div>

        <div class="panel-section">
          <label class="detail-setting">画面质量 <select id="render-quality" aria-label="画面质量"><option value="clear">清晰抗锯齿（推荐）</option><option value="battery">省电</option></select></label>
        </div>
        <div class="panel-section">
          <p class="section-label">校区分区</p>
          <div id="zone-list" class="zone-list"></div>
        </div>

        <div class="panel-section bottom-panel">
          <p class="data-note">建筑、名称和楼高为待核验试验数据，不用于精确导航。收藏和最近仅保存在本机。</p>
          <a href="${import.meta.env.BASE_URL}credits.html">数据来源与使用说明 ↗</a>
        </div>
        </div>
      </aside>
      <button id="map-panel-backdrop" class="map-panel-backdrop" aria-label="关闭图层面板" tabindex="-1" hidden></button>

      <section class="viewport-wrap" aria-label="可交互三维校园白模">
        <canvas id="map-canvas"></canvas>
        <div id="map-markers" class="map-markers" aria-label="地图地点标记"></div>
        <div class="canvas-header">
          <div><span class="canvas-kicker">JINNAN / V0</span><strong id="mode-note">北上 · 东右 · 简化体块</strong></div>
          <button id="help-button" class="round-button" aria-label="查看操作说明">?</button>
        </div>
        <button id="compass" class="compass" aria-label="恢复朝北，保留当前位置和缩放"><i id="compass-arrow">▲</i><strong>N</strong></button>
        <div class="map-actions" aria-label="地图操作">
          <button id="zoom-in" aria-label="放大地图">+</button>
          <button id="zoom-out" aria-label="缩小地图">−</button>
          <button id="map-panel-toggle" class="layers-button" aria-expanded="false" aria-controls="map-panel-controls" aria-label="图层和地图设置"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/></svg></button>
          <button id="north-up" aria-label="复位北向">N</button>
          <button id="rotate-left" aria-label="向左旋转视角">↶</button>
          <button id="rotate-right" aria-label="向右旋转视角">↷</button>
          <button id="tilt-view" aria-label="切换俯视或斜视">俯</button>
        </div>
        <button id="reset-view" class="map-overview" aria-label="回到全校视图" title="回到全校视图"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5M8 8h8v8H8Z"/></svg><span>全校视图</span></button>
        <div id="render-stats" class="render-stats" aria-live="polite">正在初始化场景…</div>
        <div class="map-attribution"><a href="${import.meta.env.BASE_URL}credits.html">© OpenStreetMap contributors · ODbL</a><span>试验模型 · 不用于精确导航</span></div>
        <div id="map-status" class="map-status" role="status"><span class="map-spinner"></span><strong>正在准备校园地图</strong><span>首次加载精细建筑可能需要几秒钟</span></div>
        <div id="selection-card" class="selection-card is-empty" aria-live="polite">
          <p class="selection-kicker">SELECT A PLACE</p>
          <h2>探索校园体量</h2>
          <p>单指平移，双指捏合缩放、扭转转向、上下滑动倾斜。点击建筑查看试验数据。</p>
        </div>
        <div id="help-popover" class="help-popover" hidden>
          <strong>操作方式</strong>
          <p>手机单指平移，双指捏合缩放、扭转转向、上下滑动调整俯仰；电脑左键旋转、右键平移。</p>
        </div>
      </section>
    </section>
  </main>
`
const mapUI = installMapUI(campusModel)

function hasWebGL() {
  try {
    const probe = document.createElement('canvas')
    const context = probe.getContext('webgl2')
    const available = Boolean(context)
    return available
  } catch {
    return false
  }
}

function createRenderer(canvas: HTMLCanvasElement) {
  try {
    return new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      // 校园白模由许多近平面的图层组成；启用对数深度缓冲，减少远景闪烁。
      logarithmicDepthBuffer: true
    })
  } catch {
    return null
  }
}

function renderFallback(reason = '设备不支持 WebGL2') {
  const viewport = root?.querySelector<HTMLElement>('.viewport-wrap')
  if (!viewport) return
  const flatMap = createFlatMap(viewport, campusModel, building => mapUI.showBuilding(building), () => mapUI.clearSelection(), () => mapUI.markerBuildings())
  mapUI.ready('2d', reason)
  mapUI.bind(flatMap)
  document.getElementById('render-stats')!.textContent = `${campusModel.buildings.length} 个建筑 / 地标 · 2D`
  Object.assign(window, { campusMapLab: { mode: '2d', campusModel, places:mapUI.catalog, selectBuilding: flatMap.selectBuilding, resetView: flatMap.resetView, selected: flatMap.selected } })
}

if (pageParams.get('mode') === '2d' || !hasWebGL()) {
  renderFallback(pageParams.get('mode') === '2d' ? '二维浏览模式' : '设备不支持 WebGL2')
} else {
try {

const canvas = element<HTMLCanvasElement>('map-canvas')
const renderStats = element<HTMLDivElement>('render-stats')
const viewport = canvas.parentElement as HTMLElement

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing element: ${id}`)
  return value as T
}

function squareFootprint(points: Point[]): THREE.Shape {
  const shape = new THREE.Shape()
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  })
  shape.closePath()
  return shape
}

function areaGeometry(area: Area) {
  const geometry = new THREE.ShapeGeometry(squareFootprint(area.polygon))
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function roadGeometry(road: Road, widthScale = 1): THREE.BufferGeometry {
  const vertices: number[] = []
  const indices: number[] = []
  roadEdgePoints(road, widthScale).forEach(([left, right], index) => {
    vertices.push(left[0], 0.18, left[1], right[0], 0.18, right[1])
    if (index > 0) {
      const base = index * 2
      // 顶视相机在 +Y 一侧；三角面必须使用逆时针绕序，法线才会朝上。
      // 原绕序会令道路朝地底，因背面剔除而只偶尔露出异常细线。
      indices.push(base - 2, base, base - 1, base - 1, base, base + 1)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

const categoryColors: Record<BuildingCategory, number> = {
  academic: 0xe6ded1,
  library: 0xd5b99a,
  service: 0xdcd3c4,
  residence: 0xd7cec0,
  sport: 0xcab18d,
  landmark: 0xc58c62
}

const renderer = createRenderer(canvas)
if (!renderer) {
  renderFallback('三维渲染无法初始化')
} else {
const activeRenderer = renderer
let renderDirty = true
let totalRenderedFrames = 0
activeRenderer.shadowMap.enabled = false
activeRenderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.background = new THREE.Color(MAP_THEME.base)
scene.fog = new THREE.Fog(MAP_THEME.base, 1750, 4000)

const modelBounds = campusModel.meta.bounds
const mapCenter = new THREE.Vector3(
  (modelBounds.minX + modelBounds.maxX) / 2,
  0,
  (modelBounds.minZ + modelBounds.maxZ) / 2
)
const defaultCameraOffset = new THREE.Vector3(0, 1500, 1765)
const mapMinDistance = 24
// 近远裁剪面不要过宽，否则远景的水面、绿地与道路会出现深度争夺。
const camera = new THREE.PerspectiveCamera(40, 1, .5, 6000)
camera.position.copy(mapCenter).add(defaultCameraOffset)
const mapRendering = createMapRendering(activeRenderer, scene, camera)
const renderQuality = element<HTMLSelectElement>('render-quality')
renderQuality.addEventListener('change', () => { mapRendering.setQuality(renderQuality.value === 'battery' ? 'battery' : 'clear'); renderDirty = true })
const controls = new OrbitControls(camera, activeRenderer.domElement)
configureMapControls(controls)
controls.minDistance = mapMinDistance
controls.maxDistance = 3200
controls.enablePan = true
controls.target.copy(mapCenter)
// Polar-angle limits alone cannot stop screen-space panning below the ground.
controls.addEventListener('change', () => { constrainMapCamera(camera, controls, modelBounds); renderDirty = true })
const detailManager = new MapDetailManager()
detailManager.mode = pageParams.get('detail') === 'full' ? 'full' : 'auto'
const detailMode = element<HTMLSelectElement>('detail-mode')
detailMode.value = detailManager.mode
detailMode.addEventListener('change', () => {
  detailManager.mode = detailMode.value === 'full' ? 'full' : 'auto'
  const url = new URL(location.href)
  if (detailManager.mode === 'full') url.searchParams.set('detail', 'full')
  else url.searchParams.delete('detail')
  history.replaceState(null, '', url)
  renderDirty = true
})

scene.add(new THREE.HemisphereLight(0xfffbf1, 0x83978a, 2.8))
const sunlight = new THREE.DirectionalLight(0xfff6e7, 1.7)
sunlight.position.set(-600, 1700, 950)
scene.add(sunlight)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry((modelBounds.maxX - modelBounds.minX) + 650, (modelBounds.maxZ - modelBounds.minZ) + 650),
  new THREE.MeshBasicMaterial({ color: MAP_THEME.base })
)
ground.rotation.x = -Math.PI / 2
// 底板与导入模型共用同一套 bounds，坐标轴转换后不会再发生南北错位。
ground.position.set(mapCenter.x, -0.65, mapCenter.z)
scene.add(ground)

const landscapeGroup = new THREE.Group()
const roadGroup = new THREE.Group()
const buildingGroup = new THREE.Group()
let labelsVisible = true
scene.add(landscapeGroup, roadGroup, buildingGroup)
const sportsGrounds = createGymSportsGrounds(campusModel)
landscapeGroup.add(sportsGrounds)
const scienceSportsGrounds = createScienceSportsGrounds(campusModel)
landscapeGroup.add(scienceSportsGrounds)
const scienceCourtGrounds = createScienceCourtGrounds(campusModel)
landscapeGroup.add(scienceCourtGrounds)
const lakesidePavilion = createLakesidePavilion()
landscapeGroup.add(lakesidePavilion)

const water = campusModel.greens.filter((area) => area.kind === 'water')
const greens = campusModel.greens.filter((area) => area.kind === 'green')
const plazas = campusModel.greens.filter((area) => area.kind === 'plaza')
function addMergedAreas(areas: Area[], color: number, y: number, opacity = 1) {
  if (!areas.length) return
  const geometries = areas.map(areaGeometry)
  const geometry = mergeGeometries(geometries, false)
  geometries.forEach((item) => item.dispose())
  if (!geometry) return
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    // 水体与下方绿地重叠时不抢占深度，避免远处半透明面闪烁。
    depthWrite: opacity === 1
  }))
  mesh.position.y = y
  landscapeGroup.add(mesh)
}
function addMergedRoads(kind: Road['kind'], surfaceColor: number, edgeColor: number) {
  const roads = campusModel.roads.filter((road) => road.kind === kind)
  const edgeGeometries = roads.map((road) => roadGeometry(road, ROAD_PROFILE.edgeScale))
  const surfaceGeometries = roads.map((road) => roadGeometry(road, ROAD_PROFILE.surfaceScale))
  // OSM 的道路标签未必覆盖每一种内部分类；空集合不能交给
  // BufferGeometryUtils 合并，否则其内部会读取不存在的首项而中断场景初始化。
  if (!edgeGeometries.length) return
  const edgeGeometry = mergeGeometries(edgeGeometries, false)
  const surfaceGeometry = mergeGeometries(surfaceGeometries, false)
  edgeGeometries.forEach((item) => item.dispose())
  surfaceGeometries.forEach((item) => item.dispose())
  if (!edgeGeometry || !surfaceGeometry) return
  const edge = new THREE.Mesh(edgeGeometry, new THREE.MeshBasicMaterial({ color: edgeColor, transparent: true, opacity: .82 }))
  const surface = new THREE.Mesh(surfaceGeometry, new THREE.MeshBasicMaterial({ color: surfaceColor }))
  // 高于绿地和底板，避免远景时被深度缓冲和浅色底图吞没。
  edge.position.y = .46
  surface.position.y = .52
  edge.renderOrder = 2
  surface.renderOrder = 3
  roadGroup.add(edge, surface)
}
addMergedAreas(greens, 0xb8d0a0, 0.04)
addMergedAreas(plazas, 0xe9e2d5, 0.12)
addMergedAreas(water, 0xadcbd6, 0.24)
// 增加道路与底板的明度差；边缘用于在远景下保留清晰的路网结构。
addMergedRoads('primary', 0xeee9e1, 0xc5bbaa)
addMergedRoads('secondary', 0xeee9e1, 0xc5bbaa)
addMergedRoads('walkway', 0xe6dbc8, 0xc9b798)

// 仅在用户指定的东部沙色空地按宽间距布置统一松树林；运动区整体留空。
const reservedSportsBounds = [sportsGrounds, scienceSportsGrounds, scienceCourtGrounds].map(group => {
  const bounds = new THREE.Box3().setFromObject(group)
  return { minX: bounds.min.x - 5, maxX: bounds.max.x + 5, minZ: bounds.min.z - 5, maxZ: bounds.max.z + 5 }
})
const easternPineTrees = createEasternRowTrees(campusModel, reservedSportsBounds)
landscapeGroup.add(easternPineTrees, createEasternPlantedGround(campusModel, reservedSportsBounds, easternPineTrees.userData.layout.sites))

const buildingMeshes = new Map<string, THREE.Mesh>()
const libraryMaterials = {
  brick: new THREE.MeshLambertMaterial({ color: 0x9c6249 }),
  brickDark: new THREE.MeshLambertMaterial({ color: 0x613d37 }),
  sideGlass: new THREE.MeshLambertMaterial({ color: 0x30343a }),
  sideRib: new THREE.MeshLambertMaterial({ color: 0x292b30 }),
  stone: new THREE.MeshLambertMaterial({ color: 0xe5dfd2 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x314754 }),
  glassSoft: new THREE.MeshLambertMaterial({ color: 0x607886 }),
  step: new THREE.MeshLambertMaterial({ color: 0xcac2b4 }),
  brass: new THREE.MeshLambertMaterial({ color: 0xc68c59 })
}

function makeBox(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, y, z)
  return mesh
}

function makeRoundedPrism(width: number, depth: number, height: number, radius: number, material: THREE.Material, x: number, y: number, z: number) {
  const halfWidth = width * .5
  const halfDepth = depth * .5
  const corner = Math.min(radius, halfWidth, halfDepth)
  const shape = new THREE.Shape()
  shape.moveTo(-halfWidth + corner, -halfDepth)
  shape.lineTo(halfWidth - corner, -halfDepth)
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + corner)
  shape.lineTo(halfWidth, halfDepth - corner)
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - corner, halfDepth)
  shape.lineTo(-halfWidth + corner, halfDepth)
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - corner)
  shape.lineTo(-halfWidth, -halfDepth + corner)
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + corner, -halfDepth)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, curveSegments: 5, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  return mesh
}

/**
 * 低面数四坡屋顶。相比把一个方锥直接压扁，保留屋脊会更接近木斋图书馆
 * 两翼与前厅的红瓦屋面，也能让斜视角有清楚的建筑轮廓。
 */
function makeHipRoof(width: number, depth: number, height: number, material: THREE.Material, x: number, y: number, z: number, ridgeRatio = .48) {
  const halfWidth = width * .5
  const halfDepth = depth * .5
  const halfRidge = width * ridgeRatio * .5
  const vertices = [
    -halfWidth, 0, -halfDepth, halfWidth, 0, -halfDepth, halfWidth, 0, halfDepth, -halfWidth, 0, halfDepth,
    -halfRidge, height, 0, halfRidge, height, 0
  ]
  const indices = [
    // 前坡、后坡、左右端的斜坡；绕序使法线均朝外。
    0, 4, 1, 1, 4, 5,
    3, 2, 4, 2, 5, 4,
    0, 3, 4,
    1, 5, 2
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const roof = new THREE.Mesh(geometry, material)
  roof.position.set(x, y, z)
  return roof
}

function makePediment(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
  const shape = new THREE.Shape()
  shape.moveTo(-width * .5, -height * .5)
  shape.lineTo(width * .5, -height * .5)
  shape.lineTo(0, height * .5)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geometry.translate(0, 0, -depth * .5)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  return mesh
}

// 直接从用户提供的校徽图片提取印色作为透明度，保留原图的中英文字、
// 1919、双圆环和中央线条；白色区域透明，露出后面的砖色墙面。
const libraryEmblemMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  alphaTest: .02
})
const emblemSource = new Image()
emblemSource.onload = () => {
  const canvas = document.createElement('canvas')
  canvas.width = emblemSource.naturalWidth
  canvas.height = emblemSource.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  context.drawImage(emblemSource, 0, 0)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < image.data.length; index += 4) {
    const ink = Math.min(image.data[index], image.data[index + 2]) - image.data[index + 1]
    const alpha = Math.max(0, Math.min(1, (ink - 4) / 50))
    image.data[index] = 181
    image.data[index + 1] = 127
    image.data[index + 2] = 78
    image.data[index + 3] = Math.round(alpha * 255)
  }
  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(8, activeRenderer.capabilities.getMaxAnisotropy())
  libraryEmblemMaterial.map = texture
  libraryEmblemMaterial.opacity = 1
  libraryEmblemMaterial.needsUpdate = true
  renderDirty = true
}
emblemSource.src = `${import.meta.env.BASE_URL}nankai-emblem-source.png`

/**
 * 图书馆是第一个精细化地标；校徽使用用户提供的原图轮廓，
 * 其余建筑体量保持低面数、可维护的地图式模型。
 */
function createCentralLibraryLandmark(building: Building) {
  const xs = building.footprint.map(([x]) => x)
  const zs = building.footprint.map(([, z]) => z)
  const width = Math.max(...xs) - Math.min(...xs)
  const depth = Math.max(...zs) - Math.min(...zs)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2
  const first = building.footprint[0]
  const far = building.footprint[2]
  const rotation = Math.atan2(-(far[1] - first[1]), far[0] - first[0])
  const group = new THREE.Group()
  group.name = '中心图书馆 · 精细地标'
  group.position.set(centerX, 1.22, centerZ)
  group.rotation.y = rotation
  // 苹果地图式地标会做轻微纵向夸张，使宽阔校园中的公共建筑更有辨识度；
  // 平面尺寸与正背立面结构不变，仅将高度抬升约 18%。
  group.scale.y = 1.18

  // 主楼的前后进深与玻璃幕墙对齐；此前主体缩短而幕墙仍沿外轮廓，
  // 从俯视角会形成不应存在的空带。
  const bodyDepth = depth
  const mainWidth = width * .96
  const podiumHeight = 4.8
  const mainHeight = 15.6
  const mainCenter = podiumHeight + mainHeight * .5

  // 参考图中的量体分为低层外挑窗翼、横向砖色主楼与顶部砖色悬挑阅览体。
  group.add(makeBox(mainWidth, podiumHeight, bodyDepth, libraryMaterials.glass, 0, podiumHeight * .5, 0))
  group.add(makeBox(mainWidth, mainHeight, bodyDepth, libraryMaterials.brick, 0, mainCenter, 0))

  // 根据用户确认，南北立面是同一套设计。这个函数将入口、两端低层翼部、
  // 中央圆形位和竖向遮阳片完整复制到前后两侧，而不是只镜像其中一部分。
  const addMainFacade = (side: -1 | 1) => {
    const facadeZ = side * (depth * .5 + .52)
    const detailZ = side * (depth * .5 + 1.15)
    const finGeometry = new THREE.BoxGeometry(1.52, 14.45, 1.18)
    const finCount = 34
    const fins = new THREE.InstancedMesh(finGeometry, libraryMaterials.brick, finCount)
    const finMatrix = new THREE.Matrix4()
    const centralGap = width * .215
    let finIndex = 0

    // 主楼外侧的整幅深色窗带及密集竖向遮阳片。
    group.add(makeBox(width * .92, 13.65, .88, libraryMaterials.glass, 0, 12.62, facadeZ))
    for (const half of [-1, 1]) {
      for (let index = 0; index < finCount / 2; index += 1) {
        const unit = (index + .5) / (finCount / 2)
        const x = half * (centralGap * .5 + unit * (width * .47 - centralGap * .5))
        finMatrix.makeTranslation(x, 12.72, detailZ)
        fins.setMatrixAt(finIndex, finMatrix)
        finIndex += 1
      }
    }
    fins.instanceMatrix.needsUpdate = true
    group.add(fins)
    group.add(makeBox(centralGap, 12.85, 1.26, libraryMaterials.brickDark, 0, 12.85, detailZ))

    const emblem = new THREE.Mesh(new THREE.PlaneGeometry(11.75, 11.65), libraryEmblemMaterial)
    emblem.rotation.y = side === -1 ? Math.PI : 0
    emblem.position.set(0, 13.35, side * (depth * .5 + 1.86))
    group.add(emblem)

    const wingWidth = width * .285
    // 白框下的低层整体向外挑出，形成参考图中明显的前后层次。
    // 与主楼外墙共面会既看不出凸出关系，也容易产生深度频闪。
    const wingProjection = depth * .075
    const wingDepth = depth * .3
    const wingOffset = width * .33
    const wingCenterZ = side * (depth * .5 + wingProjection - wingDepth * .5)
    const wingFaceZ = side * (depth * .5 + wingProjection + .36)
    // 下层中部入口与两侧窗翼处在同一条向外挑出的立面线上。
    group.add(makeBox(width * .34, 3.45, .82, libraryMaterials.glass, 0, 2.38, wingFaceZ))
    group.add(makeBox(width * .48, .52, 4.7, libraryMaterials.stone, 0, 5.05, side * (depth * .5 + wingProjection + 2.05)))
    for (const wing of [-1, 1] as const) {
      const wingX = wing * wingOffset
      // 低层体块与玻璃立面对齐，并向主楼外挑出稳定的距离。
      group.add(makeBox(wingWidth, 4.75, wingDepth, libraryMaterials.brick, wingX, 2.375, wingCenterZ))
      group.add(makeBox(wingWidth * .87, 2.75, .78, libraryMaterials.glass, wingX, 2.46, wingFaceZ))
      group.add(makeBox(wingWidth * 1.04, .5, 1.12, libraryMaterials.stone, wingX, 4.98, side * (depth * .5 + wingProjection + .55)))

      const lowerFinGeometry = new THREE.BoxGeometry(.72, 3.3, .88)
      const lowerFins = new THREE.InstancedMesh(lowerFinGeometry, libraryMaterials.brickDark, 12)
      for (let index = 0; index < 12; index += 1) {
        const x = wingX - wingWidth * .39 + index * (wingWidth * .78 / 11)
        finMatrix.makeTranslation(x, 2.5, side * (depth * .5 + wingProjection + .8))
        lowerFins.setMatrixAt(index, finMatrix)
      }
      lowerFins.instanceMatrix.needsUpdate = true
      group.add(lowerFins)

      const doorX = wingX + wing * wingWidth * .37
      group.add(makeBox(wingWidth * .14, 2.6, .95, libraryMaterials.brickDark, doorX, 1.65, side * (depth * .5 + wingProjection + .9)))
    }

    // 广场和六级台阶也随立面对称，确保从北侧靠近时并非“背面”。
    group.add(makeBox(width * .62, .18, 15, libraryMaterials.step, 0, .08, side * (depth * .5 + 8.5)))
    for (let index = 0; index < 6; index += 1) {
      const elevation = .18 + index * .28
      // 台阶止于两侧低层翼部之间，避免和挑出的窗翼发生体量穿插。
      group.add(makeBox(width * (.3 + index * .013), elevation, 2.1, libraryMaterials.step, 0, elevation * .5, side * (depth * .5 + 6.2 - index * 1.18)))
    }
  }
  addMainFacade(-1)
  addMainFacade(1)

  // 主楼侧面采用参考近景中的暖砖竖柱片，后退的深色玻璃形成细窗槽；
  // 两处较宽的玻璃带留出清晰的分段，避免侧墙成为均匀的条纹。
  const addSideFacade = (side: -1 | 1) => {
    const sideFaceX = side * (mainWidth * .5 + .19)
    const sideRibX = side * (mainWidth * .5 + .72)
    const sideBandDepth = bodyDepth * .82
    group.add(makeBox(.42, 13.75, sideBandDepth, libraryMaterials.sideGlass, sideFaceX, 12.7, 0))

    const pierSlotCount = 18
    const broadWindowSlots = new Set([4, 12])
    const pierGeometry = new THREE.BoxGeometry(1.4, 14.4, 1.78)
    const brickPiers = new THREE.InstancedMesh(pierGeometry, libraryMaterials.brick, pierSlotCount - broadWindowSlots.size)
    const sideMatrix = new THREE.Matrix4()
    let pierIndex = 0
    for (let index = 0; index < pierSlotCount; index += 1) {
      if (broadWindowSlots.has(index)) continue
      const z = -sideBandDepth * .48 + index * (sideBandDepth * .96 / (pierSlotCount - 1))
      sideMatrix.makeTranslation(sideRibX, 12.72, z)
      brickPiers.setMatrixAt(pierIndex, sideMatrix)
      pierIndex += 1
    }
    brickPiers.instanceMatrix.needsUpdate = true
    group.add(brickPiers)

    // 宽窗里的少量横向窗格对应照片中的多层玻璃，仍保持低面数。
    for (const slot of broadWindowSlots) {
      const z = -sideBandDepth * .48 + slot * (sideBandDepth * .96 / (pierSlotCount - 1))
      for (const y of [8.7, 12.1, 15.5, 18.8]) {
        group.add(makeBox(.56, .22, 3.7, libraryMaterials.sideRib, side * (mainWidth * .5 + .5), y, z))
      }
    }

    // 主体下缘、架空玻璃基座与浅色水平挑檐对应照片的三层侧向轮廓。
    group.add(makeBox(1.35, .66, bodyDepth * .89, libraryMaterials.brickDark, side * (mainWidth * .5 + .62), 5.42, 0))
    group.add(makeBox(.52, 3.4, bodyDepth * .78, libraryMaterials.glass, sideFaceX, 2.38, 0))
    group.add(makeBox(2.6, .5, bodyDepth * .86, libraryMaterials.stone, side * (mainWidth * .5 + 1.12), 4.95, 0))
    const lowerColumns = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, 3.5, 1.12), libraryMaterials.brick, 9)
    for (let index = 0; index < 9; index += 1) {
      const z = -bodyDepth * .35 + index * (bodyDepth * .7 / 8)
      sideMatrix.makeTranslation(side * (mainWidth * .5 + .58), 2.36, z)
      lowerColumns.setMatrixAt(index, sideMatrix)
    }
    lowerColumns.instanceMatrix.needsUpdate = true
    group.add(lowerColumns)
  }
  addSideFacade(-1)
  addSideFacade(1)

  // 顶部以白天参考图为准：浅色悬挑外框包住连续的深色窗带。
  // 夜景照片的暖色来自光线，不作为这一层的材料颜色。
  const topWidth = width * .61
  const topDepth = depth * .44
  const topCenter = 25.6
  group.add(makeBox(topWidth * 1.08, .72, topDepth * 1.14, libraryMaterials.brickDark, 0, 20.95, 0))
  group.add(makeBox(topWidth, 7.6, topDepth, libraryMaterials.stone, 0, topCenter, 0))
  const topFinGeometry = new THREE.BoxGeometry(1.05, 4.25, .68)
  const topFinMatrix = new THREE.Matrix4()
  for (const side of [-1, 1] as const) {
    const windowZ = side * (topDepth * .5 + .12)
    group.add(makeBox(topWidth * .88, 3.95, .42, libraryMaterials.glass, 0, 25.58, windowZ))
    const topFins = new THREE.InstancedMesh(topFinGeometry, libraryMaterials.sideRib, 22)
    for (let index = 0; index < 22; index += 1) {
      const x = -topWidth * .41 + index * (topWidth * .82 / 21)
      topFinMatrix.makeTranslation(x, 25.58, side * (topDepth * .5 + .48))
      topFins.setMatrixAt(index, topFinMatrix)
    }
    topFins.instanceMatrix.needsUpdate = true
    group.add(topFins)
  }
  for (const side of [-1, 1] as const) {
    const topSideX = side * (topWidth * .5 + .17)
    group.add(makeBox(.42, 3.75, topDepth * .82, libraryMaterials.sideGlass, topSideX, 25.58, 0))
    const sideTopFins = new THREE.InstancedMesh(new THREE.BoxGeometry(.92, 4.05, .7), libraryMaterials.sideRib, 17)
    for (let index = 0; index < 17; index += 1) {
      const z = -topDepth * .39 + index * (topDepth * .78 / 16)
      topFinMatrix.makeTranslation(side * (topWidth * .5 + .56), 25.58, z)
      sideTopFins.setMatrixAt(index, topFinMatrix)
    }
    sideTopFins.instanceMatrix.needsUpdate = true
    group.add(sideTopFins)
  }
  group.add(makeBox(topWidth * 1.05, .7, topDepth * 1.08, libraryMaterials.stone, 0, 29.75, 0))

  return group
}

function createMuzhaiBrickTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 80
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#ad5b48'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = 'rgba(93, 47, 40, .34)'
  context.lineWidth = 1
  const courseHeight = 16
  const brickWidth = 32
  for (let y = 0; y <= canvas.height; y += courseHeight) {
    context.beginPath()
    context.moveTo(0, y + .5)
    context.lineTo(canvas.width, y + .5)
    context.stroke()
    const offset = (y / courseHeight) % 2 ? brickWidth * .5 : 0
    for (let x = -brickWidth + offset; x <= canvas.width + brickWidth; x += brickWidth) {
      context.beginPath()
      context.moveTo(x + .5, y)
      context.lineTo(x + .5, y + courseHeight)
      context.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5.5, 3.5)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(6, activeRenderer.capabilities.getMaxAnisotropy())
  return texture
}

const muzhaiBrickTexture = createMuzhaiBrickTexture()
const muzhaiMaterials = {
  brick: new THREE.MeshLambertMaterial({ color: 0xffffff, map: muzhaiBrickTexture ?? undefined }),
  brickDark: new THREE.MeshLambertMaterial({ color: 0x783e35 }),
  roof: new THREE.MeshLambertMaterial({ color: 0xb95743 }),
  roofTile: new THREE.MeshLambertMaterial({ color: 0xa64c3d }),
  stone: new THREE.MeshLambertMaterial({ color: 0xe7dfd1 }),
  stoneShadow: new THREE.MeshLambertMaterial({ color: 0xcfc6b7 }),
  window: new THREE.MeshLambertMaterial({ color: 0x355363 }),
  windowFrame: new THREE.MeshLambertMaterial({ color: 0xf2eee4 }),
  door: new THREE.MeshLambertMaterial({ color: 0x2c3030 }),
  doorWood: new THREE.MeshLambertMaterial({ color: 0x7c4a32 }),
  metal: new THREE.MeshLambertMaterial({ color: 0x444849 }),
  step: new THREE.MeshLambertMaterial({ color: 0xd1c8ba })
}

const siyuanMaterials = {
  brick: new THREE.MeshLambertMaterial({ color: 0xfff8f2, map: muzhaiBrickTexture ?? undefined }),
  brickDark: new THREE.MeshLambertMaterial({ color: 0x8d493e }),
  stone: new THREE.MeshLambertMaterial({ color: 0xeee9df }),
  stoneShadow: new THREE.MeshLambertMaterial({ color: 0xd2cbc0 }),
  roof: new THREE.MeshLambertMaterial({ color: 0xe2e3df }),
  window: new THREE.MeshLambertMaterial({ color: 0x3d5966 }),
  frame: new THREE.MeshLambertMaterial({ color: 0xf5f1e8 }),
  door: new THREE.MeshLambertMaterial({ color: 0x52362f }),
  step: new THREE.MeshLambertMaterial({ color: 0xd5d0c6 })
}

const xiushanMaterials = {
  brick: new THREE.MeshLambertMaterial({ color: 0xfffaf5, map: muzhaiBrickTexture ?? undefined }),
  brickDark: new THREE.MeshLambertMaterial({ color: 0x8f4035 }),
  stone: new THREE.MeshLambertMaterial({ color: 0xe9e4d9 }),
  cornerStone: new THREE.MeshLambertMaterial({ color: 0xe9e4d9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  stoneShadow: new THREE.MeshLambertMaterial({ color: 0xcac3b7 }),
  roof: new THREE.MeshLambertMaterial({ color: 0xdedfdc }),
  window: new THREE.MeshLambertMaterial({ color: 0x476575 }),
  frame: new THREE.MeshLambertMaterial({ color: 0xf3efe5 }),
  door: new THREE.MeshLambertMaterial({ color: 0x664239 }),
  step: new THREE.MeshLambertMaterial({ color: 0xcfcbc2 })
}

function createDatongScreenTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 768
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.fillStyle = '#f4f4f1'
  context.fillRect(0, 0, canvas.width, canvas.height)

  // 参考图不是均匀圆点，而是六边形板块中嵌套三角形开孔；孔洞密度呈
  // 斑块状变化。先画浅灰蜂窝分缝，再真正清除三角区域的 alpha。
  const cellX = 48
  const cellY = 42
  for (let row = -2; row < 21; row += 1) {
    for (let column = -2; column < 19; column += 1) {
      const seed = row * 43 + column * 71
      const x = column * cellX + (row % 2) * cellX * .5 + Math.sin(seed * 1.13) * 4.5
      const y = row * cellY + Math.cos(seed * .91) * 3.5
      const radius = 24 + (Math.abs(seed) % 5) * 1.15
      const rotation = (seed % 9) * .035

      context.strokeStyle = 'rgba(170, 177, 176, .76)'
      context.lineWidth = 2.4
      context.beginPath()
      for (let point = 0; point < 6; point += 1) {
        const angle = rotation + point * Math.PI / 3
        const px = x + Math.cos(angle) * radius
        const py = y + Math.sin(angle) * radius
        if (point === 0) context.moveTo(px, py)
        else context.lineTo(px, py)
      }
      context.closePath()
      context.stroke()

      const density = Math.sin(column * .46 + row * .22) + Math.cos(row * .38 - column * .31)
      const apertureCount = density > 1.05 ? 6 : density > .35 ? 4 : density > -.45 ? 2 : (Math.abs(seed) % 5 === 0 ? 1 : 0)
      context.save()
      context.globalCompositeOperation = 'destination-out'
      for (let sector = 0; sector < 6; sector += 1) {
        const open = Math.abs(seed + sector * 17) % 6 < apertureCount
        if (!open) continue
        const angle = rotation + sector * Math.PI / 3
        const inner = radius * .23
        const outer = radius * .78
        context.beginPath()
        context.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner)
        context.lineTo(x + Math.cos(angle - .23) * outer, y + Math.sin(angle - .23) * outer)
        context.lineTo(x + Math.cos(angle + .23) * outer, y + Math.sin(angle + .23) * outer)
        context.closePath()
        context.fill()
      }
      context.restore()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1.35, 1.35)
  texture.anisotropy = Math.min(8, activeRenderer.capabilities.getMaxAnisotropy())
  return texture
}

const datongScreenTexture = createDatongScreenTexture()
const datongMaterials = {
  screen: new THREE.MeshLambertMaterial({ color: 0xffffff, map: datongScreenTexture, alphaTest: .34, side: THREE.DoubleSide }),
  edge: new THREE.MeshLambertMaterial({ color: 0xf3f1eb }),
  glass: new THREE.MeshLambertMaterial({ color: 0x30454d }),
  glassSoft: new THREE.MeshLambertMaterial({ color: 0x526c73 }),
  frame: new THREE.MeshLambertMaterial({ color: 0xd8dedb }),
  roof: new THREE.MeshLambertMaterial({ color: 0xc8c5bd }),
  courtyard: new THREE.MeshLambertMaterial({ color: 0xd8d4c7 }),
  garden: new THREE.MeshLambertMaterial({ color: 0x879877 }),
  pond: new THREE.MeshPhongMaterial({ color: 0x8fb7be, specular: 0xc5d8d7, shininess: 65 }),
  paving: new THREE.MeshLambertMaterial({ color: 0xd1cfc2 }),
  lakeGlass: new THREE.MeshLambertMaterial({ color: 0x6f8586, emissive: 0x443b23, emissiveIntensity: .12 })
}

const gymMaterials = {
  brick: new THREE.MeshLambertMaterial({ color: 0xffddd4, map: muzhaiBrickTexture ?? undefined }),
  brickDark: new THREE.MeshLambertMaterial({ color: 0x78443d }),
  band: new THREE.MeshLambertMaterial({ color: 0xd8d1c4 }),
  bandShadow: new THREE.MeshLambertMaterial({ color: 0xbeb8ad }),
  glass: new THREE.MeshLambertMaterial({ color: 0x304d5b }),
  glassSoft: new THREE.MeshLambertMaterial({ color: 0x52707d }),
  frame: new THREE.MeshLambertMaterial({ color: 0x9ca9aa }),
  roof: new THREE.MeshLambertMaterial({ color: 0xd7d8d4 }),
  roofDark: new THREE.MeshLambertMaterial({ color: 0xaeb2b0 }),
  door: new THREE.MeshLambertMaterial({ color: 0x253a43 }),
  step: new THREE.MeshLambertMaterial({ color: 0xcfcbc2 })
}

const businessMaterials = {
  brick: new THREE.MeshLambertMaterial({ color: 0xffefe3, map: muzhaiBrickTexture ?? undefined }),
  stone: new THREE.MeshLambertMaterial({ color: 0xded8cb }),
  roof: new THREE.MeshLambertMaterial({ color: 0xd5d7d1 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x3e5965 }),
  frame: new THREE.MeshLambertMaterial({ color: 0xc9c8bc }),
  paving: new THREE.MeshLambertMaterial({ color: 0xc9bca5 }),
  lawn: new THREE.MeshLambertMaterial({ color: 0x82986d })
}

/**
 * 木斋图书馆：按用户提供的混元模型结构组织为“横向长翼 + 南侧前伸门厅”。
 * 红砖、白色台基/檐线、两组四坡屋面与后置中央圆顶均独立成层，
 * 在保持建筑识别特征的同时控制网格数量与场景负担。
 */
function createMuzhaiLibraryLandmark(building: Building) {
  const first = building.footprint[0]
  const second = building.footprint[1]
  const centerX = building.footprint.reduce((total, [x]) => total + x, 0) / building.footprint.length
  const centerZ = building.footprint.reduce((total, [, z]) => total + z, 0) / building.footprint.length
  // 第一条长边就是两翼的横向轴；转换至局部坐标后可直接沿真实朝向搭建。
  const rotation = Math.atan2(-(second[1] - first[1]), second[0] - first[0])
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const footprint = building.footprint.map(([x, z]) => {
    const dx = x - centerX
    const dz = z - centerZ
    return [cosine * dx - sine * dz, sine * dx + cosine * dz] as Point
  })
  const minX = Math.min(...footprint.map(([x]) => x))
  const maxX = Math.max(...footprint.map(([x]) => x))
  const minZ = Math.min(...footprint.map(([, z]) => z))
  const maxZ = Math.max(...footprint.map(([, z]) => z))
  const width = maxX - minX
  const depth = maxZ - minZ
  const group = new THREE.Group()
  group.name = '木斋图书馆 · 精细地标'
  group.position.set(centerX, 1.22, centerZ)
  group.rotation.y = rotation

  // 以用户提供的混元模型为结构参考：一座横向长翼，南侧是独立前伸门厅，
  // 圆顶塔楼后置在两组屋顶的咬合处。整个模型仍为轻量程序化体块。
  const wingDepth = depth * .50
  const wingCenterZ = maxZ - wingDepth * .5
  const frontWidth = width * .37
  const frontDepth = depth * .51
  const frontCenterX = width * .012
  const frontCenterZ = minZ + frontDepth * .5
  const wingFrontZ = wingCenterZ - wingDepth * .5
  const baseHeight = 1.05
  const wingHeight = 11.6
  // 门厅略高于长翼，塔楼负责真正的竖向中心。
  const frontHeight = 13.45
  const wingTop = baseHeight + wingHeight
  const frontTop = baseHeight + frontHeight

  // 两块浅色台基严格贴合原有的非矩形轮廓，避免精细体量漂离可点击底板。
  group.add(makeBox(width * 1.01, baseHeight, wingDepth * 1.02, muzhaiMaterials.stone, 0, baseHeight * .5, wingCenterZ))
  group.add(makeBox(frontWidth * 1.05, baseHeight, frontDepth * 1.02, muzhaiMaterials.stone, frontCenterX, baseHeight * .5, frontCenterZ))
  group.add(makeBox(width, wingHeight, wingDepth, muzhaiMaterials.brick, 0, baseHeight + wingHeight * .5, wingCenterZ))
  group.add(makeBox(frontWidth, frontHeight, frontDepth, muzhaiMaterials.brick, frontCenterX, baseHeight + frontHeight * .5, frontCenterZ))

  // 白色基础线、宽檐与红瓦四坡屋面，是照片中最显著的古典学院派比例。
  group.add(makeBox(width * 1.035, .68, wingDepth * 1.08, muzhaiMaterials.stone, 0, wingTop + .34, wingCenterZ))
  group.add(makeHipRoof(width * 1.055, wingDepth * 1.1, 3.35, muzhaiMaterials.roof, 0, wingTop + .66, wingCenterZ, .56))
  group.add(makeBox(frontWidth * 1.06, .72, frontDepth * 1.07, muzhaiMaterials.stone, frontCenterX, frontTop + .36, frontCenterZ))
  group.add(makeHipRoof(frontWidth * 1.08, frontDepth * 1.1, 3.15, muzhaiMaterials.roof, frontCenterX, frontTop + .7, frontCenterZ, .46))

  // 仅保留两道很浅的瓦行和屋脊，避免此前密集横线破坏苹果地图式的整体块面。
  const addRoofTileCourses = (roofWidth: number, roofDepth: number, roofHeight: number, roofX: number, roofY: number, roofZ: number, ridgeRatio: number) => {
    for (const side of [-1, 1] as const) {
      for (const progress of [.34, .68]) {
        const courseWidth = roofWidth * ((1 - progress) + ridgeRatio * progress) * .99
        group.add(makeBox(courseWidth, .045, .1, muzhaiMaterials.roofTile, roofX, roofY + roofHeight * progress + .04, roofZ + side * roofDepth * .5 * (1 - progress)))
      }
    }
    group.add(makeBox(roofWidth * ridgeRatio, .11, .18, muzhaiMaterials.roofTile, roofX, roofY + roofHeight + .04, roofZ))
  }
  addRoofTileCourses(width * 1.055, wingDepth * 1.1, 3.35, 0, wingTop + .66, wingCenterZ, .56)
  addRoofTileCourses(frontWidth * 1.08, frontDepth * 1.1, 3.15, frontCenterX, frontTop + .7, frontCenterZ, .46)

  const addZWindow = (x: number, y: number, z: number, windowWidth: number, windowHeight: number, side: -1 | 1) => {
    const faceZ = z + side * .25
    group.add(makeBox(windowWidth, windowHeight, .34, muzhaiMaterials.windowFrame, x, y, z))
    group.add(makeBox(windowWidth * .73, windowHeight * .72, .13, muzhaiMaterials.window, x, y, faceZ))
    for (const offset of [-.19, .19]) group.add(makeBox(.12, windowHeight * .73, .16, muzhaiMaterials.windowFrame, x + windowWidth * offset, y, z + side * .34))
    for (const offset of [-.2, .2]) group.add(makeBox(windowWidth * .74, .12, .16, muzhaiMaterials.windowFrame, x, y + windowHeight * offset, z + side * .34))
    group.add(makeBox(windowWidth * 1.12, .18, .26, muzhaiMaterials.stoneShadow, x, y - windowHeight * .5 - .13, z + side * .32))
    group.add(makeBox(windowWidth * 1.06, .14, .23, muzhaiMaterials.windowFrame, x, y + windowHeight * .5 + .11, z + side * .32))
  }
  const addXWindow = (x: number, y: number, z: number, windowWidth: number, windowHeight: number, side: -1 | 1) => {
    const faceX = x + side * .25
    group.add(makeBox(.34, windowHeight, windowWidth, muzhaiMaterials.windowFrame, x, y, z))
    group.add(makeBox(.13, windowHeight * .72, windowWidth * .73, muzhaiMaterials.window, faceX, y, z))
    for (const offset of [-.19, .19]) group.add(makeBox(.16, windowHeight * .73, .12, muzhaiMaterials.windowFrame, x + side * .34, y, z + windowWidth * offset))
    for (const offset of [-.2, .2]) group.add(makeBox(.16, .12, windowWidth * .74, muzhaiMaterials.windowFrame, x + side * .34, y + windowHeight * offset, z))
    group.add(makeBox(.26, .18, windowWidth * 1.12, muzhaiMaterials.stoneShadow, x + side * .32, y - windowHeight * .5 - .13, z))
    group.add(makeBox(.23, .14, windowWidth * 1.06, muzhaiMaterials.windowFrame, x + side * .32, y + windowHeight * .5 + .11, z))
  }
  const lowerRow = baseHeight + 3.25
  const upperRow = baseHeight + 7.85

  // 正面：两翼各四扇白框窗，并在窗上方加入照片中连续的白色齿饰带。
  const frontWingXs = [-.425, -.345, -.265, -.185, .185, .265, .345, .425].map((factor) => factor * width)
  for (const x of frontWingXs) {
    addZWindow(x, lowerRow, wingFrontZ - .25, 2.45, 3.0, -1)
    addZWindow(x, upperRow, wingFrontZ - .25, 2.45, 3.0, -1)
  }
  group.add(makeBox(width * .995, .36, .74, muzhaiMaterials.stone, 0, baseHeight + .75, wingFrontZ - .2))
  group.add(makeBox(width * 1.01, .22, .42, muzhaiMaterials.stone, 0, wingTop - 1.14, wingFrontZ - .32))
  for (let index = 0; index < 24; index += 1) {
    const x = -width * .47 + index * (width * .94 / 23)
    group.add(makeBox(.58, .3, .35, muzhaiMaterials.stone, x, wingTop - .78, wingFrontZ - .35))
  }

  // 背面是横向主楼的连续窗墙；山花入口只属于前伸门厅。
  const rearFacadeZ = wingCenterZ + wingDepth * .5 + .3
  for (let index = 0; index < 10; index += 1) {
    const x = minX + width * (.075 + index * .094)
    addZWindow(x, lowerRow, rearFacadeZ, 2.5, 3.0, 1)
    addZWindow(x, upperRow, rearFacadeZ, 2.5, 3.0, 1)
  }
  group.add(makeBox(width * .995, .36, .74, muzhaiMaterials.stone, 0, baseHeight + .75, rearFacadeZ + .18))
  group.add(makeBox(width * 1.01, .22, .42, muzhaiMaterials.stone, 0, wingTop - 1.14, rearFacadeZ + .32))
  for (let index = 0; index < 24; index += 1) {
    const x = -width * .47 + index * (width * .94 / 23)
    group.add(makeBox(.58, .3, .35, muzhaiMaterials.stone, x, wingTop - .78, rearFacadeZ + .35))
  }

  // 两个侧立面延续白框竖窗；窗口位置避开正面凸出的门厅，形成参考图里的红砖端墙。
  const sideRows = [wingCenterZ - wingDepth * .28, wingCenterZ, wingCenterZ + wingDepth * .28]
  for (const z of sideRows) {
    addXWindow(minX - .28, lowerRow, z, 2.5, 3.0, -1)
    addXWindow(minX - .28, upperRow, z, 2.5, 3.0, -1)
    addXWindow(maxX + .28, lowerRow, z, 2.5, 3.0, 1)
    addXWindow(maxX + .28, upperRow, z, 2.5, 3.0, 1)
  }

  // 中央前厅：按实景改为窄而高的矩形主面，取消此前过强的三角山花。
  const entryZ = minZ - .42
  group.add(makeBox(frontWidth * .93, .52, 1.0, muzhaiMaterials.stone, frontCenterX, baseHeight + .45, entryZ))
  group.add(makeBox(frontWidth * .94, .64, 1.02, muzhaiMaterials.stone, frontCenterX, frontTop - .2, entryZ))
  group.add(makeBox(frontWidth * .98, .26, .58, muzhaiMaterials.stone, frontCenterX, frontTop - 1.08, entryZ - .24))
  group.add(makeBox(frontWidth * .78, .34, .64, muzhaiMaterials.stone, frontCenterX, frontTop - 1.62, entryZ - .26))
  // 下层只保留门洞两侧各一扇高窗；上层为两侧窗和中央三联窗。
  for (const x of [frontCenterX - frontWidth * .34, frontCenterX + frontWidth * .34]) {
    addZWindow(x, lowerRow, entryZ - .18, 2.35, 3.25, -1)
    addZWindow(x, upperRow + .35, entryZ - .18, 2.35, 3.1, -1)
  }
  for (const x of [frontCenterX - frontWidth * .15, frontCenterX, frontCenterX + frontWidth * .15]) {
    addZWindow(x, upperRow + 1.55, entryZ - .23, 1.82, 3.05, -1)
  }
  // 四条略微凸出的红砖壁柱控制立面的节奏，颜色只做轻微加深。
  for (const x of [frontCenterX - frontWidth * .43, frontCenterX - frontWidth * .225, frontCenterX + frontWidth * .225, frontCenterX + frontWidth * .43]) {
    group.add(makeBox(.64, frontHeight * .76, .48, muzhaiMaterials.brickDark, x, baseHeight + frontHeight * .48, entryZ - .22))
    group.add(makeBox(.98, .34, .58, muzhaiMaterials.stone, x, baseHeight + .98, entryZ - .31))
    group.add(makeBox(.98, .34, .58, muzhaiMaterials.stone, x, frontTop - 1.35, entryZ - .31))
  }
  // 前厅两侧同样有双层白框窗，补足第二张侧视图里的红砖端墙细节。
  for (const z of [frontCenterZ - frontDepth * .2, frontCenterZ + frontDepth * .18]) {
    addXWindow(frontCenterX - frontWidth * .5 - .25, lowerRow, z, 2.35, 3.0, -1)
    addXWindow(frontCenterX - frontWidth * .5 - .25, upperRow, z, 2.35, 3.0, -1)
    addXWindow(frontCenterX + frontWidth * .5 + .25, lowerRow, z, 2.35, 3.0, 1)
    addXWindow(frontCenterX + frontWidth * .5 + .25, upperRow, z, 2.35, 3.0, 1)
  }

  // 门洞以白石柱框住木质双扇门，并加入分格、门楣和两盏入口灯。
  group.add(makeBox(7.2, 5.95, .48, muzhaiMaterials.windowFrame, frontCenterX, baseHeight + 3.22, entryZ - .3))
  group.add(makeBox(5.7, .56, .62, muzhaiMaterials.stone, frontCenterX, baseHeight + 5.86, entryZ - .47))
  group.add(makeBox(4.05, 3.88, .18, muzhaiMaterials.door, frontCenterX, baseHeight + 2.95, entryZ - .59))
  for (const side of [-1, 1] as const) {
    const doorX = frontCenterX + side * 1.01
    group.add(makeBox(1.72, 3.62, .12, muzhaiMaterials.doorWood, doorX, baseHeight + 2.9, entryZ - .72))
    group.add(makeBox(.13, 3.2, .15, muzhaiMaterials.stoneShadow, doorX, baseHeight + 2.9, entryZ - .8))
    group.add(makeBox(1.44, .13, .15, muzhaiMaterials.stoneShadow, doorX, baseHeight + 2.15, entryZ - .8))
    group.add(makeBox(1.44, .13, .15, muzhaiMaterials.stoneShadow, doorX, baseHeight + 3.48, entryZ - .8))
  }
  group.add(makeBox(.22, 3.95, .18, muzhaiMaterials.windowFrame, frontCenterX, baseHeight + 2.95, entryZ - .83))
  for (const side of [-1, 1] as const) {
    const lamp = new THREE.Group()
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.11, .16, 2.05, 6), muzhaiMaterials.metal)
    post.position.y = 1.02
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.27, 8, 6), muzhaiMaterials.windowFrame)
    globe.position.y = 2.1
    lamp.add(post, globe)
    lamp.position.set(frontCenterX + side * 5.0, 0, entryZ - .95)
    group.add(lamp)
  }
  for (let index = 0; index < 5; index += 1) {
    const stepHeight = .18 + index * .24
    group.add(makeBox(11.1 - index * .46, stepHeight, 1.55, muzhaiMaterials.step, frontCenterX, stepHeight * .5, minZ - 1.2 - index * .7))
  }

  // 圆顶塔楼位于前厅后方、两翼屋脊之上：底部为红砖方塔，白色窗框和檐线托起红色半球圆顶。
  const towerWidth = frontWidth * .62
  const towerDepth = wingDepth * .72
  // 塔楼略靠后压在主楼屋脊上，正面保留完整的前伸门厅屋顶。
  const towerZ = wingFrontZ + wingDepth * .42
  const towerBaseY = wingTop + .45
  group.add(makeBox(towerWidth * 1.12, .8, towerDepth * 1.12, muzhaiMaterials.stone, frontCenterX, towerBaseY, towerZ))
  group.add(makeBox(towerWidth, 5.8, towerDepth, muzhaiMaterials.brick, frontCenterX, towerBaseY + 3.3, towerZ))
  for (const x of [frontCenterX - towerWidth * .5 - .06, frontCenterX + towerWidth * .5 + .06]) {
    group.add(makeBox(.7, 5.9, .72, muzhaiMaterials.stone, x, towerBaseY + 3.3, towerZ - towerDepth * .46))
    group.add(makeBox(.7, 5.9, .72, muzhaiMaterials.stone, x, towerBaseY + 3.3, towerZ + towerDepth * .46))
  }
  // 方塔四周的白石腰线和齿饰，令圆顶底座不再是一块平整的红色盒子。
  for (const side of [-1, 1] as const) {
    group.add(makeBox(towerWidth * 1.04, .22, .42, muzhaiMaterials.stone, frontCenterX, towerBaseY + 5.75, towerZ + side * (towerDepth * .5 + .23)))
    for (let index = 0; index < 8; index += 1) {
      const x = frontCenterX - towerWidth * .42 + index * (towerWidth * .84 / 7)
      group.add(makeBox(.38, .3, .3, muzhaiMaterials.stone, x, towerBaseY + 6.12, towerZ + side * (towerDepth * .5 + .27)))
    }
  }
  group.add(makeBox(towerWidth * 1.12, .75, towerDepth * 1.12, muzhaiMaterials.stone, frontCenterX, towerBaseY + 6.58, towerZ))
  const lanternWidth = towerWidth * .78
  const lanternDepth = towerDepth * .72
  const lanternY = towerBaseY + 8.45
  group.add(makeBox(lanternWidth, 3.05, lanternDepth, muzhaiMaterials.brick, frontCenterX, lanternY, towerZ))
  group.add(makeBox(lanternWidth * 1.16, .68, lanternDepth * 1.16, muzhaiMaterials.stone, frontCenterX, lanternY + 1.85, towerZ))

  // 方塔正背面各三扇窄窗，侧面各两扇；数量和纵横比例依照航拍中的窗列。
  for (const x of [frontCenterX - towerWidth * .28, frontCenterX, frontCenterX + towerWidth * .28]) {
    addZWindow(x, towerBaseY + 3.25, towerZ - towerDepth * .5 - .2, 1.55, 2.55, -1)
    addZWindow(x, towerBaseY + 3.25, towerZ + towerDepth * .5 + .2, 1.55, 2.55, 1)
  }
  for (const z of [towerZ - towerDepth * .2, towerZ + towerDepth * .2]) {
    addXWindow(frontCenterX - towerWidth * .5 - .2, towerBaseY + 3.25, z, 2.0, 2.4, -1)
    addXWindow(frontCenterX + towerWidth * .5 + .2, towerBaseY + 3.25, z, 2.0, 2.4, 1)
  }
  for (const x of [frontCenterX - lanternWidth * .29, frontCenterX, frontCenterX + lanternWidth * .29]) {
    addZWindow(x, lanternY, towerZ - lanternDepth * .5 - .18, 1.25, 1.95, -1)
    addZWindow(x, lanternY, towerZ + lanternDepth * .5 + .18, 1.25, 1.95, 1)
  }
  const domeRadius = towerWidth * .47
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(domeRadius * 1.03, domeRadius * 1.06, .95, 20), muzhaiMaterials.stone)
  drum.position.set(frontCenterX, lanternY + 2.26, towerZ)
  group.add(drum)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(domeRadius, 20, 10, 0, Math.PI * 2, 0, Math.PI * .5), muzhaiMaterials.roof)
  const domeCenterY = lanternY + 2.74
  dome.position.set(frontCenterX, domeCenterY, towerZ)
  dome.scale.y = 1.38
  group.add(dome)

  return group
}

/**
 * 依据用户提供的混元模型重新拆解的轻量版本。
 * 重点保留左右翼楼、中央前伸门厅、分层方塔、八边形鼓座和圆顶，避免使用高面数外部模型。
 */
function createMuzhaiLibraryReferenceModel(building: Building) {
  const first = building.footprint[0]
  const second = building.footprint[1]
  const centerX = building.footprint.reduce((total, [x]) => total + x, 0) / building.footprint.length
  const centerZ = building.footprint.reduce((total, [, z]) => total + z, 0) / building.footprint.length
  const rotation = Math.atan2(-(second[1] - first[1]), second[0] - first[0])
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const footprint = building.footprint.map(([x, z]) => {
    const dx = x - centerX
    const dz = z - centerZ
    return [cosine * dx - sine * dz, sine * dx + cosine * dz] as Point
  })
  const minX = Math.min(...footprint.map(([x]) => x))
  const maxX = Math.max(...footprint.map(([x]) => x))
  const minZ = Math.min(...footprint.map(([, z]) => z))
  const maxZ = Math.max(...footprint.map(([, z]) => z))
  const footprintWidth = maxX - minX
  const footprintDepth = maxZ - minZ
  const planCenterZ = (minZ + maxZ) * .5

  // 比 OSM 外包框留出一圈空地，避免建筑压到道路和周边树木。
  const modelWidth = footprintWidth * .94
  const modelDepth = footprintDepth * .88
  const centerWidth = modelWidth * .38
  const sideWidth = (modelWidth - centerWidth) * .5
  const wingDepth = modelDepth * .48
  const wingZ = planCenterZ + modelDepth * .11
  const frontDepth = modelDepth * .62
  const frontZ = planCenterZ - modelDepth * .18
  const baseHeight = 1.15
  const wingHeight = 10.55
  const centerHeight = 11.65
  const wingTop = baseHeight + wingHeight
  const centerTop = baseHeight + centerHeight
  const leftX = -(centerWidth + sideWidth) * .5
  const rightX = -leftX

  const group = new THREE.Group()
  group.name = '木斋图书馆 · 轻量参考重建'
  group.position.set(centerX, 1.22, centerZ)
  group.rotation.y = rotation

  const addFrontWindow = (x: number, y: number, z: number, width = 2.25, height = 2.65, side: -1 | 1 = -1) => {
    group.add(makeBox(width, height, .26, muzhaiMaterials.windowFrame, x, y, z))
    group.add(makeBox(width * .76, height * .76, .11, muzhaiMaterials.window, x, y, z + side * .18))
    group.add(makeBox(.12, height * .73, .13, muzhaiMaterials.windowFrame, x, y, z + side * .25))
    for (const offset of [-.23, .23]) group.add(makeBox(width * .72, .1, .13, muzhaiMaterials.windowFrame, x, y + height * offset, z + side * .25))
    group.add(makeBox(width * 1.12, .16, .28, muzhaiMaterials.stoneShadow, x, y - height * .5 - .11, z + side * .2))
  }
  const addSideWindow = (x: number, y: number, z: number, side: -1 | 1) => {
    group.add(makeBox(.26, 2.65, 2.25, muzhaiMaterials.windowFrame, x, y, z))
    group.add(makeBox(.11, 2.02, 1.72, muzhaiMaterials.window, x + side * .18, y, z))
    group.add(makeBox(.13, 2.0, .12, muzhaiMaterials.windowFrame, x + side * .25, y, z))
    group.add(makeBox(.13, .11, 1.68, muzhaiMaterials.windowFrame, x + side * .25, y, z))
  }

  // 左右翼楼分别建模，中央连接段被门厅和塔楼遮住，轮廓与参考模型一致。
  for (const [x, side] of [[leftX, -1], [rightX, 1]] as const) {
    group.add(makeBox(sideWidth * 1.015, baseHeight, wingDepth * 1.04, muzhaiMaterials.stone, x, baseHeight * .5, wingZ))
    group.add(makeBox(sideWidth, wingHeight, wingDepth, muzhaiMaterials.brick, x, baseHeight + wingHeight * .5, wingZ))
    group.add(makeBox(sideWidth * 1.04, .62, wingDepth * 1.08, muzhaiMaterials.stone, x, wingTop + .31, wingZ))
    group.add(makeHipRoof(sideWidth * 1.06, wingDepth * 1.1, 3.35, muzhaiMaterials.roof, x, wingTop + .62, wingZ, .48))
    group.add(makeBox(sideWidth * .50, .12, .18, muzhaiMaterials.roofTile, x, wingTop + 4.02, wingZ))
    group.add(makeBox(sideWidth * 1.01, .28, .5, muzhaiMaterials.stone, x, baseHeight + .68, wingZ - wingDepth * .5 - .2))
    group.add(makeBox(sideWidth * 1.02, .22, .42, muzhaiMaterials.stone, x, wingTop - .92, wingZ - wingDepth * .5 - .25))
    for (let index = 0; index < 9; index += 1) {
      const detailX = x - sideWidth * .4 + index * sideWidth * .1
      group.add(makeBox(.42, .28, .34, muzhaiMaterials.stone, detailX, wingTop - .58, wingZ - wingDepth * .5 - .3))
    }
    for (let index = 0; index < 4; index += 1) {
      const windowX = x + (index - 1.5) * sideWidth * .215
      addFrontWindow(windowX, baseHeight + 2.75, wingZ - wingDepth * .5 - .18)
      addFrontWindow(windowX, baseHeight + 6.75, wingZ - wingDepth * .5 - .18)
      addFrontWindow(windowX, baseHeight + 2.75, wingZ + wingDepth * .5 + .18, 2.25, 2.65, 1)
      addFrontWindow(windowX, baseHeight + 6.75, wingZ + wingDepth * .5 + .18, 2.25, 2.65, 1)
    }
    for (const z of [wingZ - wingDepth * .22, wingZ + wingDepth * .22]) {
      addSideWindow(side * modelWidth * .5, baseHeight + 2.75, z, side)
      addSideWindow(side * modelWidth * .5, baseHeight + 6.75, z, side)
    }
  }

  // 中央连接体和前伸门厅是一个连续的高体量，前方覆盖独立四坡屋面。
  group.add(makeBox(centerWidth * 1.04, baseHeight, frontDepth * 1.04, muzhaiMaterials.stone, 0, baseHeight * .5, frontZ))
  group.add(makeBox(centerWidth, centerHeight, frontDepth, muzhaiMaterials.brick, 0, baseHeight + centerHeight * .5, frontZ))
  group.add(makeBox(centerWidth * 1.05, .64, frontDepth * 1.07, muzhaiMaterials.stone, 0, centerTop + .32, frontZ))
  group.add(makeHipRoof(centerWidth * 1.08, frontDepth * 1.09, 3.25, muzhaiMaterials.roof, 0, centerTop + .64, frontZ, .42))
  group.add(makeBox(centerWidth * .45, .12, .18, muzhaiMaterials.roofTile, 0, centerTop + 3.94, frontZ))
  const frontFaceZ = frontZ - frontDepth * .5 - .25
  group.add(makeBox(centerWidth * 1.02, .32, .55, muzhaiMaterials.stone, 0, baseHeight + .68, frontFaceZ))
  group.add(makeBox(centerWidth * 1.03, .24, .48, muzhaiMaterials.stone, 0, centerTop - .95, frontFaceZ))
  for (const x of [-centerWidth * .36, centerWidth * .36]) {
    addFrontWindow(x, baseHeight + 2.8, frontFaceZ, 2.1, 2.75)
    addFrontWindow(x, baseHeight + 7.1, frontFaceZ, 2.1, 2.75)
  }
  for (const x of [-centerWidth * .18, 0, centerWidth * .18]) addFrontWindow(x, baseHeight + 7.25, frontFaceZ - .04, 1.82, 2.7)
  for (const x of [-centerWidth * .46, -centerWidth * .27, centerWidth * .27, centerWidth * .46]) {
    group.add(makeBox(.58, centerHeight * .78, .45, muzhaiMaterials.brickDark, x, baseHeight + centerHeight * .48, frontFaceZ - .18))
    group.add(makeBox(.9, .3, .56, muzhaiMaterials.stone, x, baseHeight + .92, frontFaceZ - .25))
    group.add(makeBox(.9, .3, .56, muzhaiMaterials.stone, x, centerTop - 1.15, frontFaceZ - .25))
  }

  // 白石门套、木质双扇门和宽台阶。
  group.add(makeBox(5.65, 5.45, .5, muzhaiMaterials.windowFrame, 0, baseHeight + 3.0, frontFaceZ - .22))
  group.add(makeBox(4.1, 3.75, .18, muzhaiMaterials.door, 0, baseHeight + 2.75, frontFaceZ - .5))
  for (const side of [-1, 1] as const) {
    group.add(makeBox(1.72, 3.5, .12, muzhaiMaterials.doorWood, side * .92, baseHeight + 2.72, frontFaceZ - .62))
  }
  group.add(makeBox(.18, 3.7, .14, muzhaiMaterials.windowFrame, 0, baseHeight + 2.72, frontFaceZ - .68))
  for (let index = 0; index < 4; index += 1) {
    const stepHeight = .18 + index * .22
    group.add(makeBox(9.4 - index * .55, stepHeight, 1.4, muzhaiMaterials.step, 0, stepHeight * .5, frontFaceZ - .85 - index * .62))
  }

  // 参考模型最关键的竖向层次：方塔底座、白色双层檐口、八边形红砖鼓座和椭圆圆顶。
  const towerZ = wingZ - wingDepth * .28
  const towerWidth = centerWidth * .72
  const towerDepth = wingDepth * .74
  const towerBaseY = centerTop + 3.45
  group.add(makeBox(towerWidth * 1.12, .7, towerDepth * 1.12, muzhaiMaterials.stone, 0, towerBaseY, towerZ))
  group.add(makeBox(towerWidth, 3.85, towerDepth, muzhaiMaterials.brick, 0, towerBaseY + 2.2, towerZ))
  group.add(makeBox(towerWidth * 1.08, .56, towerDepth * 1.08, muzhaiMaterials.stone, 0, towerBaseY + 4.48, towerZ))
  group.add(makeBox(towerWidth * 1.16, .46, towerDepth * 1.16, muzhaiMaterials.stone, 0, towerBaseY + 4.98, towerZ))
  for (const x of [-towerWidth * .27, 0, towerWidth * .27]) {
    addFrontWindow(x, towerBaseY + 2.45, towerZ - towerDepth * .5 - .16, 1.48, 2.12)
  }
  const drumRadius = towerWidth * .33
  const drumY = towerBaseY + 7.15
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(drumRadius, drumRadius * 1.02, 3.6, 8), muzhaiMaterials.brick)
  drum.position.set(0, drumY, towerZ)
  group.add(drum)
  for (const y of [drumY - 2.02, drumY + 2.02]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(drumRadius * 1.12, drumRadius * 1.12, .5, 8), muzhaiMaterials.stone)
    ring.position.set(0, y, towerZ)
    group.add(ring)
  }
  addFrontWindow(0, drumY, towerZ - drumRadius - .12, 1.32, 2.05)
  addFrontWindow(0, drumY, towerZ + drumRadius + .12, 1.32, 2.05, 1)
  addSideWindow(-drumRadius - .12, drumY, towerZ, -1)
  addSideWindow(drumRadius + .12, drumY, towerZ, 1)

  const domeRadius = drumRadius * 1.03
  const domeBaseY = drumY + 2.18
  const dome = new THREE.Mesh(new THREE.SphereGeometry(domeRadius, 18, 10, 0, Math.PI * 2, 0, Math.PI * .5), muzhaiMaterials.roof)
  dome.position.set(0, domeBaseY, towerZ)
  dome.scale.y = 1.48
  group.add(dome)
  const finial = new THREE.Mesh(new THREE.ConeGeometry(.22, .75, 8), muzhaiMaterials.roofTile)
  finial.position.set(0, domeBaseY + domeRadius * 1.48 + .34, towerZ)
  group.add(finial)

  return group
}

/**
 * 木斋图书馆正交重建版：只依据当前的正/侧/背三视图与俯视图。
 * 平面为严格十字形，南北中央楼、左右翼楼、塔楼和每组屋面均独立建模。
 */
function createMuzhaiLibraryOrthographicModel(building: Building) {
  const first = building.footprint[0]
  const second = building.footprint[1]
  const centerX = building.footprint.reduce((total, [x]) => total + x, 0) / building.footprint.length
  const centerZ = building.footprint.reduce((total, [, z]) => total + z, 0) / building.footprint.length
  const rotation = Math.atan2(-(second[1] - first[1]), second[0] - first[0])
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const localFootprint = building.footprint.map(([x, z]) => {
    const dx = x - centerX
    const dz = z - centerZ
    return [cosine * dx - sine * dz, sine * dx + cosine * dz] as Point
  })
  const minX = Math.min(...localFootprint.map(([x]) => x))
  const maxX = Math.max(...localFootprint.map(([x]) => x))
  const minZ = Math.min(...localFootprint.map(([, z]) => z))
  const maxZ = Math.max(...localFootprint.map(([, z]) => z))
  const width = (maxX - minX) * .94
  const depth = (maxZ - minZ) * .94
  const planZ = (minZ + maxZ) * .5

  // 俯视图比例：中央轴约占总宽 30%，横翼约占总深 38%。
  const centerWidth = width * .31
  const sideWidth = (width - centerWidth) * .5
  const wingDepth = depth * .38
  const wingZ = planZ
  const frontDepth = depth * .48
  const frontZ = planZ - depth * .17
  const rearWidth = centerWidth * 1.04
  const rearDepth = depth * .34
  const rearZ = planZ + depth * .26
  const leftX = -(centerWidth + sideWidth) * .5
  const rightX = -leftX

  const baseHeight = 1.15
  const wingHeight = 10.25
  const frontHeight = 11.45
  const rearHeight = 10.7
  const wingTop = baseHeight + wingHeight
  const frontTop = baseHeight + frontHeight
  const rearTop = baseHeight + rearHeight

  const group = new THREE.Group()
  group.name = '木斋图书馆 · 正交图重建'
  group.position.set(centerX, 1.22, centerZ)
  group.rotation.y = rotation

  const addZWindow = (x: number, y: number, z: number, side: -1 | 1, windowWidth = 2.15, windowHeight = 2.72) => {
    group.add(makeBox(windowWidth, windowHeight, .28, muzhaiMaterials.windowFrame, x, y, z))
    group.add(makeBox(windowWidth * .75, windowHeight * .76, .1, muzhaiMaterials.window, x, y, z + side * .2))
    for (const offset of [-.19, .19]) group.add(makeBox(.1, windowHeight * .72, .13, muzhaiMaterials.windowFrame, x + windowWidth * offset, y, z + side * .27))
    for (const offset of [-.22, .22]) group.add(makeBox(windowWidth * .72, .1, .13, muzhaiMaterials.windowFrame, x, y + windowHeight * offset, z + side * .27))
    group.add(makeBox(windowWidth * 1.13, .16, .3, muzhaiMaterials.stoneShadow, x, y - windowHeight * .5 - .12, z + side * .23))
  }
  const addXWindow = (x: number, y: number, z: number, side: -1 | 1, windowWidth = 2.15, windowHeight = 2.72) => {
    group.add(makeBox(.28, windowHeight, windowWidth, muzhaiMaterials.windowFrame, x, y, z))
    group.add(makeBox(.1, windowHeight * .76, windowWidth * .75, muzhaiMaterials.window, x + side * .2, y, z))
    for (const offset of [-.19, .19]) group.add(makeBox(.13, windowHeight * .72, .1, muzhaiMaterials.windowFrame, x + side * .27, y, z + windowWidth * offset))
    for (const offset of [-.22, .22]) group.add(makeBox(.13, .1, windowWidth * .72, muzhaiMaterials.windowFrame, x + side * .27, y + windowHeight * offset, z))
  }
  const addTallZWindow = (x: number, y: number, z: number, side: -1 | 1, windowWidth = 1.72, windowHeight = 2.92) => {
    group.add(makeBox(windowWidth * 1.16, windowHeight * 1.08, .3, muzhaiMaterials.stone, x, y, z))
    group.add(makeBox(windowWidth, windowHeight, .31, muzhaiMaterials.windowFrame, x, y, z + side * .08))
    group.add(makeBox(windowWidth * .72, windowHeight * .76, .1, muzhaiMaterials.window, x, y, z + side * .24))
    group.add(makeBox(.11, windowHeight * .72, .13, muzhaiMaterials.windowFrame, x, y, z + side * .3))
    group.add(makeBox(windowWidth * .7, .11, .13, muzhaiMaterials.windowFrame, x, y + windowHeight * .08, z + side * .3))
    group.add(makeBox(windowWidth * 1.27, .2, .36, muzhaiMaterials.stoneShadow, x, y - windowHeight * .5 - .2, z + side * .22))
    group.add(makeBox(windowWidth * 1.24, .22, .38, muzhaiMaterials.stone, x, y + windowHeight * .5 + .2, z + side * .2))
  }
  const addTallXWindow = (x: number, y: number, z: number, side: -1 | 1, windowWidth = 1.72, windowHeight = 2.92) => {
    group.add(makeBox(.3, windowHeight * 1.08, windowWidth * 1.16, muzhaiMaterials.stone, x, y, z))
    group.add(makeBox(.31, windowHeight, windowWidth, muzhaiMaterials.windowFrame, x + side * .08, y, z))
    group.add(makeBox(.1, windowHeight * .76, windowWidth * .72, muzhaiMaterials.window, x + side * .24, y, z))
    group.add(makeBox(.13, windowHeight * .72, .11, muzhaiMaterials.windowFrame, x + side * .3, y, z))
    group.add(makeBox(.13, .11, windowWidth * .7, muzhaiMaterials.windowFrame, x + side * .3, y + windowHeight * .08, z))
  }
  const addRoofRidge = (ridgeWidth: number, y: number, z: number, x = 0) => {
    group.add(makeBox(ridgeWidth, .13, .2, muzhaiMaterials.roofTile, x, y, z))
  }
  const addHipLines = (roofWidth: number, roofDepth: number, roofHeight: number, baseY: number, x: number, z: number, ridgeRatio: number) => {
    const halfWidth = roofWidth * .5
    const halfDepth = roofDepth * .5
    const halfRidge = roofWidth * ridgeRatio * .5
    const pairs = [
      [new THREE.Vector3(x - halfWidth, baseY, z - halfDepth), new THREE.Vector3(x - halfRidge, baseY + roofHeight, z)],
      [new THREE.Vector3(x - halfWidth, baseY, z + halfDepth), new THREE.Vector3(x - halfRidge, baseY + roofHeight, z)],
      [new THREE.Vector3(x + halfWidth, baseY, z - halfDepth), new THREE.Vector3(x + halfRidge, baseY + roofHeight, z)],
      [new THREE.Vector3(x + halfWidth, baseY, z + halfDepth), new THREE.Vector3(x + halfRidge, baseY + roofHeight, z)]
    ] as const
    for (const [start, end] of pairs) {
      const direction = end.clone().sub(start)
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, direction.length(), 6), muzhaiMaterials.roofTile)
      beam.position.copy(start).add(end).multiplyScalar(.5)
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
      group.add(beam)
    }
  }
  const addDentils = (x: number, z: number, span: number, y: number, side: -1 | 1) => {
    const count = Math.max(5, Math.round(span / 2.35))
    for (let index = 0; index < count; index += 1) {
      const detailX = x - span * .44 + index * (span * .88 / (count - 1))
      group.add(makeBox(.42, .27, .34, muzhaiMaterials.stone, detailX, y, z + side * .08))
    }
  }

  // 左右翼楼：各四个窗轴、两层白框窗、独立四坡屋面。
  for (const [x, outerSide] of [[leftX, -1], [rightX, 1]] as const) {
    group.add(makeBox(sideWidth * 1.025, baseHeight, wingDepth * 1.04, muzhaiMaterials.stone, x, baseHeight * .5, wingZ))
    group.add(makeBox(sideWidth, wingHeight, wingDepth, muzhaiMaterials.brick, x, baseHeight + wingHeight * .5, wingZ))
    group.add(makeBox(sideWidth * 1.04, .66, wingDepth * 1.09, muzhaiMaterials.stone, x, wingTop + .33, wingZ))
    group.add(makeHipRoof(sideWidth * 1.06, wingDepth * 1.12, 3.15, muzhaiMaterials.roof, x, wingTop + .66, wingZ, .5))
    addRoofRidge(sideWidth * .52, wingTop + 3.86, wingZ, x)
    addHipLines(sideWidth * 1.06, wingDepth * 1.12, 3.15, wingTop + .66, x, wingZ, .5)

    const frontFace = wingZ - wingDepth * .5 - .2
    const rearFace = wingZ + wingDepth * .5 + .2
    group.add(makeBox(sideWidth * 1.01, .3, .46, muzhaiMaterials.stone, x, baseHeight + .72, frontFace))
    group.add(makeBox(sideWidth * 1.01, .2, .38, muzhaiMaterials.stone, x, baseHeight + 4.92, frontFace - .02))
    group.add(makeBox(sideWidth * 1.01, .2, .38, muzhaiMaterials.stone, x, baseHeight + 4.92, rearFace + .02))
    group.add(makeBox(sideWidth * 1.02, .22, .42, muzhaiMaterials.stone, x, wingTop - .92, frontFace))
    addDentils(x, frontFace, sideWidth, wingTop - .58, -1)
    addDentils(x, rearFace, sideWidth, wingTop - .58, 1)
    for (let index = 0; index < 4; index += 1) {
      const windowX = x + (index - 1.5) * sideWidth * .215
      addTallZWindow(windowX, baseHeight + 2.75, frontFace, -1)
      addZWindow(windowX, baseHeight + 7.0, frontFace, -1, 2.25, 2.35)
      addTallZWindow(windowX, baseHeight + 2.75, rearFace, 1)
      addZWindow(windowX, baseHeight + 7.0, rearFace, 1, 2.25, 2.35)
    }
    for (const z of [wingZ - wingDepth * .28, wingZ, wingZ + wingDepth * .28]) {
      addTallXWindow(outerSide * width * .5, baseHeight + 2.75, z, outerSide)
      addXWindow(outerSide * width * .5, baseHeight + 7.0, z, outerSide, 2.25, 2.35)
    }
    group.add(makeBox(.36, .2, wingDepth * 1.01, muzhaiMaterials.stone, outerSide * width * .5, baseHeight + 4.92, wingZ))
    for (let index = 0; index < 5; index += 1) {
      const pilasterX = x - sideWidth * .48 + index * sideWidth * .24
      group.add(makeBox(.34, wingHeight * .86, .34, muzhaiMaterials.brickDark, pilasterX, baseHeight + wingHeight * .47, frontFace - .14))
      group.add(makeBox(.64, .26, .44, muzhaiMaterials.stone, pilasterX, baseHeight + .92, frontFace - .21))
      group.add(makeBox(.64, .24, .44, muzhaiMaterials.stone, pilasterX, wingTop - 1.02, frontFace - .21))
    }
  }

  // 中央连接体承托塔楼，也封闭左右翼楼之间的空隙。
  group.add(makeBox(centerWidth * 1.08, baseHeight, wingDepth * 1.04, muzhaiMaterials.stone, 0, baseHeight * .5, wingZ))
  group.add(makeBox(centerWidth * 1.03, wingHeight, wingDepth, muzhaiMaterials.brick, 0, baseHeight + wingHeight * .5, wingZ))

  // 南侧正门楼：独立四坡屋顶，正面没有三角山花。
  group.add(makeBox(centerWidth * 1.04, baseHeight, frontDepth * 1.035, muzhaiMaterials.stone, 0, baseHeight * .5, frontZ))
  group.add(makeBox(centerWidth, frontHeight, frontDepth, muzhaiMaterials.brick, 0, baseHeight + frontHeight * .5, frontZ))
  group.add(makeBox(centerWidth * 1.06, .66, frontDepth * 1.07, muzhaiMaterials.stone, 0, frontTop + .33, frontZ))
  group.add(makeHipRoof(centerWidth * 1.09, frontDepth * 1.1, 3.05, muzhaiMaterials.roof, 0, frontTop + .66, frontZ, .43))
  addRoofRidge(centerWidth * .45, frontTop + 3.76, frontZ)
  addHipLines(centerWidth * 1.09, frontDepth * 1.1, 3.05, frontTop + .66, 0, frontZ, .43)
  const frontFace = frontZ - frontDepth * .5 - .24
  const eastEntryFace = frontFace - .72
  // 东侧入口中轴按截图扩大到两根内侧壁柱外缘，并增加前凸深度。
  group.add(makeBox(centerWidth * .52, 9.45, .68, muzhaiMaterials.brick, 0, baseHeight + 4.74, frontFace - .36))
  group.add(makeBox(centerWidth * .535, .32, .76, muzhaiMaterials.stone, 0, baseHeight + .72, eastEntryFace - .04))
  group.add(makeBox(centerWidth * 1.02, .32, .5, muzhaiMaterials.stone, 0, baseHeight + .72, frontFace))
  // 东侧通长石带从门框中部上移至三联窗上方，与窗顶装饰形成同一层级。
  group.add(makeBox(centerWidth * 1.02, .22, .48, muzhaiMaterials.stone, 0, baseHeight + 8.46, frontFace - .02))
  group.add(makeBox(centerWidth * .535, .22, .78, muzhaiMaterials.stone, 0, baseHeight + 8.46, eastEntryFace - .06))
  group.add(makeBox(centerWidth * 1.03, .24, .46, muzhaiMaterials.stone, 0, frontTop - .92, frontFace))
  // 两条白石带之间加入参考图中的浅浮雕饰带：中央长方形、两侧成对小方块。
  const eastOrnamentY = (baseHeight + 8.46 + frontTop - .92) * .5
  group.add(makeBox(centerWidth * .28, .28, .18, muzhaiMaterials.stone, 0, eastOrnamentY, eastEntryFace - .16))
  for (const x of [-centerWidth * .4, -centerWidth * .32, centerWidth * .32, centerWidth * .4]) {
    group.add(makeBox(.48, .48, .18, muzhaiMaterials.stone, x, eastOrnamentY, frontFace - .34))
  }
  addDentils(0, frontFace, centerWidth, frontTop - .58, -1)
  for (const x of [-centerWidth * .36, centerWidth * .36]) {
    addTallZWindow(x, baseHeight + 2.8, frontFace, -1, 1.7, 3.0)
    addZWindow(x, baseHeight + 7.12, frontFace, -1, 1.9, 2.45)
  }
  // 东侧门框正上方改为紧凑矮三联窗，区别于两侧较大的普通窗。
  for (const x of [-1.28, 0, 1.28]) addZWindow(x, baseHeight + 7.0, eastEntryFace - .03, -1, 1.18, 1.78)
  // 三联窗上方采用参考图中的局部白石窗楣，不延伸至左右大窗。
  group.add(makeBox(4.35, .3, .58, muzhaiMaterials.stone, 0, baseHeight + 8.06, eastEntryFace - .28))
  group.add(makeBox(4.65, .15, .64, muzhaiMaterials.stoneShadow, 0, baseHeight + 8.25, eastEntryFace - .3))
  for (const x of [-centerWidth * .45, -centerWidth * .25, centerWidth * .25, centerWidth * .45]) {
    const pilasterFace = Math.abs(x) < centerWidth * .3 ? eastEntryFace : frontFace
    group.add(makeBox(.56, frontHeight * .76, .46, muzhaiMaterials.brickDark, x, baseHeight + frontHeight * .48, pilasterFace - .17))
    group.add(makeBox(.9, .29, .55, muzhaiMaterials.stone, x, baseHeight + .95, pilasterFace - .25))
    group.add(makeBox(.9, .29, .55, muzhaiMaterials.stone, x, frontTop - 1.12, pilasterFace - .25))
  }

  // 正门白石门套与台阶。
  group.add(makeBox(4.65, 5.45, .5, muzhaiMaterials.windowFrame, 0, baseHeight + 3.0, eastEntryFace - .25))
  for (const x of [-2.05, 2.05]) {
    group.add(makeBox(.52, 5.5, .66, muzhaiMaterials.stone, x, baseHeight + 3.02, eastEntryFace - .38))
    group.add(makeBox(.82, .28, .76, muzhaiMaterials.stoneShadow, x, baseHeight + .42, eastEntryFace - .42))
    group.add(makeBox(.82, .26, .76, muzhaiMaterials.stone, x, baseHeight + 5.72, eastEntryFace - .42))
  }
  group.add(makeBox(5.25, .48, .68, muzhaiMaterials.stone, 0, baseHeight + 5.72, eastEntryFace - .34))
  group.add(makeBox(2.9, .34, .72, muzhaiMaterials.stoneShadow, 0, baseHeight + 5.72, eastEntryFace - .7))
  group.add(makeBox(3.05, 3.9, .18, muzhaiMaterials.door, 0, baseHeight + 2.82, eastEntryFace - .54))
  for (const side of [-1, 1] as const) group.add(makeBox(1.22, 3.62, .12, muzhaiMaterials.doorWood, side * .66, baseHeight + 2.8, eastEntryFace - .66))
  group.add(makeBox(.16, 3.65, .14, muzhaiMaterials.windowFrame, 0, baseHeight + 2.75, eastEntryFace - .71))
  group.add(makeBox(2.65, .72, .14, muzhaiMaterials.window, 0, baseHeight + 5.0, eastEntryFace - .7))
  for (const x of [-.82, 0, .82]) group.add(makeBox(.1, .68, .15, muzhaiMaterials.windowFrame, x, baseHeight + 5.0, eastEntryFace - .77))
  for (let index = 0; index < 5; index += 1) {
    const stepHeight = 1.04 - index * .2
    group.add(makeBox(5.8 + index * .46, stepHeight, 1.35, muzhaiMaterials.step, 0, stepHeight * .5, eastEntryFace - .82 - index * .62))
  }
  for (const z of [frontZ - frontDepth * .25, frontZ + frontDepth * .17]) {
    addTallXWindow(-centerWidth * .5 - .18, baseHeight + 2.8, z, -1, 1.62, 2.9)
    addTallXWindow(centerWidth * .5 + .18, baseHeight + 2.8, z, 1, 1.62, 2.9)
    addXWindow(-centerWidth * .5 - .18, baseHeight + 7.08, z, -1, 1.95, 2.35)
    addXWindow(centerWidth * .5 + .18, baseHeight + 7.08, z, 1, 1.95, 2.35)
  }

  // 北侧背门楼：俯视图中独立伸出，背立面具有白色三角山花与圆饰。
  group.add(makeBox(rearWidth * 1.04, baseHeight, rearDepth * 1.04, muzhaiMaterials.stone, 0, baseHeight * .5, rearZ))
  group.add(makeBox(rearWidth, rearHeight, rearDepth, muzhaiMaterials.brick, 0, baseHeight + rearHeight * .5, rearZ))
  group.add(makeBox(rearWidth * 1.06, .62, rearDepth * 1.08, muzhaiMaterials.stone, 0, rearTop + .31, rearZ))
  group.add(makeHipRoof(rearWidth * 1.08, rearDepth * 1.1, 2.65, muzhaiMaterials.roof, 0, rearTop + .62, rearZ, .46))
  addRoofRidge(rearWidth * .48, rearTop + 3.32, rearZ)
  addHipLines(rearWidth * 1.08, rearDepth * 1.1, 2.65, rearTop + .62, 0, rearZ, .46)
  const rearFace = rearZ + rearDepth * .5 + .24
  group.add(makeBox(rearWidth * 1.02, .3, .48, muzhaiMaterials.stone, 0, baseHeight + .72, rearFace))
  group.add(makeBox(rearWidth * 1.03, .25, .48, muzhaiMaterials.stone, 0, rearTop - .92, rearFace))
  addDentils(0, rearFace, rearWidth, rearTop - .57, 1)

  // 西侧入口以两根通高红砖壁柱围合中轴，下层不再布置侧窗。
  for (const x of [-rearWidth * .34, rearWidth * .34]) {
    group.add(makeBox(.62, rearHeight * .77, .48, muzhaiMaterials.brickDark, x, baseHeight + rearHeight * .49, rearFace + .18))
    group.add(makeBox(.94, .3, .58, muzhaiMaterials.stone, x, baseHeight + .94, rearFace + .26))
    group.add(makeBox(.94, .28, .58, muzhaiMaterials.stone, x, rearTop - 1.08, rearFace + .26))
  }

  // 图片中门楣正上方为紧凑的三联窗，与两翼的普通宽窗区别开来。
  for (const x of [-1.28, 0, 1.28]) {
    addZWindow(x, baseHeight + 6.92, rearFace + .03, 1, 1.18, 1.78)
  }
  // 白石带只覆盖三联窗并紧贴窗框上沿，不横贯入口立面的中部。
  group.add(makeBox(4.35, .3, .58, muzhaiMaterials.stone, 0, baseHeight + 7.98, rearFace + .28))
  group.add(makeBox(4.65, .15, .64, muzhaiMaterials.stoneShadow, 0, baseHeight + 8.17, rearFace + .3))
  // 第二条石带保持在三联窗上方，并横向贯穿西侧中央门厅的整个立面。
  group.add(makeBox(rearWidth * .98, .34, .78, muzhaiMaterials.stone, 0, baseHeight + 8.46, rearFace + .36))

  // 白石门套保持窄高比例；深色双扇门内加入竖梃和横档。
  group.add(makeBox(3.72, 5.18, .52, muzhaiMaterials.windowFrame, 0, baseHeight + 3.08, rearFace + .27))
  for (const x of [-1.55, 1.55]) {
    group.add(makeBox(.5, 5.05, .66, muzhaiMaterials.stone, x, baseHeight + 3.05, rearFace + .37))
    group.add(makeBox(.76, .28, .76, muzhaiMaterials.stoneShadow, x, baseHeight + .52, rearFace + .41))
    group.add(makeBox(.76, .26, .76, muzhaiMaterials.stone, x, baseHeight + 5.62, rearFace + .41))
  }
  group.add(makeBox(3.62, .5, .72, muzhaiMaterials.stone, 0, baseHeight + 5.68, rearFace + .4))
  group.add(makeBox(2.22, 3.26, .18, muzhaiMaterials.door, 0, baseHeight + 2.42, rearFace + .61))
  for (const side of [-1, 1] as const) group.add(makeBox(.84, 3.02, .12, muzhaiMaterials.doorWood, side * .46, baseHeight + 2.4, rearFace + .72))
  group.add(makeBox(.12, 3.06, .14, muzhaiMaterials.windowFrame, 0, baseHeight + 2.4, rearFace + .79))
  for (const y of [baseHeight + 2.8, baseHeight + 3.55]) group.add(makeBox(1.86, .1, .14, muzhaiMaterials.windowFrame, 0, y, rearFace + .79))
  // 门套外侧紧贴一对独立的长方石柱，补足入口中轴的竖向支撑感。
  for (const x of [-2.08, 2.08]) {
    group.add(makeBox(.58, 5.48, .72, muzhaiMaterials.stone, x, baseHeight + 3.12, rearFace + .38))
    group.add(makeBox(.86, .3, .84, muzhaiMaterials.stoneShadow, x, baseHeight + .5, rearFace + .42))
    group.add(makeBox(.86, .28, .84, muzhaiMaterials.stone, x, baseHeight + 5.83, rearFace + .42))
  }

  // 山花覆盖整个入口中轴，内层保留红砖三角面和白色圆饰。
  group.add(makePediment(rearWidth * .72, 2.62, .52, muzhaiMaterials.stone, 0, rearTop - .05, rearFace + .27))
  group.add(makePediment(rearWidth * .56, 1.68, .56, muzhaiMaterials.brick, 0, rearTop - .18, rearFace + .31))
  const roundel = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .15, 18), muzhaiMaterials.stone)
  roundel.rotation.x = Math.PI * .5
  roundel.position.set(0, rearTop + .1, rearFace + .62)
  group.add(roundel)
  for (let index = 0; index < 4; index += 1) {
    const stepHeight = .18 + index * .22
    group.add(makeBox(6.35 - index * .38, stepHeight, 1.22, muzhaiMaterials.step, 0, stepHeight * .5, rearFace + .72 + index * .56))
  }
  // 台阶两侧独立石质柱脚，对应照片中入口前方的成对方形基座。
  for (const x of [-3.15, 3.15]) {
    group.add(makeBox(1.28, 1.18, 1.34, muzhaiMaterials.stone, x, .59, rearFace + 1.42))
    group.add(makeBox(1.5, .22, 1.5, muzhaiMaterials.stoneShadow, x, 1.23, rearFace + 1.42))
  }
  for (const z of [rearZ - rearDepth * .2, rearZ + rearDepth * .2]) {
    addTallXWindow(-rearWidth * .5 - .18, baseHeight + 2.75, z, -1, 1.58, 2.85)
    addTallXWindow(rearWidth * .5 + .18, baseHeight + 2.75, z, 1, 1.58, 2.85)
    addXWindow(-rearWidth * .5 - .18, baseHeight + 6.9, z, -1, 1.9, 2.3)
    addXWindow(rearWidth * .5 + .18, baseHeight + 6.9, z, 1, 1.9, 2.3)
  }

  // 塔楼位于十字交点：方形红砖塔座、双层白檐、八边形鼓座与低矮圆顶。
  // 塔顶按正交参考图收紧；它应当是中央强调，而不是接近主楼宽度的巨大穹顶。
  // 塔楼略向西侧（局部坐标后方）偏移，并降低至鼓座下方大平台接近主屋脊高度。
  const towerZ = wingZ + wingDepth * .18
  const towerWidth = centerWidth * .74
  const towerDepth = wingDepth * .72
  // 以鼓座下方的大白色平台为基准，将其中心高度精确对齐东侧主屋面屋脊。
  const eastRoofRidgeY = frontTop + 3.76
  const towerBaseY = eastRoofRidgeY - 5.02
  group.add(makeBox(towerWidth * 1.28, .72, towerDepth * 1.3, muzhaiMaterials.stone, 0, towerBaseY, towerZ))
  group.add(makeBox(towerWidth, 4.1, towerDepth, muzhaiMaterials.brick, 0, towerBaseY + 2.4, towerZ))
  group.add(makeBox(towerWidth * 1.04, .22, towerDepth * 1.04, muzhaiMaterials.stone, 0, towerBaseY + 1.15, towerZ))
  group.add(makeBox(towerWidth * 1.12, .52, towerDepth * 1.12, muzhaiMaterials.stone, 0, towerBaseY + 4.55, towerZ))
  group.add(makeBox(towerWidth * 1.26, .44, towerDepth * 1.26, muzhaiMaterials.stone, 0, towerBaseY + 5.02, towerZ))
  for (const x of [-towerWidth * .5, towerWidth * .5]) {
    for (const z of [towerZ - towerDepth * .5, towerZ + towerDepth * .5]) {
      group.add(makeBox(.44, 4.0, .44, muzhaiMaterials.stoneShadow, x, towerBaseY + 2.42, z))
    }
  }
  for (const x of [-towerWidth * .28, 0, towerWidth * .28]) {
    addZWindow(x, towerBaseY + 2.72, towerZ - towerDepth * .5 - .18, -1, 1.18, 1.82)
    addZWindow(x, towerBaseY + 2.72, towerZ + towerDepth * .5 + .18, 1, 1.18, 1.82)
  }
  for (const z of [towerZ - towerDepth * .2, towerZ + towerDepth * .2]) {
    addXWindow(-towerWidth * .5 - .18, towerBaseY + 2.72, z, -1, 1.35, 1.82)
    addXWindow(towerWidth * .5 + .18, towerBaseY + 2.72, z, 1, 1.35, 1.82)
  }

  const drumRadius = towerWidth * .36
  const drumY = towerBaseY + 6.35
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(drumRadius, drumRadius * 1.02, 3.25, 8), muzhaiMaterials.brick)
  drum.position.set(0, drumY, towerZ)
  group.add(drum)
  for (const y of [drumY - 1.82, drumY + 1.82]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(drumRadius * 1.12, drumRadius * 1.12, .48, 8), muzhaiMaterials.stone)
    ring.position.set(0, y, towerZ)
    group.add(ring)
  }
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI * .25
    const pier = makeBox(.22, 2.95, .38, muzhaiMaterials.stoneShadow, Math.cos(angle) * drumRadius * 1.01, drumY, towerZ + Math.sin(angle) * drumRadius * 1.01)
    pier.rotation.y = Math.PI * .5 - angle
    group.add(pier)
  }
  for (const x of [-drumRadius * .42, 0, drumRadius * .42]) {
    addZWindow(x, drumY, towerZ - drumRadius - .12, -1, 1.02, 1.68)
    addZWindow(x, drumY, towerZ + drumRadius + .12, 1, 1.02, 1.68)
  }
  addXWindow(-drumRadius - .12, drumY, towerZ, -1, 1.08, 1.72)
  addXWindow(drumRadius + .12, drumY, towerZ, 1, 1.08, 1.72)

  const domeRadius = drumRadius * 1.01
  const domeBaseY = drumY + 1.8
  const domeStretch = 1.18
  const dome = new THREE.Mesh(new THREE.SphereGeometry(domeRadius, 20, 11, 0, Math.PI * 2, 0, Math.PI * .5), muzhaiMaterials.roof)
  dome.position.set(0, domeBaseY, towerZ)
  dome.scale.y = domeStretch
  group.add(dome)
  const domeRibMaterial = new THREE.LineBasicMaterial({ color: 0x994538, transparent: true, opacity: .72 })
  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI * .2
    const points: THREE.Vector3[] = []
    for (let step = 0; step <= 10; step += 1) {
      const elevation = step / 10 * Math.PI * .5
      const radius = domeRadius * 1.012 * Math.cos(elevation)
      points.push(new THREE.Vector3(radius * Math.cos(angle), domeBaseY + domeRadius * domeStretch * Math.sin(elevation), towerZ + radius * Math.sin(angle)))
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), domeRibMaterial))
  }
  const finial = new THREE.Mesh(new THREE.ConeGeometry(.2, .7, 8), muzhaiMaterials.roofTile)
  finial.position.set(0, domeBaseY + domeRadius * domeStretch + .32, towerZ)
  group.add(finial)

  return group
}

/**
 * 思源堂精细模型：依据正面与三张航拍图固定门窗数量和各立面体量。
 * 建筑由白石基座、两层红砖主楼、正面六柱门廊、背面多边形凸厅及屋顶设备层组成。
 */
/**
 * 秀山堂：两层红砖教学楼，长边中段后退、两端翼楼前后凸出。
 * 四面窗列、中央纪念性门廊、浅色石材基座/檐带和平屋顶设备均独立建模，
 * 以便从用户提供的正面与四个航拍方向都保持一致的辨识度。
 */
function createXiushanHallLandmark(building: Building) {
  const centerX = building.footprint.reduce((total, [x]) => total + x, 0) / building.footprint.length
  const centerZ = building.footprint.reduce((total, [, z]) => total + z, 0) / building.footprint.length
  // 轮廓第 2—3 点是秀山堂长边，借此建立稳定的局部 x 轴。
  const edgeStart = building.footprint[1]
  const edgeEnd = building.footprint[2]
  const rotation = Math.atan2(-(edgeEnd[1] - edgeStart[1]), edgeEnd[0] - edgeStart[0])
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const localFootprint = building.footprint.map(([x, z]) => {
    const dx = x - centerX
    const dz = z - centerZ
    return [cosine * dx - sine * dz, sine * dx + cosine * dz] as Point
  })
  const minX = Math.min(...localFootprint.map(([x]) => x))
  const maxX = Math.max(...localFootprint.map(([x]) => x))
  const minZ = Math.min(...localFootprint.map(([, z]) => z))
  const maxZ = Math.max(...localFootprint.map(([, z]) => z))
  const width = (maxX - minX) * .96
  const depth = (maxZ - minZ) * .96
  const planX = (minX + maxX) * .5
  const planZ = (minZ + maxZ) * .5

  const group = new THREE.Group()
  group.name = '秀山堂 · 精细地标'
  group.position.set(centerX, 1.22, centerZ)
  // 真实主入口位于当前轮廓长轴的另一侧；旋转 180° 交换东西立面，
  // 同时保持建筑中心、长轴及真实占地轮廓不变。
  group.rotation.y = rotation + Math.PI

  const baseHeight = 2.05
  const brickHeight = 7.65
  const friezeHeight = 2.1
  const wallTop = baseHeight + brickHeight + friezeHeight
  const bodyWidth = width * .96
  const mainDepth = depth * .69
  // 完整航拍显示两端翼楼各约占总宽五分之一，中段为红砖壁柱分隔的“2 + 3”窗组。
  const pavilionWidth = width * .205
  const pavilionDepth = depth * .93
  const frontZ = planZ + mainDepth * .5
  const rearZ = planZ - mainDepth * .5
  const pavilionFrontZ = planZ + pavilionDepth * .5
  const pavilionRearZ = planZ - pavilionDepth * .5

  const addWindow = (x: number, y: number, z: number, angle: number, windowWidth = 1.62, windowHeight = 2.65, mullionCount = 2, lintelOverhang = .34) => {
    const window = new THREE.Group()
    window.position.set(x, y, z)
    window.rotation.y = angle
    window.add(makeBox(windowWidth, windowHeight, .18, xiushanMaterials.window, 0, 0, 0))
    window.add(makeBox(windowWidth + lintelOverhang, .24, .28, xiushanMaterials.stoneShadow, 0, windowHeight * .5 + .16, .01))
    window.add(makeBox(windowWidth + lintelOverhang * .74, .2, .31, xiushanMaterials.stoneShadow, 0, -windowHeight * .5 - .15, .02))
    for (const side of [-1, 1] as const) window.add(makeBox(.14, windowHeight + .02, .24, xiushanMaterials.frame, side * windowWidth * .5, 0, .04))
    for (let index = 1; index <= mullionCount; index += 1) {
      const offset = -.5 + index / (mullionCount + 1)
      window.add(makeBox(.11, windowHeight * .9, .25, xiushanMaterials.frame, windowWidth * offset, 0, .05))
    }
    for (const offset of [-.27, .05, .35]) window.add(makeBox(windowWidth * .92, .11, .25, xiushanMaterials.frame, 0, windowHeight * offset, .05))
    group.add(window)
  }

  // 正门两侧的历史宽窗：上半部四列小格，下半部两块大玻璃，不能套用普通窄窗格栅。
  const addCentralWideWindow = (x: number, y: number, z: number) => {
    const windowWidth = 3.55
    const windowHeight = 2.95
    const window = new THREE.Group()
    window.position.set(x, y, z)
    window.add(makeBox(windowWidth, windowHeight, .18, xiushanMaterials.window, 0, 0, 0))
    window.add(makeBox(windowWidth + .4, .26, .29, xiushanMaterials.stoneShadow, 0, windowHeight * .5 + .17, .01))
    window.add(makeBox(windowWidth + .3, .2, .31, xiushanMaterials.stoneShadow, 0, -windowHeight * .5 - .15, .02))
    for (const side of [-1, 1] as const) window.add(makeBox(.15, windowHeight + .02, .24, xiushanMaterials.frame, side * windowWidth * .5, 0, .04))
    window.add(makeBox(.13, windowHeight * .92, .25, xiushanMaterials.frame, 0, 0, .05))
    const transomY = .08
    window.add(makeBox(windowWidth * .94, .13, .25, xiushanMaterials.frame, 0, transomY, .05))
    const upperCenterY = (windowHeight * .5 + transomY) * .5
    const upperHeight = windowHeight * .5 - transomY
    for (const side of [-1, 1] as const) window.add(makeBox(.12, upperHeight, .25, xiushanMaterials.frame, side * windowWidth * .25, upperCenterY, .05))
    window.add(makeBox(windowWidth * .94, .11, .25, xiushanMaterials.frame, 0, windowHeight * .31, .05))
    group.add(window)
  }

  const addDoor = (x: number, y: number, z: number, angle: number, doorWidth = 2.55, doorHeight = 3.45) => {
    const door = new THREE.Group()
    door.position.set(x, y, z)
    door.rotation.y = angle
    door.add(makeBox(doorWidth, doorHeight, .22, xiushanMaterials.door, 0, 0, 0))
    door.add(makeBox(.15, doorHeight, .27, xiushanMaterials.frame, 0, 0, .05))
    door.add(makeBox(doorWidth * .92, .12, .27, xiushanMaterials.frame, 0, doorHeight * .24, .05))
    for (const side of [-1, 1] as const) door.add(makeBox(.1, doorHeight * .88, .27, xiushanMaterials.frame, side * doorWidth * .28, 0, .05))
    group.add(door)
  }

  const addLabel = (text: string, color: string, widthOnWall: number, heightOnWall: number, x: number, y: number, z: number, alwaysVisible = false) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '700 138px "STKaiti", "KaiTi", serif'
    context.fillText(text, canvas.width * .5, canvas.height * .52, canvas.width * .94)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = Math.min(4, activeRenderer.capabilities.getMaxAnisotropy())
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: !alwaysVisible, polygonOffset: true, polygonOffsetFactor: -4 })
    const label = new THREE.Mesh(new THREE.PlaneGeometry(widthOnWall, heightOnWall), material)
    label.position.set(x, y, z)
    label.renderOrder = alwaysVisible ? 5 : 0
    group.add(label)
  }

  const makeFrontProfile = (points: Point[], depth: number, material: THREE.Material, x: number, y: number, z: number) => {
    const shape = new THREE.Shape()
    shape.moveTo(points[0][0], points[0][1])
    for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index][0], points[index][1])
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
    geometry.translate(0, 0, -depth * .5)
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    return mesh
  }

  // 中段主体与两端翼楼：底层浅石、两层红砖和顶部通长石质檐带分别成层。
  group.add(makeBox(bodyWidth, baseHeight, mainDepth, xiushanMaterials.stone, planX, baseHeight * .5, planZ))
  group.add(makeBox(bodyWidth, brickHeight, mainDepth, xiushanMaterials.brick, planX, baseHeight + brickHeight * .5, planZ))
  group.add(makeBox(bodyWidth, friezeHeight, mainDepth * 1.035, xiushanMaterials.stone, planX, baseHeight + brickHeight + friezeHeight * .5, planZ))
  for (const side of [-1, 1] as const) {
    const pavilionX = planX + side * (bodyWidth * .5 - pavilionWidth * .5)
    group.add(makeBox(pavilionWidth, baseHeight, pavilionDepth, xiushanMaterials.stone, pavilionX, baseHeight * .5, planZ))
    group.add(makeBox(pavilionWidth, brickHeight, pavilionDepth, xiushanMaterials.brick, pavilionX, baseHeight + brickHeight * .5, planZ))
    group.add(makeBox(pavilionWidth * 1.035, friezeHeight, pavilionDepth * 1.025, xiushanMaterials.stone, pavilionX, baseHeight + brickHeight + friezeHeight * .5, planZ))
  }

  // 石材勒脚、层间腰线、檐口与密排檐托。
  for (const z of [frontZ + .13, rearZ - .13]) {
    group.add(makeBox(bodyWidth * 1.008, .26, .32, xiushanMaterials.stoneShadow, planX, baseHeight, z))
    group.add(makeBox(bodyWidth * 1.012, .3, .38, xiushanMaterials.stoneShadow, planX, wallTop - friezeHeight, z))
    group.add(makeBox(bodyWidth * 1.025, .34, .52, xiushanMaterials.stoneShadow, planX, wallTop - .18, z))
    for (let index = 0; index < 34; index += 1) {
      const x = planX - bodyWidth * .48 + index * (bodyWidth * .96 / 33)
      group.add(makeBox(.44, .3, .48, xiushanMaterials.stoneShadow, x, wallTop - friezeHeight + .44, z + Math.sign(z - planZ) * .12))
    }
  }
  for (const side of [-1, 1] as const) {
    const x = planX + side * (bodyWidth * .5 + .12)
    group.add(makeBox(.38, baseHeight, pavilionDepth * .98, xiushanMaterials.stoneShadow, x, baseHeight * .5, planZ))
    group.add(makeBox(.4, .3, pavilionDepth * 1.015, xiushanMaterials.stoneShadow, x, baseHeight, planZ))
    group.add(makeBox(.52, .35, pavilionDepth * 1.04, xiushanMaterials.stoneShadow, x, wallTop - .18, planZ))
  }

  // 四个外转角为通高浅色石带，翼楼内缘用较窄石带收边。
  for (const side of [-1, 1] as const) {
    const outerX = planX + side * (bodyWidth * .5 - .58)
    const innerX = planX + side * (bodyWidth * .5 - pavilionWidth + .42)
    for (const z of [pavilionFrontZ - .5, pavilionRearZ + .5]) {
      group.add(makeBox(1.15, wallTop, 1.0, xiushanMaterials.cornerStone, outerX, wallTop * .5, z))
    }
    for (const z of [frontZ + .18, rearZ - .18]) group.add(makeBox(.72, wallTop, .76, xiushanMaterials.cornerStone, innerX, wallTop * .5, z))
  }

  const lowerY = baseHeight + 2.0
  const upperY = baseHeight + 5.75
  const pavilionInnerDistance = bodyWidth * .5 - pavilionWidth
  const centralClear = width * .135

  // 用户框选的中央墙面严格按正面照：门廊旁历史宽窗、宽红砖壁柱、外侧四扇窄窗（2 + 2）。
  for (const side of [-1, 1] as const) {
    const pavilionCenter = planX + side * (bodyWidth * .5 - pavilionWidth * .5)
    const pavilionInnerEdge = planX + side * (bodyWidth * .5 - pavilionWidth)
    group.add(makeBox(.86, wallTop, .62, xiushanMaterials.cornerStone, pavilionInnerEdge, wallTop * .5, pavilionFrontZ + .22))
    for (const offset of [-.34, -.15, .15, .34]) {
      const x = pavilionCenter + pavilionWidth * offset
      addWindow(x, lowerY, pavilionFrontZ + .16, 0, 1.3, 2.88, 1)
      addWindow(x, upperY, pavilionFrontZ + .16, 0, 1.3, 2.88, 1)
    }
    const wideWindowDistance = centralClear + .15
    addCentralWideWindow(planX + side * wideWindowDistance, lowerY, frontZ + .16)
    addCentralWideWindow(planX + side * wideWindowDistance, upperY, frontZ + .16)

    const brickPierDistance = centralClear + 3.1
    group.add(makeBox(1.45, brickHeight, .82, xiushanMaterials.brick, planX + side * brickPierDistance, baseHeight + brickHeight * .5, frontZ + .25))

    const narrowStart = centralClear + 4.4
    const narrowEnd = pavilionInnerDistance - .9
    for (const amount of [0, .28, .72, 1]) {
      const distance = narrowStart + (narrowEnd - narrowStart) * amount
      addWindow(planX + side * distance, lowerY, frontZ + .16, 0, .82, 2.88, 1, .16)
      addWindow(planX + side * distance, upperY, frontZ + .16, 0, .82, 2.88, 1, .16)
    }
  }

  // 门廊装饰墙后方的中央二层窗，与左右历史宽窗保持同一标高和格栅形制。
  addCentralWideWindow(planX, upperY, frontZ + .16)

  // 背面保持航拍中规则的长条窗阵，中央留出次入口。
  for (const side of [-1, 1] as const) {
    const pavilionCenter = planX + side * (bodyWidth * .5 - pavilionWidth * .5)
    for (const offset of [-.27, 0, .27]) {
      const x = pavilionCenter + pavilionWidth * offset
      addWindow(x, lowerY, pavilionRearZ - .16, Math.PI)
      addWindow(x, upperY, pavilionRearZ - .16, Math.PI)
    }
    const start = 4.9
    const end = pavilionInnerDistance - 1.25
    for (let index = 0; index < 4; index += 1) {
      const distance = start + index * ((end - start) / 3)
      addWindow(planX + side * distance, lowerY, rearZ - .16, Math.PI)
      addWindow(planX + side * distance, upperY, rearZ - .16, Math.PI)
    }
  }

  // 两端短立面按航拍重做为“三段式”：左右各四轴，中段上层两轴、下层小门廊。
  for (const side of [-1, 1] as const) {
    const x = planX + side * (bodyWidth * .5 + .16)
    const angle = side * Math.PI * .5

    // 两道通高白色石带将侧面分成左翼、中门厅和右翼。
    const dividerDistance = 4.35
    for (const zOffset of [-dividerDistance, dividerDistance]) {
      group.add(makeBox(.92, wallTop, .9, xiushanMaterials.stone, x + side * .08, wallTop * .5, planZ + zOffset))
    }

    // 外侧两段每层各四扇窄高窗；连续石质窗楣对应参考图中的分组横带。
    const outerStart = dividerDistance + 1.45
    const outerEnd = pavilionDepth * .5 - 2.25
    for (const zSide of [-1, 1] as const) {
      for (let index = 0; index < 4; index += 1) {
        const distance = outerStart + index * ((outerEnd - outerStart) / 3)
        const z = planZ + zSide * distance
        addWindow(x, lowerY, z, angle, 1.34, 2.58)
        addWindow(x, upperY, z, angle, 1.34, 2.58)
      }
      const bandZ = planZ + zSide * ((outerStart + outerEnd) * .5)
      const bandDepth = outerEnd - outerStart + 2.0
      for (const y of [lowerY + 1.48, upperY + 1.48]) {
        group.add(makeBox(.42, .28, bandDepth, xiushanMaterials.stoneShadow, x + side * .17, y, bandZ))
      }
    }

    // 中央上层两扇窗，下层只保留独立入口。
    for (const zOffset of [-1.55, 1.55]) addWindow(x, upperY, planZ + zOffset, angle, 1.48, 2.62)
    group.add(makeBox(.42, .3, 5.3, xiushanMaterials.stoneShadow, x + side * .17, upperY + 1.5, planZ))

    const portalFaceX = x + side * 1.02
    for (const zOffset of [-2.25, 2.25]) {
      group.add(makeBox(1.42, 3.95, .78, xiushanMaterials.stone, x + side * .55, baseHeight + 1.72, planZ + zOffset))
      const column = new THREE.Mesh(new THREE.CylinderGeometry(.32, .4, 3.35, 14), xiushanMaterials.stone)
      column.position.set(x + side * .92, baseHeight + 1.82, planZ + zOffset * .68)
      group.add(column)
    }
    addDoor(portalFaceX, baseHeight + 1.62, planZ, angle, 2.35, 3.24)
    group.add(makeBox(1.72, .42, 5.65, xiushanMaterials.stoneShadow, x + side * .72, baseHeight + 3.92, planZ))
    const sidePediment = makePediment(5.25, 1.0, .7, xiushanMaterials.stone, portalFaceX, baseHeight + 4.48, planZ)
    sidePediment.rotation.y = angle
    group.add(sidePediment)

    for (let step = 0; step < 5; step += 1) {
      const stepHeight = .24 * (5 - step)
      group.add(makeBox(.65 + step * .5, stepHeight, 5.65, xiushanMaterials.step, x + side * (1.15 + step * .25), stepHeight * .5, planZ))
    }
  }

  // 正面中央门廊：按正立面照片重做四柱、三层檐口、弧肩装饰墙、盾饰与杯形顶饰。
  const entranceWidth = width * .16
  const entranceProjection = 2.35
  const entranceFace = frontZ + entranceProjection
  group.add(makeBox(entranceWidth, baseHeight, entranceProjection * 2, xiushanMaterials.stone, planX, baseHeight * .5, frontZ + entranceProjection * .5))
  addDoor(planX, baseHeight + 1.6, entranceFace + .22, 0, 2.55, 3.2)
  for (const side of [-1, 1] as const) {
    const pierX = planX + side * (entranceWidth * .5 - .72)
    group.add(makeBox(1.18, 4.7, 1.1, xiushanMaterials.stone, pierX, baseHeight + 2.05, entranceFace - .08))
    group.add(makeBox(.68, 1.72, .18, xiushanMaterials.stoneShadow, pierX, baseHeight + 2.35, entranceFace + .49))
    group.add(makeBox(1.45, .34, 1.32, xiushanMaterials.stoneShadow, pierX, baseHeight + 4.42, entranceFace + .02))
  }
  const columnY = baseHeight + 2.12
  for (const offset of [-3.72, -2.18, 2.18, 3.72]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.48, .55, .32, 16), xiushanMaterials.stoneShadow)
    base.position.set(planX + offset, baseHeight + .16, entranceFace + .46)
    group.add(base)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.36, .44, 3.72, 16), xiushanMaterials.stone)
    shaft.position.set(planX + offset, columnY, entranceFace + .46)
    group.add(shaft)
    const capital = new THREE.Mesh(new THREE.CylinderGeometry(.55, .4, .32, 16), xiushanMaterials.stoneShadow)
    capital.position.set(planX + offset, baseHeight + 4.02, entranceFace + .46)
    group.add(capital)
  }
  // 厚檐由三道逐级外挑的石带组成，并在下缘补密排小檐托。
  group.add(makeBox(entranceWidth * 1.02, .4, 1.92, xiushanMaterials.stoneShadow, planX, baseHeight + 4.26, entranceFace + .08))
  group.add(makeBox(entranceWidth * 1.12, .32, 2.14, xiushanMaterials.stone, planX, baseHeight + 4.62, entranceFace + .1))
  group.add(makeBox(entranceWidth * 1.18, .26, 2.34, xiushanMaterials.stoneShadow, planX, baseHeight + 4.91, entranceFace + .1))
  for (let index = 0; index < 13; index += 1) {
    const x = planX - entranceWidth * .47 + index * (entranceWidth * .94 / 12)
    group.add(makeBox(.42, .26, .42, xiushanMaterials.stoneShadow, x, baseHeight + 4.02, entranceFace + .72))
  }

  // 门廊上部为低矮弧肩式装饰墙，中央抬高并承托盾形浮饰。
  const parapetWidth = entranceWidth * .9
  const parapetHeight = 2.0
  const parapetDrop = .38
  const parapetPoints: Point[] = [
    [-parapetWidth * .5, 0], [-parapetWidth * .5, parapetHeight * .58],
    [-parapetWidth * .39, parapetHeight * .58], [-parapetWidth * .34, parapetHeight * .82],
    [-parapetWidth * .25, parapetHeight * .86], [-parapetWidth * .22, parapetHeight],
    [parapetWidth * .22, parapetHeight], [parapetWidth * .25, parapetHeight * .86],
    [parapetWidth * .34, parapetHeight * .82], [parapetWidth * .39, parapetHeight * .58],
    [parapetWidth * .5, parapetHeight * .58], [parapetWidth * .5, 0]
  ]
  group.add(makeFrontProfile(parapetPoints, .74, xiushanMaterials.stone, planX, baseHeight + 5.02 - parapetDrop, entranceFace + .42))

  const shieldPoints: Point[] = [[-.68, .5], [.68, .5], [.62, -.24], [0, -.72], [-.62, -.24]]
  group.add(makeFrontProfile(shieldPoints, .18, xiushanMaterials.stoneShadow, planX, baseHeight + 6.16 - parapetDrop, entranceFace + .87))
  for (const side of [-1, 1] as const) {
    const pylonX = planX + side * (entranceWidth * .37)
    group.add(makeBox(1.15, 2.2, .82, xiushanMaterials.stone, pylonX, baseHeight + 6.0 - parapetDrop, entranceFace + .44))
    group.add(makeBox(.62, 1.18, .16, xiushanMaterials.stoneShadow, pylonX, baseHeight + 5.9 - parapetDrop, entranceFace + .88))
    const urnStem = new THREE.Mesh(new THREE.CylinderGeometry(.3, .42, .48, 12), xiushanMaterials.stoneShadow)
    urnStem.position.set(pylonX, baseHeight + 7.34 - parapetDrop, entranceFace + .48)
    group.add(urnStem)
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(.6, 16, 8), xiushanMaterials.stone)
    bowl.scale.y = .58
    bowl.position.set(pylonX, baseHeight + 7.72 - parapetDrop, entranceFace + .48)
    group.add(bowl)
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(.58, .48, .18, 14), xiushanMaterials.stoneShadow)
    lip.position.set(pylonX, baseHeight + 7.91 - parapetDrop, entranceFace + .48)
    group.add(lip)
  }

  // 入口台阶比原模型略窄、略高，顶端保留门前平台。
  group.add(makeBox(entranceWidth * .88, baseHeight * .72, 1.35, xiushanMaterials.step, planX, baseHeight * .36, entranceFace + .8))
  for (let step = 0; step < 6; step += 1) {
    const stepHeight = .23 * (6 - step)
    group.add(makeBox(entranceWidth * .92 + step * .58, stepHeight, .7 + step * .58, xiushanMaterials.step, planX, stepHeight * .5, entranceFace + 1.35 + step * .29))
  }

  // 背面次入口用较小的双柱门套，对应航拍中另一长边中央凸出的入口。
  const rearEntryFace = rearZ - 1.45
  group.add(makeBox(7.0, baseHeight, 2.9, xiushanMaterials.stone, planX, baseHeight * .5, rearZ - .72))
  addDoor(planX, baseHeight + 1.65, rearEntryFace - .18, Math.PI, 2.45, 3.3)
  for (const x of [planX - 2.2, planX + 2.2]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(.34, .43, 3.75, 14), xiushanMaterials.stone)
    column.position.set(x, baseHeight + 2.0, rearEntryFace - .34)
    group.add(column)
  }
  group.add(makeBox(7.6, .48, 1.55, xiushanMaterials.stoneShadow, planX, baseHeight + 4.05, rearEntryFace - .2))
  group.add(makePediment(6.8, 1.25, .58, xiushanMaterials.stone, planX, baseHeight + 4.72, rearEntryFace - .44))
  for (let step = 0; step < 4; step += 1) {
    const stepHeight = .24 * (4 - step)
    group.add(makeBox(7.5 + step * .5, stepHeight, .62 + step * .55, xiushanMaterials.step, planX, stepHeight * .5, rearEntryFace - .68 - step * .28))
  }

  // “工”字形平屋面：通长中段保持较浅，两端翼楼分别向前后伸出，不再用整块矩形屋面填满凹口。
  group.add(makeBox(bodyWidth * 1.01, .46, mainDepth * 1.02, xiushanMaterials.roof, planX, wallTop + .22, planZ))
  const centralRoofSpan = bodyWidth - pavilionWidth * 2
  const roofExtensionDepth = (pavilionDepth - mainDepth) * .5
  for (const z of [frontZ + .12, rearZ - .12]) group.add(makeBox(centralRoofSpan, .8, .5, xiushanMaterials.stone, planX, wallTop + .72, z))
  for (const side of [-1, 1] as const) {
    const pavilionX = planX + side * (bodyWidth * .5 - pavilionWidth * .5)
    const pavilionInnerX = planX + side * (bodyWidth * .5 - pavilionWidth)
    group.add(makeBox(pavilionWidth * 1.035, .46, pavilionDepth * 1.01, xiushanMaterials.roof, pavilionX, wallTop + .22, planZ))
    for (const z of [pavilionFrontZ - .12, pavilionRearZ + .12]) group.add(makeBox(pavilionWidth * 1.035, .8, .5, xiushanMaterials.stone, pavilionX, wallTop + .72, z))
    group.add(makeBox(.5, .8, pavilionDepth * .97, xiushanMaterials.stone, planX + side * bodyWidth * .505, wallTop + .72, planZ))
    group.add(makeBox(.5, .8, roofExtensionDepth, xiushanMaterials.stone, pavilionInnerX, wallTop + .72, (frontZ + pavilionFrontZ) * .5))
    group.add(makeBox(.5, .8, roofExtensionDepth, xiushanMaterials.stone, pavilionInnerX, wallTop + .72, (rearZ + pavilionRearZ) * .5))
  }
  for (const x of [planX - 5.4, planX - 1.8, planX + 1.8, planX + 5.4]) {
    group.add(makeBox(2.4, 1.65, 2.1, xiushanMaterials.stoneShadow, x, wallTop + 1.28, planZ - depth * .12))
    group.add(makeBox(2.05, .28, 1.75, xiushanMaterials.roof, x, wallTop + 2.22, planZ - depth * .12))
  }
  for (const x of [planX - width * .3, planX + width * .31]) group.add(makeBox(2.5, .8, 1.8, xiushanMaterials.stoneShadow, x, wallTop + .82, planZ + depth * .06))

  // 中央题字冠墙为低坡折线顶，不使用普通三角山花；底部另设通长挑檐。
  const crownWidth = width * .31
  const crownHeight = 2.1
  const crownPoints: Point[] = [
    [-crownWidth * .5, 0], [-crownWidth * .5, crownHeight * .55],
    [-crownWidth * .38, crownHeight * .55], [-crownWidth * .35, crownHeight * .67],
    [0, crownHeight], [crownWidth * .35, crownHeight * .67],
    [crownWidth * .38, crownHeight * .55], [crownWidth * .5, crownHeight * .55],
    [crownWidth * .5, 0]
  ]
  group.add(makeBox(crownWidth * 1.08, .34, 1.02, xiushanMaterials.stoneShadow, planX, wallTop + .46, frontZ + .3))
  group.add(makeFrontProfile(crownPoints, .72, xiushanMaterials.stone, planX, wallTop + .48, frontZ + .32))
  group.add(makeBox(crownWidth * .18, .34, .78, xiushanMaterials.stoneShadow, planX, wallTop + .94, frontZ + .7))
  addLabel('堂 山 秀', '#b51f2d', crownWidth * .58, 1.2, planX, wallTop + 1.47, frontZ + 1.02, true)
  addLabel('新闻与传播学院', '#a79d89', entranceWidth * .76, .46, planX, wallTop - 1.02, frontZ + .74)

  return group
}

function createSiyuanHallLandmark(building: Building) {
  const first = building.footprint[0]
  const second = building.footprint[1]
  const centerX = building.footprint.reduce((total, [x]) => total + x, 0) / building.footprint.length
  const centerZ = building.footprint.reduce((total, [, z]) => total + z, 0) / building.footprint.length
  const rotation = Math.atan2(-(second[1] - first[1]), second[0] - first[0])
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const localFootprint = building.footprint.map(([x, z]) => {
    const dx = x - centerX
    const dz = z - centerZ
    return [cosine * dx - sine * dz, sine * dx + cosine * dz] as Point
  })
  const minX = Math.min(...localFootprint.map(([x]) => x))
  const maxX = Math.max(...localFootprint.map(([x]) => x))
  const minZ = Math.min(...localFootprint.map(([, z]) => z))
  const maxZ = Math.max(...localFootprint.map(([, z]) => z))
  const width = (maxX - minX) * .96
  const depth = (maxZ - minZ) * .96
  const planX = (minX + maxX) * .5
  const planZ = (minZ + maxZ) * .5

  const baseHeight = 4.15
  const upperHeight = 8.9
  const wallTop = baseHeight + upperHeight
  const rearFaceZ = planZ - depth * .31
  const recessedFrontZ = planZ + depth * .29
  const bodyDepth = recessedFrontZ - rearFaceZ
  const bodyZ = (recessedFrontZ + rearFaceZ) * .5
  const bodyWidth = width * .96
  const pavilionWidth = width * .19
  const pavilionDepth = depth * .18
  const pavilionFrontZ = recessedFrontZ + pavilionDepth
  const pavilionZ = recessedFrontZ + pavilionDepth * .5
  const porticoWidth = width * .24
  const porticoDepth = depth * .14
  const porticoFrontZ = recessedFrontZ + porticoDepth
  const porticoZ = recessedFrontZ + porticoDepth * .5

  const group = new THREE.Group()
  group.name = '思源堂 · 精细地标'
  group.position.set(centerX, 1.22, centerZ)
  group.rotation.y = rotation

  const addWindow = (
    x: number,
    y: number,
    z: number,
    angle: number,
    windowWidth: number,
    windowHeight: number,
    kind: 'large' | 'ground' | 'narrow' = 'large'
  ) => {
    const windowGroup = new THREE.Group()
    windowGroup.add(makeBox(windowWidth, windowHeight, .25, siyuanMaterials.frame, 0, 0, 0))
    windowGroup.add(makeBox(windowWidth * .78, windowHeight * .76, .1, siyuanMaterials.window, 0, 0, .18))
    const verticals = kind === 'narrow' ? [0] : [-.22, 0, .22]
    for (const offset of verticals) {
      windowGroup.add(makeBox(.09, windowHeight * .72, .12, siyuanMaterials.frame, windowWidth * offset, 0, .25))
    }
    const horizontals = kind === 'ground' ? [0] : [-.2, .2]
    for (const offset of horizontals) {
      windowGroup.add(makeBox(windowWidth * .72, .09, .12, siyuanMaterials.frame, 0, windowHeight * offset, .25))
    }
    windowGroup.add(makeBox(windowWidth * 1.12, .17, .34, siyuanMaterials.stoneShadow, 0, -windowHeight * .5 - .13, .16))
    windowGroup.position.set(x, y, z)
    windowGroup.rotation.y = angle
    group.add(windowGroup)
  }

  const addMainWindowRows = (x: number, z: number, angle: number) => {
    addWindow(x, 2.15, z, angle, 1.95, 1.45, 'ground')
    addWindow(x, 6.35, z, angle, 1.95, 2.65)
    addWindow(x, 10.55, z, angle, 1.95, 2.65)
  }

  // 背立面窗轴比正立面更密，独立缩窄，避免用正面大窗硬套后墙。
  const addRearWindowRows = (x: number, z: number) => {
    addWindow(x, 2.15, z, Math.PI, 1.55, 1.35, 'ground')
    addWindow(x, 6.35, z, Math.PI, 1.3, 2.8, 'narrow')
    addWindow(x, 10.55, z, Math.PI, 1.3, 2.8, 'narrow')
  }

  // 主体：一层白石基座、上部两层红砖墙和多层白色檐口。
  group.add(makeBox(bodyWidth, baseHeight, bodyDepth, siyuanMaterials.stone, planX, baseHeight * .5, bodyZ))
  group.add(makeBox(bodyWidth, upperHeight, bodyDepth, siyuanMaterials.brick, planX, baseHeight + upperHeight * .5, bodyZ))
  group.add(makeBox(bodyWidth * 1.012, .34, bodyDepth * 1.025, siyuanMaterials.stoneShadow, planX, baseHeight + .08, bodyZ))
  group.add(makeBox(bodyWidth * 1.025, .42, bodyDepth * 1.04, siyuanMaterials.stone, planX, wallTop + .18, bodyZ))
  group.add(makeBox(bodyWidth * 1.04, .34, bodyDepth * 1.055, siyuanMaterials.stoneShadow, planX, wallTop + .56, bodyZ))
  group.add(makeBox(bodyWidth * 1.02, .24, bodyDepth * 1.035, siyuanMaterials.roof, planX, wallTop + .84, bodyZ))

  // 檐口下连续齿饰，对应照片中白色主檐下方的细密方块。
  for (const z of [recessedFrontZ + .22, rearFaceZ - .22]) {
    for (let index = 0; index < 27; index += 1) {
      const x = planX - bodyWidth * .47 + index * (bodyWidth * .94 / 26)
      group.add(makeBox(.46, .34, .32, siyuanMaterials.stone, x, wallTop - .18, z))
    }
  }

  // 正面两端凸出的翼楼：白石底层三列矮窗，红砖二、三层各四列窄高窗。
  for (const side of [-1, 1] as const) {
    const pavilionX = planX + side * (bodyWidth * .5 - pavilionWidth * .5)
    group.add(makeBox(pavilionWidth, baseHeight, pavilionDepth, siyuanMaterials.stone, pavilionX, baseHeight * .5, pavilionZ))
    group.add(makeBox(pavilionWidth, upperHeight, pavilionDepth, siyuanMaterials.brick, pavilionX, baseHeight + upperHeight * .5, pavilionZ))
    group.add(makeBox(pavilionWidth * 1.04, .4, pavilionDepth * 1.07, siyuanMaterials.stone, pavilionX, wallTop + .18, pavilionZ))
    for (const offset of [-.28, 0, .28]) {
      addWindow(pavilionX + pavilionWidth * offset, 2.15, pavilionFrontZ + .14, 0, 1.85, 1.4, 'ground')
    }
    for (const offset of [-.33, -.11, .11, .33]) {
      const x = pavilionX + pavilionWidth * offset
      addWindow(x, 6.35, pavilionFrontZ + .14, 0, 1.5, 2.7, 'narrow')
      addWindow(x, 10.55, pavilionFrontZ + .14, 0, 1.5, 2.7, 'narrow')
    }

    // 翼楼内外转角均以通高白石壁柱收边，强化前后错台。
    for (const edge of [-.5, .5]) {
      group.add(makeBox(.68, wallTop, .72, siyuanMaterials.stone, pavilionX + pavilionWidth * edge, wallTop * .5, pavilionFrontZ + .1))
    }

    // 翼楼朝中央凹口的内侧返墙：每层两扇窗，补齐航拍中夹角位置的开窗。
    const innerReturnX = planX + side * (bodyWidth * .5 - pavilionWidth) - side * .14
    const innerReturnAngle = -side * Math.PI * .5
    for (const amount of [.32, .72]) {
      const z = recessedFrontZ + pavilionDepth * amount
      addWindow(innerReturnX, 2.1, z, innerReturnAngle, 1.25, 1.2, 'ground')
      addWindow(innerReturnX, 6.35, z, innerReturnAngle, 1.22, 2.65, 'narrow')
      addWindow(innerReturnX, 10.55, z, innerReturnAngle, 1.22, 2.65, 'narrow')
    }
    group.add(makeBox(.62, wallTop, .62, siyuanMaterials.stone, innerReturnX, wallTop * .5, recessedFrontZ + .08))
  }

  // 正面两段后退墙：中央门廊左右各四列窗，窗轴比两端翼楼更密。
  const recessInnerX = porticoWidth * .5 + 1.35
  const pavilionInnerX = bodyWidth * .5 - pavilionWidth - 1.15
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < 4; index += 1) {
      const distance = recessInnerX + index * ((pavilionInnerX - recessInnerX) / 3)
      addMainWindowRows(planX + side * distance, recessedFrontZ + .14, 0)
    }
  }

  // 四个外角以通高白石壁柱收边。
  for (const x of [planX - bodyWidth * .5, planX + bodyWidth * .5]) {
    for (const z of [rearFaceZ, recessedFrontZ]) {
      group.add(makeBox(.9, wallTop, .9, siyuanMaterials.stone, x, wallTop * .5, z))
    }
  }

  // 两侧长立面：白石壁柱分成 3 / 4 / 3 三组窄高窗，中央底层设置侧门。
  const sideStartZ = rearFaceZ + 1.25
  const sideEndZ = pavilionFrontZ - 1.1
  const sideSpan = sideEndZ - sideStartZ
  const sideBreaks = [sideStartZ, sideStartZ + sideSpan * .29, sideStartZ + sideSpan * .7, sideEndZ]
  const addSideDoor = (x: number, z: number, angle: number) => {
    const doorGroup = new THREE.Group()
    doorGroup.add(makeBox(1.95, 3.05, .3, siyuanMaterials.frame, 0, 0, 0))
    doorGroup.add(makeBox(1.48, 2.65, .14, siyuanMaterials.door, 0, -.08, .2))
    doorGroup.add(makeBox(.1, 2.5, .12, siyuanMaterials.frame, 0, -.08, .3))
    doorGroup.add(makeBox(1.38, .1, .12, siyuanMaterials.frame, 0, .58, .3))
    doorGroup.add(makeBox(2.28, .18, .42, siyuanMaterials.stoneShadow, 0, -1.66, .12))
    doorGroup.position.set(x, 2.55, z)
    doorGroup.rotation.y = angle
    group.add(doorGroup)
  }

  for (const side of [-1, 1] as const) {
    const x = planX + side * (bodyWidth * .5 + .15)
    const angle = side > 0 ? Math.PI * .5 : -Math.PI * .5

    // 四条通高白石带明确分隔三块红砖墙面。
    for (const z of sideBreaks) {
      group.add(makeBox(.74, wallTop, .9, siyuanMaterials.stone, x, wallTop * .5, z))
    }

    const panelCounts = [3, 4, 3]
    for (let panelIndex = 0; panelIndex < 3; panelIndex += 1) {
      const panelStart = sideBreaks[panelIndex]
      const panelEnd = sideBreaks[panelIndex + 1]
      const count = panelCounts[panelIndex]
      for (let index = 0; index < count; index += 1) {
        const amount = (index + 1) / (count + 1)
        const z = panelStart + (panelEnd - panelStart) * amount
        addWindow(x, 6.35, z, angle, 1.28, 2.72, 'narrow')
        addWindow(x, 10.55, z, angle, 1.28, 2.72, 'narrow')
      }
    }

    // 白石底层开口更密：两端各四扇，中段为左右各两扇加中央侧门。
    for (const panelIndex of [0, 2]) {
      const panelStart = sideBreaks[panelIndex]
      const panelEnd = sideBreaks[panelIndex + 1]
      for (let index = 0; index < 4; index += 1) {
        const amount = (index + 1) / 5
        addWindow(x, 2.1, panelStart + (panelEnd - panelStart) * amount, angle, 1.22, 1.22, 'ground')
      }
    }
    const middleStart = sideBreaks[1]
    const middleEnd = sideBreaks[2]
    for (const amount of [.14, .31, .69, .86]) {
      addWindow(x, 2.1, middleStart + (middleEnd - middleStart) * amount, angle, 1.18, 1.22, 'ground')
    }
    addSideDoor(x, (middleStart + middleEnd) * .5, angle)
  }

  // 正门门廊：门面保持在后退主墙，六柱独立前置，中间留出真正的廊下空间。
  const entranceFaceZ = recessedFrontZ + .16
  const canopyDepth = porticoDepth + .9
  const canopyZ = recessedFrontZ + canopyDepth * .5
  // 柱廊檐部拆成承重梁、饰带、挑檐和中央女儿墙，避免一整块白盒子。
  group.add(makeBox(porticoWidth * 1.14, .38, canopyDepth, siyuanMaterials.stone, planX, wallTop - .02, canopyZ))
  group.add(makeBox(porticoWidth * 1.08, .58, .72, siyuanMaterials.stoneShadow, planX, wallTop + .43, porticoFrontZ + .02))
  group.add(makeBox(porticoWidth * 1.17, .3, .92, siyuanMaterials.stone, planX, wallTop + .87, porticoFrontZ + .02))
  group.add(makeBox(porticoWidth * .62, .92, .66, siyuanMaterials.stone, planX, wallTop + 1.48, porticoFrontZ - .02))
  group.add(makePediment(porticoWidth * .78, .58, .74, siyuanMaterials.stone, planX, wallTop + 2.02, porticoFrontZ - .02))
  for (let index = 0; index < 13; index += 1) {
    const x = planX - porticoWidth * .48 + index * (porticoWidth * .96 / 12)
    group.add(makeBox(.38, .3, .42, siyuanMaterials.stone, x, wallTop - .34, porticoFrontZ + .43))
  }

  // 门窗落在后退门面上，并置于柱间而不是柱子正后方。
  for (const offset of [-5.35, 5.35]) addWindow(planX + offset, 6.35, entranceFaceZ, 0, 2.4, 2.9)
  for (const offset of [-5.35, 0, 5.35]) addWindow(planX + offset, 10.45, entranceFaceZ, 0, 2.4, 2.85)

  group.add(makeBox(3.45, 3.95, .3, siyuanMaterials.frame, planX, 6.12, entranceFaceZ + .1))
  group.add(makeBox(2.55, 3.32, .14, siyuanMaterials.door, planX, 5.9, entranceFaceZ + .31))
  group.add(makeBox(.13, 3.15, .15, siyuanMaterials.frame, planX, 5.9, entranceFaceZ + .4))
  group.add(makeBox(3.8, .36, .52, siyuanMaterials.stoneShadow, planX, 8.12, entranceFaceZ + .14))
  for (const x of [planX - 1.5, planX + 1.5]) group.add(makeBox(.34, 4.05, .48, siyuanMaterials.stone, x, 6.13, entranceFaceZ + .14))
  group.add(makeBox(2.42, .12, .15, siyuanMaterials.frame, planX, 6.84, entranceFaceZ + .4))
  for (const x of [planX - .58, planX + .58]) group.add(makeBox(.1, .72, .15, siyuanMaterials.frame, x, 7.22, entranceFaceZ + .4))

  const columnZ = porticoFrontZ - .28
  const columnBaseY = baseHeight
  const shaftBottomY = columnBaseY + .82
  const shaftHeight = 7.15
  const columnOffsets = [-6.8, -4.05, -1.35, 1.35, 4.05, 6.8]
  for (const offset of columnOffsets) {
    const x = planX + offset
    group.add(makeBox(1.12, .48, 1.12, siyuanMaterials.stoneShadow, x, columnBaseY + .24, columnZ))
    const lowerBase = new THREE.Mesh(new THREE.CylinderGeometry(.64, .64, .3, 16), siyuanMaterials.stone)
    lowerBase.position.set(x, columnBaseY + .63, columnZ)
    group.add(lowerBase)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(.38, .48, shaftHeight, 16), siyuanMaterials.stone)
    column.position.set(x, shaftBottomY + shaftHeight * .5, columnZ)
    group.add(column)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.54, .42, .28, 16), siyuanMaterials.stoneShadow)
    neck.position.set(x, shaftBottomY + shaftHeight + .14, columnZ)
    group.add(neck)
    group.add(makeBox(1.02, .24, 1.02, siyuanMaterials.stone, x, shaftBottomY + shaftHeight + .4, columnZ))
  }

  // 正面不是连续双段楼梯：两侧小梯先登低平台，平台中央再接通往门廊的主楼梯。
  const mainStairWidth = 11.7
  const lowerPlatformWidth = porticoWidth * .94
  const lowerPlatformHeight = 1.45
  const mainStepCount = 7
  const mainStepDepth = .58
  const stairStartZ = porticoFrontZ + .42
  group.add(makeBox(porticoWidth * 1.03, .42, porticoDepth + .12, siyuanMaterials.step, planX, baseHeight - .21, recessedFrontZ + porticoDepth * .5))

  const makeSlopedSideWall = (widthX: number, depthZ: number, backHeight: number, frontHeight: number, x: number, z: number) => {
    const halfWidth = widthX * .5
    const halfDepth = depthZ * .5
    const vertices = [
      -halfWidth, 0, -halfDepth, halfWidth, 0, -halfDepth, halfWidth, 0, halfDepth, -halfWidth, 0, halfDepth,
      -halfWidth, backHeight, -halfDepth, halfWidth, backHeight, -halfDepth, halfWidth, frontHeight, halfDepth, -halfWidth, frontHeight, halfDepth
    ]
    const indices = [
      0, 1, 4, 1, 5, 4,
      1, 2, 5, 2, 6, 5,
      2, 3, 6, 3, 7, 6,
      3, 0, 7, 0, 4, 7,
      4, 5, 7, 5, 6, 7,
      0, 3, 1, 1, 3, 2
    ]
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const wall = new THREE.Mesh(geometry, siyuanMaterials.stoneShadow)
    wall.position.set(x, 0, z)
    group.add(wall)
    return wall
  }

  // 从低平台通往门廊的中央主楼梯。
  const mainRise = (baseHeight - lowerPlatformHeight) / mainStepCount
  for (let index = 0; index < mainStepCount; index += 1) {
    const stepHeight = baseHeight - mainRise * index
    group.add(makeBox(mainStairWidth, stepHeight, mainStepDepth + .06, siyuanMaterials.step, planX, stepHeight * .5, stairStartZ + index * mainStepDepth))
  }

  const mainRun = mainStepCount * mainStepDepth
  const lowerPlatformDepth = 1.72
  const lowerPlatformZ = stairStartZ + mainRun - mainStepDepth * .5 + lowerPlatformDepth * .5
  group.add(makeBox(lowerPlatformWidth, lowerPlatformHeight, lowerPlatformDepth, siyuanMaterials.step, planX, lowerPlatformHeight * .5, lowerPlatformZ))

  // 平台正前方是封闭矮石墙，只在左右两端留出小楼梯入口。
  const frontWallWidth = porticoWidth * .95
  const frontWallHeight = lowerPlatformHeight + .48
  const frontWallZ = lowerPlatformZ + lowerPlatformDepth * .5 - .08
  group.add(makeBox(frontWallWidth, frontWallHeight, .56, siyuanMaterials.stone, planX, frontWallHeight * .5, frontWallZ))
  group.add(makeBox(frontWallWidth * 1.025, .18, .72, siyuanMaterials.stoneShadow, planX, frontWallHeight + .09, frontWallZ))
  group.add(makeBox(frontWallWidth * 1.01, .14, .64, siyuanMaterials.stoneShadow, planX, .38, frontWallZ + .02))
  group.add(makeBox(frontWallWidth * 1.01, .12, .64, siyuanMaterials.stoneShadow, planX, 1.05, frontWallZ + .02))

  const mainWallDepth = mainRun + .32
  const mainWallZ = stairStartZ + mainRun * .5 - mainStepDepth * .5
  for (const side of [-1, 1] as const) {
    makeSlopedSideWall(1.16, mainWallDepth, baseHeight + .7, lowerPlatformHeight + .55, planX + side * (mainStairWidth * .5 + .7), mainWallZ)
  }

  // 左右两侧各四级小楼梯，从地面登上矮石墙后的低平台。
  const sideStairWidth = 2.25
  const sideStepCount = 4
  const sideStepDepth = .52
  const sideStairStartX = frontWallWidth * .5 + .15
  const sideStairZ = frontWallZ - .42
  const sideRise = lowerPlatformHeight / sideStepCount
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < sideStepCount; index += 1) {
      const stepHeight = lowerPlatformHeight - sideRise * index
      const stepX = planX + side * (sideStairStartX + index * sideStepDepth)
      group.add(makeBox(sideStepDepth + .05, stepHeight, sideStairWidth, siyuanMaterials.step, stepX, stepHeight * .5, sideStairZ))
    }
    const sideRun = sideStepCount * sideStepDepth
    const wallX = planX + side * (sideStairStartX + sideRun * .5 - sideStepDepth * .5)
    for (const wallSide of [-1, 1] as const) {
      const wall = makeSlopedSideWall(.72, sideRun + .18, lowerPlatformHeight + .35, .45, wallX, sideStairZ + wallSide * (sideStairWidth * .5 + .38))
      wall.rotation.y = side * Math.PI * .5
    }
  }

  // 背面长墙由白色通高石带分为外翼四列与内段三列，三层窗轴严格对齐。
  const rearDividerDistance = bodyWidth * .5 - pavilionWidth
  for (const side of [-1, 1] as const) {
    group.add(makeBox(1.02, wallTop, .72, siyuanMaterials.stone, planX + side * rearDividerDistance, wallTop * .5, rearFaceZ - .12))
    const innerStart = width * .142
    const innerEnd = rearDividerDistance - 1.55
    for (let index = 0; index < 3; index += 1) {
      const distance = innerStart + index * ((innerEnd - innerStart) / 2)
      addRearWindowRows(planX + side * distance, rearFaceZ - .14)
    }
    const outerStart = rearDividerDistance + 1.75
    const outerEnd = bodyWidth * .5 - 2.0
    for (let index = 0; index < 4; index += 1) {
      const distance = outerStart + index * ((outerEnd - outerStart) / 3)
      addRearWindowRows(planX + side * distance, rearFaceZ - .14)
    }
  }

  // 背面折角凸厅：以梯形平面取代八边柱，仅保留一块宽正面和两块斜侧面。
  const bayBackHalf = width * .13
  const bayFrontHalf = width * .072
  const bayDepth = depth * .17
  const bayWallZ = rearFaceZ + .28
  const bayOuterZ = rearFaceZ - bayDepth
  const bayPlan: Point[] = [
    [planX - bayBackHalf, bayWallZ],
    [planX + bayBackHalf, bayWallZ],
    [planX + bayFrontHalf, bayOuterZ],
    [planX - bayFrontHalf, bayOuterZ]
  ]

  const makePlanVolume = (points: Point[], height: number, material: THREE.Material, y: number) => {
    const shape = new THREE.Shape()
    shape.moveTo(points[0][0], -points[0][1])
    for (const [x, z] of points.slice(1)) shape.lineTo(x, -z)
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
    geometry.rotateX(-Math.PI / 2)
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = y
    return mesh
  }

  group.add(makePlanVolume(bayPlan, baseHeight, siyuanMaterials.stone, 0))
  group.add(makePlanVolume(bayPlan, 7.55, siyuanMaterials.brick, baseHeight))

  const roofPlan: Point[] = [
    [planX - bayBackHalf - .42, bayWallZ + .25],
    [planX + bayBackHalf + .42, bayWallZ + .25],
    [planX + bayFrontHalf + .42, bayOuterZ - .32],
    [planX - bayFrontHalf - .42, bayOuterZ - .32]
  ]
  group.add(makePlanVolume(roofPlan, .42, siyuanMaterials.stone, baseHeight + 7.55))
  group.add(makePlanVolume(bayPlan, .12, siyuanMaterials.roof, baseHeight + 7.97))

  type BayPoint = { x: number; z: number }
  const leftBack: BayPoint = { x: planX - bayBackHalf, z: bayWallZ }
  const rightBack: BayPoint = { x: planX + bayBackHalf, z: bayWallZ }
  const leftFront: BayPoint = { x: planX - bayFrontHalf, z: bayOuterZ }
  const rightFront: BayPoint = { x: planX + bayFrontHalf, z: bayOuterZ }

  const addBayFaceWindow = (start: BayPoint, end: BayPoint, amount: number, y: number, ground: boolean) => {
    const dx = end.x - start.x
    const dz = end.z - start.z
    const length = Math.hypot(dx, dz)
    const normalX = -dz / length
    const normalZ = dx / length
    const angle = Math.atan2(normalX, normalZ)
    const x = start.x + dx * amount + normalX * .16
    const z = start.z + dz * amount + normalZ * .16
    addWindow(x, y, z, angle, ground ? 1.45 : 1.25, ground ? 1.35 : 2.7, ground ? 'ground' : 'narrow')
  }

  // 三个可见面每层各两窗；折角位置另加通高白石压条。
  const bayFaces: [BayPoint, BayPoint][] = [
    [rightBack, rightFront],
    [rightFront, leftFront],
    [leftFront, leftBack]
  ]
  for (const y of [2.15, 6.35, 10.2]) {
    for (const [start, end] of bayFaces) {
      addBayFaceWindow(start, end, .34, y, y < 4)
      addBayFaceWindow(start, end, .66, y, y < 4)
    }
  }
  for (const point of [rightBack, rightFront, leftFront, leftBack]) {
    group.add(makeBox(.58, 7.7, .58, siyuanMaterials.stone, point.x, baseHeight + 3.85, point.z))
  }

  // 平屋顶外缘的白色女儿墙跟随三段折线，不再使用整块八边形盖板。
  const addBayParapet = (start: BayPoint, end: BayPoint) => {
    const dx = end.x - start.x
    const dz = end.z - start.z
    const rail = makeBox(Math.hypot(dx, dz) + .45, .58, .38, siyuanMaterials.stone, (start.x + end.x) * .5, baseHeight + 8.28, (start.z + end.z) * .5)
    rail.rotation.y = Math.atan2(-dz, dx)
    group.add(rail)
  }
  for (const [start, end] of bayFaces) addBayParapet(start, end)

  // 屋顶设备层：一排七扇窄窗和两处浅色采光井。
  const roofBlockWidth = width * .43
  const roofBlockDepth = depth * .2
  const roofBlockZ = bodyZ - depth * .09
  group.add(makeBox(roofBlockWidth, 2.35, roofBlockDepth, siyuanMaterials.brick, planX, wallTop + 1.82, roofBlockZ))
  group.add(makeBox(roofBlockWidth * 1.04, .34, roofBlockDepth * 1.08, siyuanMaterials.stone, planX, wallTop + 3.12, roofBlockZ))
  for (let index = 0; index < 7; index += 1) {
    const x = planX - roofBlockWidth * .39 + index * (roofBlockWidth * .78 / 6)
    addWindow(x, wallTop + 1.82, roofBlockZ - roofBlockDepth * .5 - .12, Math.PI, 1.05, 1.25, 'narrow')
  }
  for (const x of [planX - roofBlockWidth * .28, planX + roofBlockWidth * .28]) {
    group.add(makeBox(5.2, .55, 4.0, siyuanMaterials.stone, x, wallTop + 1.2, bodyZ + 2.1))
  }

  return group
}

/** 西业务楼以用户提供的五视角模型重建，不复用东楼的规则围院立面。 */
function createWestBusinessLandmark(building: Building) {
  const points = building.footprint
  const centerX = points.reduce((sum, [x]) => sum + x, 0) / points.length
  const centerZ = points.reduce((sum, [, z]) => sum + z, 0) / points.length
  const rotation = Math.atan2(-(points[2][1] - points[1][1]), points[2][0] - points[1][0])
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const local = points.map(([x, z]) => [cosine * (x - centerX) - sine * (z - centerZ), sine * (x - centerX) + cosine * (z - centerZ)] as Point)
  const minX = Math.min(...local.map(([x]) => x))
  const maxX = Math.max(...local.map(([x]) => x))
  const minZ = Math.min(...local.map(([, z]) => z))
  const maxZ = Math.max(...local.map(([, z]) => z))
  const width = maxX - minX
  const depth = maxZ - minZ
  const X = (amount: number) => minX + amount * width
  const Z = (amount: number) => minZ + amount * depth
  const group = new THREE.Group()
  group.name = '综合业务西楼 · 参考模型细化'
  group.position.set(centerX, 1.22, centerZ)
  group.rotation.y = rotation
  const materials = {
    // 与中心图书馆使用同一个材质实例，避免贴图底色再把棕色推向红橙色。
    brick: libraryMaterials.brick,
    glass: new THREE.MeshLambertMaterial({ color: 0x343c3d }),
    frame: new THREE.MeshLambertMaterial({ color: 0x606967 }),
    sill: new THREE.MeshLambertMaterial({ color: 0xe5e3dc }),
    roof: new THREE.MeshLambertMaterial({ color: 0x85898a }),
    recess: new THREE.MeshLambertMaterial({ color: 0x35302b }),
    paving: businessMaterials.paving
  }
  const base = .65
  const floor = 3.9
  const highTop = base + floor * 4
  const middleTop = base + floor * 2
  const lowTop = base + floor
  const addVolume = (x0: number, x1: number, z0: number, z1: number, bottom: number, top: number, material = materials.brick) => {
    group.add(makeBox((x1 - x0) * width, top - bottom, (z1 - z0) * depth, material, X((x0 + x1) * .5), (bottom + top) * .5, Z((z0 + z1) * .5)))
  }
  const addPlanRoof = (plan: Point[], top: number) => {
    const vertices = plan.map(([x, z]) => [X(x), Z(z)] as Point)
    const geometry = new THREE.ExtrudeGeometry(squareFootprint(vertices), { depth: .17, bevelEnabled: false })
    geometry.rotateX(-Math.PI / 2)
    const roof = new THREE.Mesh(geometry, materials.roof)
    roof.position.y = top + .01
    group.add(roof)
    for (let index = 0; index < vertices.length; index += 1) {
      const a = vertices[index]
      const b = vertices[(index + 1) % vertices.length]
      const rail = makeBox(Math.hypot(b[0] - a[0], b[1] - a[1]), .13, .16, materials.sill, (a[0] + b[0]) * .5, top + .19, (a[1] + b[1]) * .5)
      rail.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0])
      group.add(rail)
    }
  }

  // 四层 L 形、二层带回折的西北块，以及东南一层 L 形，各自使用完整屋顶轮廓。
  addVolume(0, .649, .657, .9, base, highTop)
  addVolume(.46, .649, 0, .657, base, highTop)
  addPlanRoof([[.46, 0], [.649, 0], [.649, .9], [0, .9], [0, .657], [.46, .657]], highTop)
  // 二层东南角首层架空，保留能真正穿透视线的通道。
  addVolume(0, .424, 0, .4, base, middleTop)
  addVolume(0, .28, .4, .525, base, middleTop)
  addVolume(.28, .424, .4, .525, base + floor, middleTop)
  addVolume(0, .153, .525, .657, base, middleTop)
  addPlanRoof([[0, 0], [.424, 0], [.424, .525], [.153, .525], [.153, .657], [0, .657]], middleTop)
  group.add(makeBox(.52, floor, depth * .11, materials.sill, X(.354), base + floor * .5, Z(.46)))
  addVolume(.649, .861, .642, 1, base, lowTop)
  addVolume(.345, .649, .9, 1, base, lowTop)
  addPlanRoof([[.649, .642], [.861, .642], [.861, 1], [.345, 1], [.345, .9], [.649, .9]], lowTop)

  type WestFace = { x: number; z: number; angle: number }
  const south: WestFace = { x: X(.3245), z: Z(.9) + .06, angle: 0 }
  const east: WestFace = { x: X(.649) + .06, z: Z(.45), angle: Math.PI * .5 }
  const northMiddle: WestFace = { x: X(.212), z: Z(0) - .06, angle: Math.PI }
  const westMiddle: WestFace = { x: X(0) - .06, z: Z(.2625), angle: -Math.PI * .5 }
  const localFace = (face: WestFace) => {
    const detail = new THREE.Group()
    detail.position.set(face.x, 0, face.z)
    detail.rotation.y = face.angle
    group.add(detail)
    return detail
  }
  const addWindowRun = (face: WestFace, start: number, end: number, count: number, rows: number[], whiteSill = true, windowWidth = .59, windowHeight = 2.75) => {
    const detail = localFace(face)
    for (const row of rows) {
      const y = base + row * floor + 2.06
      for (let index = 0; index < count; index += 1) {
        const x = count === 1 ? (start + end) * .5 : start + (end - start) * index / (count - 1)
        detail.add(makeBox(windowWidth + .13, windowHeight + .12, .11, materials.recess, x, y, .03))
        detail.add(makeBox(windowWidth, windowHeight, .14, materials.glass, x, y, .10))
        // 参考模型是整扇深色窄窗，只有很细的横梃和上层下端白石块。
        detail.add(makeBox(windowWidth, .045, .16, materials.frame, x, y + .32, .19))
        if (whiteSill && row > 0) detail.add(makeBox(windowWidth + .1, .49, .22, materials.sill, x, y - windowHeight * .5 + .18, .14))
      }
    }
  }
  const addSquareRecesses = (face: WestFace, start: number, end: number, columns: number, rows: number, bottom: number, top: number) => {
    const detail = localFace(face)
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = start + (end - start) * column / (columns - 1)
        const y = bottom + (top - bottom) * row / (rows - 1)
        detail.add(makeBox(.43, .43, .12, materials.recess, x, y, .075))
        detail.add(makeBox(.48, .075, .22, materials.brick, x, y - .24, .17))
      }
    }
  }
  const addGlazedEntry = (face: WestFace, center: number, entryWidth: number, entryHeight: number, canopy = true) => {
    const detail = localFace(face)
    const y = base + entryHeight * .5
    detail.add(makeBox(entryWidth, entryHeight, .19, materials.glass, center, y, .16))
    const columns = Math.max(3, Math.round(entryWidth / 1.1))
    for (let index = 0; index <= columns; index += 1) {
      detail.add(makeBox(.07, entryHeight, .24, materials.frame, center - entryWidth * .5 + entryWidth * index / columns, y, .27))
    }
    for (let amount = 1.05; amount < entryHeight; amount += 1.08) {
      detail.add(makeBox(entryWidth, .055, .24, materials.frame, center, base + amount, .27))
    }
    if (canopy) {
      detail.add(makeBox(entryWidth + .9, .25, 1.6, materials.sill, center, base + Math.min(3.35, entryHeight * .52), .85))
    }
  }

  // 南侧长墙：西端留方孔阵列，上三层密排白石窗台窄窗；一层附楼遮挡部分不再重复加窗。
  const southLength = width * .649
  addWindowRun(south, -southLength * .5 + width * .1, southLength * .5 - 1.2, 34, [1, 2, 3])
  addWindowRun(south, -southLength * .5 + width * .1, width * (.33 - .3245), 13, [0], false)
  addSquareRecesses(south, -southLength * .5 + 1.5, -southLength * .5 + width * .08, 4, 7, 5.3, 14.15)
  addGlazedEntry(south, -southLength * .5 + width * .072, 1.65, 2.8, false)

  // 面向广场的东翼为四层长立面，首层中央玻璃厅有长雨棚，上层保持连续窄窗。
  const eastLength = depth * .9
  addWindowRun(east, -eastLength * .5 + 1.3, eastLength * .5 - 1.3, 34, [1, 2, 3])
  addWindowRun(east, depth * -.42, depth * -.26, 7, [0])
  addWindowRun(east, depth * .23, depth * .42, 8, [0])
  addGlazedEntry(east, depth * -.075, 9.6, floor * 1.72)
  const entryDetail = localFace(east)
  entryDetail.add(makeBox(.38, 3.05, 1.28, materials.sill, depth * -.075, base + 1.53, .73))
  entryDetail.add(makeBox(11.0, .3, 2.3, businessMaterials.stone, depth * -.075, .32, 1.16))

  // 东翼北端是大面积砖墙，仅靠院子的一侧开四列窄窗和首层玻璃入口。
  const northHigh: WestFace = { x: X(.5545), z: Z(0) - .06, angle: Math.PI }
  addWindowRun(northHigh, width * .015, width * .074, 4, [1, 2, 3])
  addGlazedEntry(northHigh, width * .042, width * .095, 3.5, false)
  // 朝院子的四层立面沿内侧开窗，端部保留留白。
  const highCourtEast: WestFace = { x: X(.46) - .06, z: Z(.3285), angle: -Math.PI * .5 }
  addWindowRun(highCourtEast, -depth * .3, depth * .3, 26, [1, 2, 3])
  addWindowRun(highCourtEast, -depth * .24, depth * .24, 20, [0], false)
  const highCourtSouth: WestFace = { x: X(.23), z: Z(.657) - .06, angle: Math.PI }
  addWindowRun(highCourtSouth, -width * .21, width * .21, 24, [0, 1, 2, 3])

  // 二层北面：方孔端墙、九列窄窗、双层玻璃入口和石雨棚分别成区。
  const middleLength = width * .424
  addSquareRecesses(northMiddle, middleLength * .29, middleLength * .45, 4, 6, 1.6, 6.95)
  addWindowRun(northMiddle, -middleLength * .03, middleLength * .24, 9, [1], false, .6, 3.0)
  addGlazedEntry(northMiddle, -middleLength * .29, middleLength * .19, 6.5)
  addGlazedEntry(northMiddle, middleLength * .27, 1.2, 6.5, false)
  addWindowRun(westMiddle, -depth * .235, depth * .235, 22, [0, 1])
  const middleEast: WestFace = { x: X(.424) + .06, z: Z(.2), angle: Math.PI * .5 }
  addWindowRun(middleEast, -depth * .18, depth * .18, 17, [0, 1])
  const middleCourt: WestFace = { x: X(.2885), z: Z(.525) + .06, angle: 0 }
  addWindowRun(middleCourt, -width * .125, width * .125, 13, [1], false)
  addWindowRun(middleCourt, -width * .1065, -width * .0365, 3, [0], false)
  addGlazedEntry(middleCourt, -width * .0165, 1.55, 3.5, false)
  const middleReturnSouth: WestFace = { x: X(.0765), z: Z(.657) + .06, angle: 0 }
  addSquareRecesses(middleReturnSouth, -width * .063, width * .063, 10, 6, 1.35, 6.9)
  const middleReturn: WestFace = { x: X(.153) + .06, z: Z(.591), angle: Math.PI * .5 }
  addWindowRun(middleReturn, -depth * .05, depth * .05, 5, [0, 1], false)

  // 一层长条窄窗上端白石，与高层下端白窗台区别表达。
  const addLowWindows = (face: WestFace, length: number, count: number) => {
    const detail = localFace(face)
    for (let index = 0; index < count; index += 1) {
      const x = -length * .5 + .8 + (length - 1.6) * index / (count - 1)
      detail.add(makeBox(.67, 3.25, .18, materials.glass, x, base + 1.89, .1))
      detail.add(makeBox(.72, .47, .24, materials.sill, x, base + 3.35, .14))
    }
  }
  addLowWindows({ x: X(.603), z: Z(1) + .06, angle: 0 }, width * .516, 27)
  addLowWindows({ x: X(.755), z: Z(.642) - .06, angle: Math.PI }, width * .212, 10)

  // 一层翼楼东侧为七跨砖柱廊架，梁下留实际空隙，白石内衬只放在梁下。
  const pergolaX0 = .861
  const pergolaX1 = 1
  const pergolaZ0 = .642
  const pergolaZ1 = 1
  addVolume(pergolaX0, pergolaX1, pergolaZ0, pergolaZ1, .03, .17, materials.paving)
  for (let bay = 0; bay <= 7; bay += 1) {
    const z = Z(pergolaZ0 + (pergolaZ1 - pergolaZ0) * bay / 7)
    group.add(makeBox(width * (pergolaX1 - pergolaX0), .62, .65, materials.brick, X((pergolaX0 + pergolaX1) * .5), lowTop - .27, z))
    group.add(makeBox(width * (pergolaX1 - pergolaX0) - .65, .22, .58, materials.sill, X((pergolaX0 + pergolaX1) * .5), lowTop - .70, z))
    group.add(makeBox(.68, lowTop - .17, .76, materials.brick, X(pergolaX1) - .34, (lowTop + .17) * .5, z))
  }

  // 露天内院和二层架空通道均保持铺地；不再用中央绿地占据参考模型的庭院。
  addVolume(.153, .46, .525, .657, .03, .13, materials.paving)
  addVolume(.424, .46, 0, .657, .03, .13, materials.paving)
  addVolume(.28, .424, .4, .525, .03, .13, materials.paving)

  // 按材质合并小窗、窗台和梁柱，细化后仍保持少量绘制调用。
  group.updateMatrixWorld(true)
  const inverse = group.matrixWorld.clone().invert()
  const geometriesByMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return
    const geometry = object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld))
    const geometries = geometriesByMaterial.get(object.material) ?? []
    geometries.push(geometry)
    geometriesByMaterial.set(object.material, geometries)
    object.geometry.dispose()
  })
  group.clear()
  for (const [material, geometries] of geometriesByMaterial) {
    const geometry = mergeGeometries(geometries, false)
    geometries.forEach((item) => item.dispose())
    if (geometry) group.add(new THREE.Mesh(geometry, material))
  }
  return group
}

/** 综合业务东、西楼：按总平面保留不同的院落和 4F / 2F / 1F 高差。 */
function createBusinessBuildingLandmark(building: Building) {
  if (building.id === 'osm-building-616829078') return createWestBusinessLandmark(building)
  return createEastBusinessLandmark(building)
}

/** 东业务楼：三面四层翼楼，东侧双开间架空连廊，西侧内院玻璃门厅。 */
function createEastBusinessLandmark(building: Building) {
  const points = building.footprint
  const centerX = points.reduce((sum, [x]) => sum + x, 0) / points.length
  const centerZ = points.reduce((sum, [, z]) => sum + z, 0) / points.length
  const rotation = Math.atan2(-(points[2][1] - points[1][1]), points[2][0] - points[1][0])
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const local = points.map(([x, z]) => [cosine * (x - centerX) - sine * (z - centerZ), sine * (x - centerX) + cosine * (z - centerZ)] as Point)
  const minX = Math.min(...local.map(([x]) => x))
  const maxX = Math.max(...local.map(([x]) => x))
  const minZ = Math.min(...local.map(([, z]) => z))
  const maxZ = Math.max(...local.map(([, z]) => z))
  const width = maxX - minX
  const depth = maxZ - minZ
  const group = new THREE.Group()
  group.name = '综合业务东楼 · 参考模型细化'
  group.position.set(centerX, 1.22, centerZ)
  group.rotation.y = rotation
  const X = (amount: number) => minX + amount * width
  const Z = (amount: number) => minZ + amount * depth
  const base = .65
  const floor = 3.9
  const highTop = base + floor * 4
  const hallTop = base + floor * 3
  const lowTop = base + floor
  const materials = {
    brick: libraryMaterials.brick,
    glass: new THREE.MeshLambertMaterial({ color: 0x343c3d }),
    frame: new THREE.MeshLambertMaterial({ color: 0x606967 }),
    stone: new THREE.MeshLambertMaterial({ color: 0xe5e3dc }),
    roof: new THREE.MeshLambertMaterial({ color: 0x85898a }),
    recess: new THREE.MeshLambertMaterial({ color: 0x35302b }),
    paving: businessMaterials.paving,
    lawn: businessMaterials.lawn,
    rail: new THREE.MeshLambertMaterial({ color: 0x919c9c, transparent: true, opacity: .32, depthWrite: false })
  }
  const addVolume = (x0: number, x1: number, z0: number, z1: number, bottom: number, top: number, material: THREE.Material = materials.brick) => {
    group.add(makeBox((x1 - x0) * width, top - bottom, (z1 - z0) * depth, material, X((x0 + x1) * .5), (bottom + top) * .5, Z((z0 + z1) * .5)))
  }
  const addRoof = (plan: Point[], top: number, courtyard?: Point[]) => {
    const vertices = plan.map(([x, z]) => [X(x), Z(z)] as Point)
    const shape = squareFootprint(vertices)
    if (courtyard) {
      const hole = new THREE.Path()
      courtyard.forEach(([x, z], index) => {
        if (index === 0) hole.moveTo(X(x), -Z(z))
        else hole.lineTo(X(x), -Z(z))
      })
      hole.closePath()
      shape.holes.push(hole)
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .17, bevelEnabled: false })
    geometry.rotateX(-Math.PI / 2)
    const roof = new THREE.Mesh(geometry, materials.roof)
    roof.position.y = top + .01
    group.add(roof)
    vertices.forEach((a, index) => {
      const b = vertices[(index + 1) % vertices.length]
      const rail = makeBox(Math.hypot(b[0] - a[0], b[1] - a[1]), .13, .16, materials.stone, (a[0] + b[0]) * .5, top + .19, (a[1] + b[1]) * .5)
      rail.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0])
      group.add(rail)
    })
  }

  // 北翼东北角首层是退入的玻璃入口，墙体分块留出实际凹口。
  addVolume(.20, .80, 0, .18, base, highTop)
  addVolume(.80, 1, .065, .18, base, base + floor)
  addVolume(.80, 1, 0, .18, base + floor, highTop)
  addVolume(.20, 1, .68, .86, base, highTop)
  addVolume(.20, .39, .18, .68, base, highTop)
  // 连廊不是实心东翼：底下跨三层挑空，上方另留一条水平通透开口。
  addVolume(.86, 1, .18, .68, base + floor * 2.55, base + floor * 3.05)
  addVolume(.86, 1, .18, .68, highTop - 1.15, highTop)
  addVolume(.86, 1, .325, .338, base, highTop)
  // 连续环形屋顶带真实内孔，不以矩形盖板遮住露天院子。
  addRoof([[.20, 0], [1, 0], [1, .86], [.20, .86]], highTop, [[.39, .18], [.86, .18], [.86, .68], [.39, .68]])
  for (const [x0, x1, z0, z1] of [[.39, .86, .18, .18], [.39, .86, .68, .68], [.39, .39, .18, .68], [.86, .86, .18, .68]]) {
    group.add(makeBox(Math.max(.16, (x1 - x0) * width), .13, Math.max(.16, (z1 - z0) * depth), materials.stone, X((x0 + x1) * .5), highTop + .19, Z((z0 + z1) * .5)))
  }
  addVolume(.39, .465, .235, .625, base, hallTop)
  addRoof([[.39, .235], [.465, .235], [.465, .625], [.39, .625]], hallTop)
  group.add(makeBox(.08, .62, depth * .39, materials.rail, X(.465), hallTop + .52, Z(.43)))

  type EastFace = { x: number; z: number; angle: number }
  const faceGroup = (position: EastFace) => {
    const face = new THREE.Group()
    face.position.set(position.x, 0, position.z)
    face.rotation.y = position.angle
    group.add(face)
    return face
  }
  const addWindows = (position: EastFace, start: number, end: number, count: number, rows: number[], white = true, windowWidth = .63) => {
    const face = faceGroup(position)
    for (const row of rows) {
      const y = base + row * floor + 2.02
      for (let index = 0; index < count; index += 1) {
        const x = count === 1 ? (start + end) * .5 : start + (end - start) * index / (count - 1)
        face.add(makeBox(windowWidth + .12, 2.87, .10, materials.recess, x, y, .025))
        face.add(makeBox(windowWidth, 2.75, .13, materials.glass, x, y, .10))
        face.add(makeBox(windowWidth, .04, .16, materials.frame, x, y + .30, .18))
        if (white && row > 0) face.add(makeBox(windowWidth + .10, .49, .22, materials.stone, x, y - 1.20, .14))
      }
    }
  }
  const addGlass = (position: EastFace, center: number, glassWidth: number, bottom: number, top: number, canopy = false) => {
    const face = faceGroup(position)
    face.add(makeBox(glassWidth, top - bottom, .17, materials.glass, center, (bottom + top) * .5, .14))
    const count = Math.max(2, Math.round(glassWidth / 1.05))
    for (let index = 0; index <= count; index += 1) {
      face.add(makeBox(.055, top - bottom, .22, materials.frame, center - glassWidth * .5 + glassWidth * index / count, (top + bottom) * .5, .25))
    }
    for (let y = bottom + 1.10; y < top; y += 1.10) face.add(makeBox(glassWidth, .05, .22, materials.frame, center, y, .25))
    if (bottom === base) {
      // 两扇门与上部幕墙分开，首层不再沿用白窗下块。
      for (const side of [-1, 1]) {
        const x = center + side * .55
        face.add(makeBox(.045, 2.60, .25, materials.frame, x + side * .45, base + 1.30, .28))
        face.add(makeBox(.045, .40, .12, materials.stone, x - side * .28, base + 1.25, .39))
      }
    }
    if (canopy) face.add(makeBox(glassWidth + .8, .27, 1.55, materials.stone, center, base + 3.28, .85))
  }
  const north: EastFace = { x: X(.60), z: Z(0) - .06, angle: Math.PI }
  const south: EastFace = { x: X(.60), z: Z(.86) + .06, angle: 0 }
  const west: EastFace = { x: X(.20) - .06, z: Z(.43), angle: -Math.PI * .5 }
  const eastNorth: EastFace = { x: X(1) + .06, z: Z(.09), angle: Math.PI * .5 }
  const eastSouth: EastFace = { x: X(1) + .06, z: Z(.77), angle: Math.PI * .5 }
  // 北侧长墙上层三排密窄窗，首层东北角留通长玻璃入口。
  addWindows(north, -width * .36, width * .31, 34, [1, 2, 3])
  addWindows(north, -width * .18, width * .31, 25, [0], false)
  addGlass({ x: X(.90), z: Z(.065) - .06, angle: Math.PI }, 0, width * .20, base, base + 3.45, true)
  addGlass({ x: X(1) + .06, z: Z(.0325), angle: Math.PI * .5 }, 0, depth * .065, base, base + 3.45)
  // 凹口入口的雨棚延伸到外墙线，不能藏在四层翼楼的挑出部分内。
  group.add(makeBox(width * .095, .27, depth * .065 + 1.3, materials.stone, X(.855), base + 3.28, Z(.0325) - .65))
  // 南侧东端是小方孔阵列，附楼后面保留连续的上三层窄窗。
  addWindows(south, -width * .36, width * .31, 34, [1, 2, 3])
  addWindows(south, -width * .16, width * .31, 23, [0], false)
  const southRecess = faceGroup(south)
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      southRecess.add(makeBox(.42, .42, .13, materials.recess, width * (.338 + column * .014), 4.7 + row * 1.55, .10))
    }
  }
  // 广场立面按 2 / 3 扇分组，不使用等距宽窗；中央是两层玻璃厅和长石雨棚。
  const westGroups = [[-.385, -.365], [-.325, -.305, -.285], [-.24, -.22], [-.185, -.165, -.145], [-.10, -.08, -.06], [-.015, .005, .025], [.072, .092], [.145, .165, .185], [.24], [.30, .32]]
  westGroups.forEach((positions) => positions.forEach((z) => addWindows(west, depth * z, depth * z, 1, [2, 3])))
  addWindows(west, -depth * .38, -depth * .16, 11, [0, 1])
  addWindows(west, depth * .26, depth * .39, 7, [1])
  addGlass(west, depth * .075, depth * .26, base, base + floor * 1.72, true)
  const westEntry = faceGroup(west)
  westEntry.add(makeBox(.40, 3.0, 1.22, materials.stone, depth * .075, base + 1.50, .77))
  for (const z of [-.29, -.215]) addGlass(west, depth * z, 1.85, base, base + 2.95, true)
  westEntry.add(makeBox(depth * .28, .25, 2.2, materials.stone, depth * .075, .30, 1.2))
  // 院口两端留大面积棕墙，窄竖窗与底部转角玻璃不把端墙铺满。
  addWindows(eastNorth, -depth * .055, -depth * .055, 1, [1, 2, 3])
  addWindows(eastSouth, depth * .052, depth * .052, 1, [1, 2, 3])
  addGlass(eastSouth, 0, depth * .18, base, base + 3.20)

  // 两侧内院墙均四层：上三层白窗下块，首层整扇窄门窗。
  const courtNorth: EastFace = { x: X(.645), z: Z(.18) + .06, angle: 0 }
  const courtSouth: EastFace = { x: X(.645), z: Z(.68) - .06, angle: Math.PI }
  addWindows(courtNorth, -width * .225, width * .325, 28, [1, 2, 3])
  addWindows(courtNorth, -width * .15, width * .325, 24, [0], false)
  addWindows(courtSouth, -width * .325, width * .225, 28, [1, 2, 3])
  addWindows(courtSouth, -width * .325, width * .15, 24, [0], false)
  addGlass(courtNorth, -width * .185, width * .10, base, base + 3.40)
  // 较低门厅向院内凸出，宽玻璃面及两侧窄长楼梯窗有独立砖柱分隔。
  const courtHall: EastFace = { x: X(.465) + .06, z: Z(.43), angle: Math.PI * .5 }
  const hallWidth = depth * .39
  const hallFace = faceGroup(courtHall)
  addGlass(courtHall, 0, hallWidth * .37, base, hallTop - 1.65)
  for (const side of [-1, 1]) {
    addGlass(courtHall, side * hallWidth * .255, hallWidth * .07, base, hallTop - 1.5)
    hallFace.add(makeBox(hallWidth * .08, .82, .24, materials.stone, side * hallWidth * .255, base + floor * .90, .30))
    addWindows(courtHall, side * hallWidth * .37, side * hallWidth * .43, 2, [1, 2])
    const door = side * hallWidth * .41
    addGlass(courtHall, door, 2.15, base, base + 2.95)
    hallFace.add(makeBox(2.8, .18, 1.65, materials.stone, door, .25, .80))
  }
  hallFace.add(makeBox(hallWidth * .37, .82, .24, materials.stone, 0, base + floor * .90, .30))
  // 门厅后方高层只在露出的最高一层开窗，不让窗片悬在低层屋顶上。
  const courtBack: EastFace = { x: X(.39) + .06, z: Z(.43), angle: Math.PI * .5 }
  addWindows(courtBack, -depth * .225, depth * .225, 22, [3])

  // 西南一层 L 形翼楼及开敞砖柱廊架，保持与四层主楼的高差。
  addVolume(.14, .20, .64, 1, base, lowTop)
  addVolume(.14, .52, .86, 1, base, lowTop)
  addRoof([[.14, .64], [.20, .64], [.20, .86], [.52, .86], [.52, 1], [.14, 1]], lowTop)
  const addLowWindows = (position: EastFace, length: number, count: number) => {
    const face = faceGroup(position)
    for (let index = 0; index < count; index += 1) {
      const x = -length * .5 + .8 + (length - 1.6) * index / (count - 1)
      face.add(makeBox(.66, 3.25, .16, materials.glass, x, base + 1.86, .10))
      face.add(makeBox(.72, .47, .23, materials.stone, x, base + 3.32, .14))
    }
  }
  addLowWindows({ x: X(.33), z: Z(1) + .06, angle: 0 }, width * .38, 17)
  addLowWindows({ x: X(.14) - .06, z: Z(.77), angle: -Math.PI * .5 }, depth * .20, 8)
  addGlass({ x: X(.14) - .06, z: Z(.665), angle: -Math.PI * .5 }, 0, 2.4, base, base + 3.0)
  addVolume(0, .14, .64, 1, .03, .17, materials.paving)
  for (let bay = 0; bay <= 7; bay += 1) {
    const z = Z(.64 + .36 * bay / 7)
    group.add(makeBox(width * .14, .62, .65, materials.brick, X(.07), lowTop - .27, z))
    group.add(makeBox(width * .14 - .65, .22, .58, materials.stone, X(.07), lowTop - .70, z))
    group.add(makeBox(.68, lowTop - .17, .76, materials.brick, X(0) + .34, (lowTop + .17) * .5, z))
  }
  // 院内中央花池与门厅前狭长草池：低矮石缘独立，不堵住东西穿行路线。
  addVolume(.39, 1, .18, .68, .03, .13, materials.paving)
  const addPlanter = (x0: number, x1: number, z0: number, z1: number) => {
    addVolume(x0, x1, z0, z1, .14, .32, materials.stone)
    addVolume(x0 + .006, x1 - .006, z0 + .006, z1 - .006, .32, .36, materials.lawn)
  }
  addPlanter(.61, .73, .35, .53)
  addPlanter(.50, .535, .28, .58)

  // 窗台、门框和梁柱按材质合并，细化不增加数百次独立绘制。
  group.updateMatrixWorld(true)
  const geometriesByMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const inverseGroup = group.matrixWorld.clone().invert()
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return
    const geometry = object.geometry.clone().applyMatrix4(inverseGroup.clone().multiply(object.matrixWorld))
    const geometries = geometriesByMaterial.get(object.material) ?? []
    geometries.push(geometry)
    geometriesByMaterial.set(object.material, geometries)
    object.geometry.dispose()
  })
  group.clear()
  for (const [material, geometries] of geometriesByMaterial) {
    const merged = mergeGeometries(geometries, false)
    geometries.forEach((geometry) => geometry.dispose())
    if (merged) group.add(new THREE.Mesh(merged, material))
  }
  return group
}

/**
 * 体育馆：总平面由三个南北向串联的圆角大厅组成。南端正立面以两座较高的
 * 红砖圆角翼楼夹住通高玻璃门厅，其余立面通过连续浅色腰线和窄窗统一。
 */
function createGymLandmark(building: Building) {
  const first = building.footprint[0]
  const frontEdgeEnd = building.footprint[3]
  const centerX = building.footprint.reduce((total, [x]) => total + x, 0) / building.footprint.length
  const centerZ = building.footprint.reduce((total, [, z]) => total + z, 0) / building.footprint.length
  const rotation = Math.atan2(-(frontEdgeEnd[1] - first[1]), frontEdgeEnd[0] - first[0])
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const footprint = building.footprint.map(([x, z]) => {
    const dx = x - centerX
    const dz = z - centerZ
    return [cosine * dx - sine * dz, sine * dx + cosine * dz] as Point
  })
  const minX = Math.min(...footprint.map(([x]) => x))
  const maxX = Math.max(...footprint.map(([x]) => x))
  const minZ = Math.min(...footprint.map(([, z]) => z))
  const maxZ = Math.max(...footprint.map(([, z]) => z))
  const width = maxX - minX
  const depth = maxZ - minZ

  const group = new THREE.Group()
  group.name = '体育馆 · 精细地标'
  group.position.set(centerX, 1.22, centerZ)
  group.rotation.y = rotation

  const gap = Math.max(4.8, depth * .038)
  const blockDepth = (depth - gap * 2) / 3
  const rearZ = minZ + blockDepth * .5
  const middleZ = rearZ + blockDepth + gap
  const frontZ = middleZ + blockDepth + gap
  const blocks = [
    { z: rearZ, width: width * .94, height: 11.6 },
    { z: middleZ, width: width * .96, height: 15.0 },
    { z: frontZ, width: width * .95, height: 16.2 }
  ]
  const baseHeight = .9
  const cornerRadius = Math.min(8.2, width * .085)

  blocks.forEach((block, index) => {
    group.add(makeRoundedPrism(block.width * 1.015, blockDepth * 1.02, baseHeight, cornerRadius + .25, gymMaterials.band, 0, 0, block.z))
    group.add(makeRoundedPrism(block.width, blockDepth, block.height - baseHeight, cornerRadius, gymMaterials.brick, 0, baseHeight, block.z))
    for (const y of [4.75, 8.45, 12.15].filter((level) => level < block.height - .65)) {
      group.add(makeRoundedPrism(block.width + .42, blockDepth + .42, .34, cornerRadius + .18, gymMaterials.band, 0, y, block.z))
      group.add(makeRoundedPrism(block.width + .3, blockDepth + .3, .12, cornerRadius + .12, gymMaterials.bandShadow, 0, y - .08, block.z))
    }
    group.add(makeRoundedPrism(block.width + .55, blockDepth + .55, .48, cornerRadius + .24, gymMaterials.band, 0, block.height, block.z))
    group.add(makeRoundedPrism(block.width - 1.1, blockDepth - 1.1, .32, Math.max(1.2, cornerRadius - .6), gymMaterials.roof, 0, block.height + .48, block.z))

    // 两侧首层是一排出入口，上层才是窄窗；顶层改为通风砖格。
    for (const side of [-1, 1] as const) {
      const sideX = side * (block.width * .5 + .16)
      for (let column = 0; column < 7; column += 1) {
        const z = block.z - blockDepth * .36 + column * (blockDepth * .72 / 6)
        // 首层双扇玻璃门，门框和中梃略凸出砖墙。
        group.add(makeBox(.27, 3.05, 2.05, gymMaterials.frame, sideX, 2.25, z))
        group.add(makeBox(.32, 2.68, 1.72, gymMaterials.door, sideX + side * .08, 2.25, z))
        group.add(makeBox(.35, 2.55, .1, gymMaterials.frame, sideX + side * .12, 2.25, z))
        for (const y of [6.55, 10.25, 13.65].filter((level) => level + 1.2 < block.height - .65)) {
          group.add(makeBox(.26, 2.35, 1.55, gymMaterials.frame, sideX, y, z))
          group.add(makeBox(.31, 1.92, 1.18, gymMaterials.glassSoft, sideX + side * .08, y, z))
        }
        if (index < 2) group.add(makeBox(.29, 1.18, 1.8, gymMaterials.brickDark, sideX + side * .08, block.height - 1.28, z))
      }
    }
  })

  // 三段之间由较低的交通带连接，航拍能读出三块大厅，但地面层仍连续。
  const connectors = [
    { z: (rearZ + middleZ) * .5, height: 8.4 },
    { z: (middleZ + frontZ) * .5, height: 10.6 }
  ]
  for (const connector of connectors) {
    group.add(makeRoundedPrism(width * .82, gap + 1.4, connector.height, 2.2, gymMaterials.brick, 0, baseHeight, connector.z))
    group.add(makeRoundedPrism(width * .835, gap + 1.6, .42, 2.3, gymMaterials.band, 0, baseHeight + connector.height, connector.z))
    for (const side of [-1, 1] as const) {
      group.add(makeBox(.25, 3.1, gap * .64, gymMaterials.glass, side * width * .412, 3.0, connector.z))
    }
  }

  // 南端两座圆角翼楼高出中央门厅一层，形成参考图最明显的凹形屋顶线。
  const frontWidth = blocks[2].width
  const glassWidth = frontWidth * .48
  const capWidth = (frontWidth - glassWidth) * .5
  const capHeight = 3.5
  for (const side of [-1, 1] as const) {
    const capX = side * (glassWidth * .5 + capWidth * .5)
    group.add(makeRoundedPrism(capWidth + .15, blockDepth, capHeight, Math.min(cornerRadius, capWidth * .33), gymMaterials.brick, capX, blocks[2].height, frontZ))
    group.add(makeRoundedPrism(capWidth + .58, blockDepth + .48, .38, Math.min(cornerRadius + .2, capWidth * .34), gymMaterials.band, capX, blocks[2].height + capHeight, frontZ))
    const sideX = side * (frontWidth * .5 + .16)
    for (let column = 0; column < 7; column += 1) {
      const z = frontZ - blockDepth * .36 + column * (blockDepth * .72 / 6)
      group.add(makeBox(.29, 1.18, 1.8, gymMaterials.brickDark, sideX + side * .08, blocks[2].height + capHeight - 1.3, z))
    }
  }

  const frontFaceZ = frontZ + blockDepth * .5 + .23
  const glassHeight = 11.35
  const glassCenterY = baseHeight + glassHeight * .5
  group.add(makeBox(glassWidth, glassHeight, .5, gymMaterials.glass, 0, glassCenterY, frontFaceZ))
  // 五开间通高玻璃门厅：宽砖柱与细金属横梃分开表达。
  for (let index = 0; index <= 5; index += 1) {
    const x = -glassWidth * .5 + index * (glassWidth / 5)
    group.add(makeBox(1.18, glassHeight + .55, .62, gymMaterials.brickDark, x, glassCenterY + .12, frontFaceZ + .03))
  }
  for (const amount of [.22, .42, .62, .82]) {
    group.add(makeBox(glassWidth - 1.1, .16, .7, gymMaterials.frame, 0, baseHeight + glassHeight * amount, frontFaceZ + .06))
  }
  for (let index = 0; index < 10; index += 1) {
    const doorWidth = (glassWidth - 2.6) / 10
    const x = -glassWidth * .5 + 1.3 + doorWidth * (index + .5)
    group.add(makeBox(doorWidth - .18, 2.65, .16, gymMaterials.door, x, baseHeight + 1.35, frontFaceZ + .36))
    group.add(makeBox(.1, 2.5, .18, gymMaterials.frame, x + doorWidth * .42, baseHeight + 1.35, frontFaceZ + .42))
  }

  const addFrontWindow = (x: number, y: number) => {
    group.add(makeBox(1.7, 2.25, .3, gymMaterials.frame, x, y, frontFaceZ + .12))
    group.add(makeBox(1.28, 1.85, .16, gymMaterials.glassSoft, x, y, frontFaceZ + .31))
  }
  for (const side of [-1, 1] as const) {
    const start = glassWidth * .5 + 3.1
    const end = frontWidth * .5 - cornerRadius - 1.4
    for (let column = 0; column < 5; column += 1) {
      const distance = start + column * ((end - start) / 4)
      for (const y of [2.8, 6.55, 10.25]) addFrontWindow(side * distance, y)
      group.add(makeBox(2.15, 1.18, .18, gymMaterials.brickDark, side * distance, blocks[2].height + capHeight - 1.3, frontFaceZ + .22))
    }
  }

  // 中央低檐上的馆名保持在玻璃门厅正上方。
  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 1024
  labelCanvas.height = 320
  const labelContext = labelCanvas.getContext('2d')
  if (labelContext) {
    labelContext.clearRect(0, 0, labelCanvas.width, labelCanvas.height)
    labelContext.fillStyle = '#f5f1e8'
    labelContext.textAlign = 'center'
    labelContext.textBaseline = 'middle'
    labelContext.font = '700 126px "Microsoft YaHei", sans-serif'
    labelContext.fillText('体育馆', labelCanvas.width * .5, 118)
    labelContext.font = '600 52px Arial, sans-serif'
    labelContext.fillText('G Y M', labelCanvas.width * .5, 235)
    const labelTexture = new THREE.CanvasTexture(labelCanvas)
    labelTexture.colorSpace = THREE.SRGBColorSpace
    labelTexture.anisotropy = Math.min(4, activeRenderer.capabilities.getMaxAnisotropy())
    const label = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 2.9), new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }))
    label.position.set(0, 13.95, frontFaceZ + .38)
    group.add(label)
  }

  // 前楼中央的大跨高位屋面：浅灰屋盖夹在两座圆角翼楼之间，前缘设连续采光带。
  const frontRoofWidth = frontWidth * .7
  const frontRoofDepth = blockDepth * .72
  const frontRoofZ = frontZ - blockDepth * .05
  const frontRoofBaseY = blocks[2].height + .48
  group.add(makeRoundedPrism(frontRoofWidth, frontRoofDepth, 2.35, 2.3, gymMaterials.roofDark, 0, frontRoofBaseY, frontRoofZ))
  group.add(makeRoundedPrism(frontRoofWidth - .85, frontRoofDepth - .85, .3, 2.0, gymMaterials.roof, 0, frontRoofBaseY + 2.35, frontRoofZ))
  const frontRoofFaceZ = frontRoofZ + frontRoofDepth * .5 + .08
  group.add(makeBox(frontRoofWidth - .35, 2.28, .3, gymMaterials.brick, 0, frontRoofBaseY + 1.14, frontRoofFaceZ))
  const clerestoryZ = frontRoofZ + frontRoofDepth * .5 + .16
  group.add(makeBox(frontRoofWidth * .56, .92, .34, gymMaterials.glass, 0, frontRoofBaseY + 1.0, clerestoryZ))
  for (const y of [frontRoofBaseY + .48, frontRoofBaseY + 1.52]) {
    group.add(makeBox(frontRoofWidth * .59, .18, .42, gymMaterials.bandShadow, 0, y, clerestoryZ + .03))
  }
  for (const side of [-1, 1] as const) {
    group.add(makeBox(.2, .95, .42, gymMaterials.frame, side * frontRoofWidth * .28, frontRoofBaseY + 1.0, clerestoryZ + .04))
  }
  // 参考航拍中屋盖后部可见的红砖矩形采光井。
  group.add(makeBox(10.4, .5, 5.6, gymMaterials.brickDark, 0, frontRoofBaseY + 2.8, frontRoofZ - frontRoofDepth * .2))
  group.add(makeBox(9.5, .16, 4.7, gymMaterials.roofDark, 0, frontRoofBaseY + 3.12, frontRoofZ - frontRoofDepth * .2))

  // 中、后两座大跨馆分别保留独立屋面，不跨越交通带，确保航拍仍能读出三段式总平面。
  for (const roofBlock of blocks.slice(0, 2)) {
    group.add(makeRoundedPrism(width * .72, blockDepth - 7.2, .82, 2.4, gymMaterials.roofDark, 0, roofBlock.height + .48, roofBlock.z))
    group.add(makeRoundedPrism(width * .70, blockDepth - 8.4, .28, 2.1, gymMaterials.roof, 0, roofBlock.height + 1.3, roofBlock.z))
  }
  for (const x of [-width * .2, width * .2]) {
    group.add(makeBox(8.4, .75, 6.2, gymMaterials.roofDark, x, blocks[0].height + 1.68, rearZ - blockDepth * .12))
  }

  // 正门前仅保留一组低矮台阶，不扩张原始建筑占地。
  for (let index = 0; index < 3; index += 1) {
    const height = .16 * (index + 1)
    group.add(makeBox(glassWidth * (.82 - index * .03), height, 1.15, gymMaterials.step, 0, height * .5, frontFaceZ + 1.2 + index * .68))
  }

  return group
}

/**
 * 大通学生活动中心：五个盒状主翼围绕中央内院放射展开。航拍中最重要的
 * 识别关系是“深色玻璃核心 + 架空白色镂空体块”，因此首轮先严格搭准
 * 五翼方向、长宽和高差，再用轻量程序纹理表达连续的几何穿孔表皮。
 */
function createDatongStudentCenterLandmark(building: Building) {
  const xs = building.footprint.map(([x]) => x)
  const zs = building.footprint.map(([, z]) => z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const width = maxX - minX
  const depth = maxZ - minZ
  const centerX = (minX + maxX) * .5
  const centerZ = (minZ + maxZ) * .5
  const scale = Math.min(width / 104.64, depth / 131.56)

  const group = new THREE.Group()
  group.name = '大通学生活动中心 · 精细地标'
  group.position.set(centerX, 1.22, centerZ)

  const makeScreenMaterial = (faceWidth: number, faceHeight: number) => {
    if (!datongScreenTexture) return datongMaterials.edge
    const texture = datongScreenTexture.clone()
    texture.repeat.set(Math.max(.42, faceWidth / 36), Math.max(.34, faceHeight / 36))
    texture.needsUpdate = true
    return new THREE.MeshLambertMaterial({ color: 0xffffff, map: texture, alphaTest: .34, side: THREE.DoubleSide })
  }
  const makeScreenBox = (boxLength: number, boxHeight: number, boxWidth: number, y: number) => {
    const endMaterial = makeScreenMaterial(boxWidth, boxHeight)
    const roofMaterial = makeScreenMaterial(boxLength, boxWidth)
    const sideMaterial = makeScreenMaterial(boxLength, boxHeight)
    const geometry = new THREE.BoxGeometry(boxLength, boxHeight, boxWidth)
    const mesh = new THREE.Mesh(geometry, [endMaterial, endMaterial, roofMaterial, roofMaterial, sideMaterial, sideMaterial])
    mesh.position.y = y
    return mesh
  }
  const addPlanSurface = (points: Point[], height: number, material: THREE.Material, parent: THREE.Group = group) => {
    const surface = new THREE.Mesh(new THREE.ShapeGeometry(squareFootprint(points)), material)
    surface.rotation.x = -Math.PI / 2
    surface.position.y = height
    parent.add(surface)
    return surface
  }

  // 方向直接取自 OSM 占地的五个外伸端：南、南西、北西、北与东。
  // 数值按顺时针排列，中央玻璃环带可以直接依次相连而不会交叉。
  const wings = [
    { angle: -137, length: 42, width: 26, radius: 34, height: 14.6 },
    { angle: -72, length: 56, width: 32, radius: 40, height: 16.0 },
    { angle: 7, length: 46, width: 34, radius: 34, height: 14.8 },
    { angle: 84, length: 40, width: 26, radius: 34, height: 14.2 },
    { angle: 145, length: 44, width: 30, radius: 35, height: 15.4 }
  ].map((wing) => ({
    ...wing,
    angle: THREE.MathUtils.degToRad(wing.angle),
    length: wing.length * scale,
    width: wing.width * scale,
    radius: wing.radius * scale,
    height: wing.height * scale
  }))

  const courtyardRadius = 11.8 * scale
  const courtyardPoints = wings.map(({ angle }) => [Math.cos(angle) * courtyardRadius, Math.sin(angle) * courtyardRadius] as Point)
  const courtyardShape = new THREE.Shape()
  courtyardPoints.forEach(([x, z], index) => {
    if (index === 0) courtyardShape.moveTo(x, -z)
    else courtyardShape.lineTo(x, -z)
  })
  courtyardShape.closePath()
  const courtyard = new THREE.Mesh(new THREE.ShapeGeometry(courtyardShape), datongMaterials.courtyard)
  courtyard.rotation.x = -Math.PI / 2
  courtyard.position.y = .28
  group.add(courtyard)
  // 一层平面中的庭院是绿地包围异形小水池，外围白色步道保持畅通。
  addPlanSurface(courtyardPoints.map(([x, z]) => [x * .78, z * .78] as Point), .31, datongMaterials.edge)
  addPlanSurface(courtyardPoints.map(([x, z]) => [x * .73, z * .73] as Point), .34, datongMaterials.garden)
  const pondShape = new THREE.Shape()
  const pondPoints: Point[] = []
  for (let index = 0; index < 40; index += 1) {
    const angle = index * Math.PI * 2 / 40
    const radius = (3.8 + .65 * Math.cos(angle * 3 + .5) + .42 * Math.sin(angle * 5)) * scale
    const x = Math.cos(angle) * radius + .65 * scale
    const z = Math.sin(angle) * radius * 1.13
    pondPoints.push([x, z])
    if (index === 0) pondShape.moveTo(x, -z)
    else pondShape.lineTo(x, -z)
  }
  pondShape.closePath()
  addPlanSurface(pondPoints.map(([x, z]) => [x * 1.09, z * 1.09] as Point), .36, datongMaterials.edge)
  const pond = new THREE.Mesh(new THREE.ShapeGeometry(pondShape), datongMaterials.pond)
  pond.name = '大通 · 内院异形水池'
  pond.rotation.x = -Math.PI / 2
  pond.position.y = .38
  group.add(pond)

  const terraceRadius = 16.6 * scale
  const terraceShape = new THREE.Shape()
  wings.forEach(({ angle }, index) => {
    const x = Math.cos(angle) * terraceRadius
    const z = Math.sin(angle) * terraceRadius
    if (index === 0) terraceShape.moveTo(x, -z)
    else terraceShape.lineTo(x, -z)
  })
  terraceShape.closePath()
  const courtyardHole = new THREE.Path()
  ;[...courtyardPoints].reverse().forEach(([x, z], index) => {
    const holeX = x * .84
    const holeZ = z * .84
    if (index === 0) courtyardHole.moveTo(holeX, -holeZ)
    else courtyardHole.lineTo(holeX, -holeZ)
  })
  courtyardHole.closePath()
  terraceShape.holes.push(courtyardHole)
  const terrace = new THREE.Mesh(new THREE.ShapeGeometry(terraceShape), datongMaterials.roof)
  terrace.rotation.x = -Math.PI / 2
  terrace.position.y = 7.08 * scale
  group.add(terrace)

  // 中央五边形由通高玻璃幕墙围合；白色压顶勾出照片中清晰的屋面回廊。
  for (let index = 0; index < courtyardPoints.length; index += 1) {
    const start = courtyardPoints[index]
    const end = courtyardPoints[(index + 1) % courtyardPoints.length]
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const segmentLength = Math.hypot(dx, dz)
    const centerSegmentX = (start[0] + end[0]) * .5
    const centerSegmentZ = (start[1] + end[1]) * .5
    const segmentAngle = Math.atan2(-dz, dx)
    // 湖侧门厅独立向外伸出，内院五面保持同一较低玻璃回廊高度。
    const isLakeFacade = index === 1
    const glassBase = .32 * scale
    const glassHeight = 6.8 * scale
    const glassCenterY = glassBase + glassHeight * .5
    const facadeDepth = isLakeFacade ? 1.5 : 1.15
    const glass = makeBox(segmentLength + .45, glassHeight, facadeDepth, isLakeFacade ? datongMaterials.glassSoft : datongMaterials.glass, centerSegmentX, glassCenterY, centerSegmentZ)
    glass.rotation.y = segmentAngle
    group.add(glass)
    const sill = makeBox(segmentLength + .72, .34, facadeDepth + .27, datongMaterials.frame, centerSegmentX, glassBase + glassHeight + .17, centerSegmentZ)
    sill.rotation.y = segmentAngle
    group.add(sill)
    for (const amount of [.2, .4, .6, .8]) {
      const mullion = makeBox(.16, glassHeight - .52, facadeDepth + .12, datongMaterials.frame, start[0] + dx * amount, glassCenterY, start[1] + dz * amount)
      mullion.rotation.y = segmentAngle
      group.add(mullion)
    }
    if (isLakeFacade) {
      for (const amount of [.34, .67]) {
        const transom = makeBox(segmentLength + .45, .16, facadeDepth + .14, datongMaterials.frame, centerSegmentX, glassBase + glassHeight * amount, centerSegmentZ)
        transom.rotation.y = segmentAngle
        group.add(transom)
      }
    } else {
      const transom = makeBox(segmentLength + .45, .14, facadeDepth + .14, datongMaterials.frame, centerSegmentX, glassBase + glassHeight * .5, centerSegmentZ)
      transom.rotation.y = segmentAngle
      group.add(transom)
    }
  }

  // 临湖门厅位于两座临湖翼楼之间，不在庭院中竖一片孤立高玻璃。
  const lakeStart = courtyardPoints[1]
  const lakeEnd = courtyardPoints[2]
  const lakeAngle = (wings[1].angle + wings[2].angle) * .5
  const lakeDirection = new THREE.Vector2(Math.cos(lakeAngle), Math.sin(lakeAngle))
  const hallStart = Math.hypot((lakeStart[0] + lakeEnd[0]) * .5, (lakeStart[1] + lakeEnd[1]) * .5)
  const hallEnd = 34.0 * scale
  const hallLength = hallEnd - hallStart
  const hallWidth = Math.hypot(lakeEnd[0] - lakeStart[0], lakeEnd[1] - lakeStart[1]) * .92
  const hallHeight = 12.5 * scale
  const lakeHall = new THREE.Group()
  lakeHall.name = '大通 · 临湖玻璃门厅'
  lakeHall.position.set(lakeDirection.x * (hallStart + hallEnd) * .5, 0, lakeDirection.y * (hallStart + hallEnd) * .5)
  lakeHall.rotation.y = -lakeAngle
  lakeHall.add(makeBox(hallLength, .32, hallWidth, datongMaterials.paving, 0, .34, 0))
  // 两侧白色穿孔表皮与退入的玻璃带，前端为完整两层通高幕墙。
  for (const side of [-1, 1] as const) {
    const sideScreen = new THREE.Mesh(new THREE.PlaneGeometry(hallLength, hallHeight - .45), makeScreenMaterial(hallLength, hallHeight - .45))
    sideScreen.position.set(0, (hallHeight + .45) * .5, side * hallWidth * .5)
    sideScreen.rotation.y = side < 0 ? Math.PI : 0
    lakeHall.add(sideScreen)
    lakeHall.add(makeBox(hallLength - .22, hallHeight - .55, .14, datongMaterials.glassSoft, 0, (hallHeight + .45) * .5, side * (hallWidth * .5 - .14)))
    lakeHall.add(makeBox(hallLength + .16, .24, .25, datongMaterials.edge, 0, hallHeight, side * hallWidth * .5))
  }
  const lakeFrontX = hallLength * .5 + .09
  lakeHall.add(makeBox(.22, hallHeight - .55, hallWidth - .42, datongMaterials.lakeGlass, lakeFrontX, (hallHeight + .45) * .5, 0))
  for (let index = 0; index <= 7; index += 1) {
    const z = -hallWidth * .5 + .18 + (hallWidth - .36) * index / 7
    lakeHall.add(makeBox(.30, hallHeight - .55, .105, datongMaterials.frame, lakeFrontX + .08, (hallHeight + .45) * .5, z))
  }
  for (const y of [3.1, 6.3, 9.4]) lakeHall.add(makeBox(.32, .14, hallWidth - .28, datongMaterials.frame, lakeFrontX + .08, y * scale, 0))
  for (const side of [-1, 1] as const) {
    const z = side * .55 * scale
    lakeHall.add(makeBox(.34, 2.8 * scale, .08, datongMaterials.frame, lakeFrontX + .10, 1.85 * scale, z))
    lakeHall.add(makeBox(.13, .42, .075, datongMaterials.edge, lakeFrontX + .26, 1.5 * scale, side * .34 * scale))
  }
  lakeHall.add(makeBox(hallLength + .25, .28, hallWidth + .24, datongMaterials.roof, 0, hallHeight + .15, 0))
  lakeHall.add(makeBox(.28, hallHeight, .28, datongMaterials.edge, lakeFrontX, hallHeight * .5, -hallWidth * .5))
  lakeHall.add(makeBox(.28, hallHeight, .28, datongMaterials.edge, lakeFrontX, hallHeight * .5, hallWidth * .5))
  // 门厅前平台与低台阶向湖侧展开，不更改大湖的原有边界。
  lakeHall.add(makeBox(4.2 * scale, .22, hallWidth + 2.0 * scale, datongMaterials.paving, hallLength * .5 + 2.1 * scale, .23, 0))
  for (let index = 0; index < 3; index += 1) {
    const stepHeight = .12 + index * .07
    lakeHall.add(makeBox(.55 * scale, stepHeight, hallWidth + 2.0 * scale, datongMaterials.edge, hallLength * .5 + (4.35 + index * .55) * scale, stepHeight * .5, 0))
  }
  group.add(lakeHall)

  for (const [wingIndex, wingDefinition] of wings.entries()) {
    const directionX = Math.cos(wingDefinition.angle)
    const directionZ = Math.sin(wingDefinition.angle)
    const wing = new THREE.Group()
    wing.name = `大通 · 楼翼 ${wingIndex + 1}`
    wing.position.set(directionX * wingDefinition.radius, 0, directionZ * wingDefinition.radius)
    // 每个体块的局部 X 轴沿放射方向，便于独立调整长度与内外立面。
    wing.rotation.y = Math.atan2(-directionZ, directionX)

    const supportHeight = (wingIndex === 1 || wingIndex === 2 ? 4.25 : 6.15) * scale
    const screenBottom = 5.55 * scale
    const screenTop = screenBottom + wingDefinition.height
    const isSlopedLakeWing = wingIndex === 1
    const supportLength = wingDefinition.length * (isSlopedLakeWing ? .65 : .9)
    const supportWidth = wingDefinition.width * .82
    const isLakeWing = wingIndex === 1 || wingIndex === 2
    const supportCenter = isSlopedLakeWing ? -wingDefinition.length * .12 : 1.25 * scale
    wing.add(makeBox(wingDefinition.length + 2.0 * scale, .20, wingDefinition.width + 2.0 * scale, datongMaterials.paving, 0, .11, 0))
    wing.add(makeBox(supportLength, supportHeight, supportWidth, isLakeWing ? datongMaterials.glassSoft : datongMaterials.glass, supportCenter, supportHeight * .5, 0))
    if (isLakeWing) {
      for (const side of [-1, 1] as const) {
        wing.add(makeBox(supportLength * .96, .16, .2, datongMaterials.frame, supportCenter, supportHeight * .52, side * (supportWidth * .5 + .08)))
        for (const amount of [-.4, -.2, 0, .2, .4]) {
          wing.add(makeBox(.14, supportHeight * .88, .2, datongMaterials.frame, supportCenter + supportLength * amount, supportHeight * .5, side * (supportWidth * .5 + .08)))
        }
      }
    }
    // 穿孔板后保留一层深色内衬，透明三角孔洞才会呈现照片中的真实深度。
    const core = makeBox(wingDefinition.length - .46, wingDefinition.height - .46, wingDefinition.width - .46, datongMaterials.glassSoft, 0, screenBottom + wingDefinition.height * .5, 0)
    const screen = makeScreenBox(wingDefinition.length, wingDefinition.height, wingDefinition.width, screenBottom + wingDefinition.height * .5)
    // 临湖大翼底边向外端升起，保持屋顶轮廓，只改变悬挑下缘。
    const slopedUnderside = (geometry: THREE.BufferGeometry) => {
      const positions = geometry.attributes.position
      for (let index = 0; index < positions.count; index += 1) {
        if (positions.getY(index) >= 0) continue
        const amount = (positions.getX(index) / wingDefinition.length + .5)
        positions.setY(index, positions.getY(index) + amount * 3.4 * scale)
      }
      positions.needsUpdate = true
      geometry.computeVertexNormals()
    }
    if (isSlopedLakeWing) {
      slopedUnderside(core.geometry)
      slopedUnderside(screen.geometry)
    }
    wing.add(core, screen)

    // 朝向内院的一端保留连续深色玻璃缝，表现白色表皮与核心之间的架空关系。
    wing.add(makeBox(.42, 3.65 * scale, wingDefinition.width * .78, datongMaterials.glassSoft, -wingDefinition.length * .5 - .12, 7.55 * scale, 0))
    for (const offset of [-.3, -.1, .1, .3]) {
      wing.add(makeBox(.48, 3.65 * scale, .16, datongMaterials.frame, -wingDefinition.length * .5 - .36, 7.55 * scale, wingDefinition.width * offset))
    }

    // 屏风上下边框与屋顶四周的浅色压条，避免纹样贴图看起来像一整块印花盒子。
    for (const y of [screenBottom + .16, screenTop - .16]) {
      if (isSlopedLakeWing && y < screenBottom + .3) {
        for (const side of [-1, 1]) {
          const rail = makeBox(Math.hypot(wingDefinition.length, 3.4 * scale), .32, .34, datongMaterials.edge, 0, y + 1.7 * scale, side * (wingDefinition.width * .5 + .08))
          rail.rotation.z = Math.atan2(3.4 * scale, wingDefinition.length)
          wing.add(rail)
        }
        wing.add(makeBox(.34, .32, wingDefinition.width + .42, datongMaterials.edge, wingDefinition.length * .5 + .08, y + 3.4 * scale, 0))
        wing.add(makeBox(.34, .32, wingDefinition.width + .42, datongMaterials.edge, -wingDefinition.length * .5 - .08, y, 0))
        continue
      }
      wing.add(makeBox(wingDefinition.length + .42, .32, .34, datongMaterials.edge, 0, y, wingDefinition.width * .5 + .08))
      wing.add(makeBox(wingDefinition.length + .42, .32, .34, datongMaterials.edge, 0, y, -wingDefinition.width * .5 - .08))
      wing.add(makeBox(.34, .32, wingDefinition.width + .42, datongMaterials.edge, wingDefinition.length * .5 + .08, y, 0))
      wing.add(makeBox(.34, .32, wingDefinition.width + .42, datongMaterials.edge, -wingDefinition.length * .5 - .08, y, 0))
    }
    group.add(wing)
  }

  // 同一楼翼内的压条、玻璃框和平台按材质合并，保留五翼、门厅与水池的独立结构。
  group.updateMatrixWorld(true)
  const detailGroups: THREE.Group[] = []
  group.traverse((object) => { if (object instanceof THREE.Group) detailGroups.push(object) })
  for (const detail of detailGroups.reverse()) {
    const inverse = detail.matrixWorld.clone().invert()
    const batches = new Map<THREE.Material, THREE.Mesh[]>()
    for (const object of detail.children) {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.name) continue
      const batch = batches.get(object.material) ?? []
      batch.push(object)
      batches.set(object.material, batch)
    }
    for (const [material, batch] of batches) {
      if (batch.length < 2) continue
      const geometries = batch.map(object => object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)))
      const merged = mergeGeometries(geometries, false)
      geometries.forEach(geometry => geometry.dispose())
      if (!merged) continue
      batch.forEach(object => { detail.remove(object); object.geometry.dispose() })
      detail.add(new THREE.Mesh(merged, material))
    }
  }
  return group
}

campusModel.buildings.forEach((building) => {
  const isCentralLibrary = building.id === 'osm-building-616829077'
  const isMuzhaiLibrary = building.id === 'osm-building-1430918551'
  const isXiushanHall = building.id === 'osm-building-1430918553'
  const isSiyuanHall = building.id === 'osm-building-1430918554'
  const isDatongStudentCenter = building.id === 'osm-building-616829080'
  const isGym = building.id === 'osm-building-1456224127'
  const isStadiumStand = building.id === STADIUM_STAND_ID
  const isBusinessBuilding = building.id === 'osm-building-616829078' || building.id === 'osm-building-616829079'
  const isWestPublicTeaching = WEST_PUBLIC_TEACHING_IDS.includes(building.id)
  const isEastLaboratory = EAST_LABORATORY_IDS.includes(building.id)
  const isFrontierCenter = building.id === FRONTIER_CENTER_ID
  const isZhouEnlaiStatue = building.id === ZHOU_ENLAI_STATUE_ID
  const isDetailedLandmark = isCentralLibrary || isMuzhaiLibrary || isXiushanHall || isSiyuanHall || isDatongStudentCenter || isGym || isBusinessBuilding || isStadiumStand || isWestPublicTeaching || isEastLaboratory || isFrontierCenter || isZhouEnlaiStatue
  // 地标底座同时承担点击命中和选中轮廓；精细体量作为它的子节点加入。
  const geometry = createWhiteBuildingGeometry(building, isZhouEnlaiStatue ? .12 : isDetailedLandmark ? 1.22 : undefined)
  const material = new THREE.MeshLambertMaterial({ color: isDetailedLandmark ? 0xd9cec0 : categoryColors[building.category] })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = building.name
  mesh.userData.building = building
  buildingGroup.add(mesh)
  buildingMeshes.set(building.id, mesh)

  if (isZhouEnlaiStatue) {
    const statue = createZhouEnlaiStatue()
    mesh.add(statue)
    mesh.userData.focusObject = statue
  }

  if (building.volumes) {
    // 补绘建筑只做白模；庭院保持低矮沙色地面，不用包络整块挤出填死中庭。
    const floorGeometry = new THREE.ExtrudeGeometry(squareFootprint(building.footprint), { depth: .12, bevelEnabled: false })
    floorGeometry.rotateX(-Math.PI / 2)
    const floor = new THREE.Mesh(floorGeometry, new THREE.MeshLambertMaterial({ color: 0xefebe2 }))
    floor.name = `${building.name}沙色庭院地面`
    mesh.add(floor)
  }

  if (isWestPublicTeaching) {
    const landmark = createWestPublicTeachingLandmark(building, libraryMaterials.brick)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isEastLaboratory) {
    const landmark = createEastLaboratoryLandmark(building, libraryMaterials.brick)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isFrontierCenter) {
    const landmark = createFrontierCenterLandmark(building, libraryMaterials.brick)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isCentralLibrary) {
    const landmark = createCentralLibraryLandmark(building)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isMuzhaiLibrary) {
    const landmark = createMuzhaiLibraryOrthographicModel(building)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isXiushanHall) {
    const landmark = createXiushanHallLandmark(building)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isSiyuanHall) {
    const landmark = createSiyuanHallLandmark(building)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isDatongStudentCenter) {
    const landmark = createDatongStudentCenterLandmark(building)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isGym) {
    const landmark = createGymLandmark(building)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isStadiumStand) {
    const landmark = createStadiumStand(building, campusModel.greens, libraryMaterials.brick)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (isBusinessBuilding) {
    const landmark = createBusinessBuildingLandmark(building)
    mesh.add(landmark)
    mesh.userData.focusObject = landmark
  }

  if (!isDetailedLandmark && (building.category === 'landmark' || building.category === 'library')) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }))
    edges.position.y = 0.2
    mesh.add(edges)
  }
})

// 必须在全部精细建筑完成后取包围盒，不能只凭原始 OSM 底盘判断是否穿模。
const renderedBuildingBounds = [...buildingMeshes.values()].map(mesh => {
  const bounds = new THREE.Box3().setFromObject(mesh)
  return { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z }
})
// Compute clearance BEFORE adding proxies; retain the original meshes for near views.
for (const mesh of buildingMeshes.values()) {
  const original = mesh.userData.focusObject as THREE.Object3D | undefined
  if (original) detailManager.register(mesh, original, mesh.userData.building.id === ZHOU_ENLAI_STATUE_ID)
}
const pavilionBounds = new THREE.Box3().setFromObject(lakesidePavilion)
const westRoadTrees = createWestRoadTrees(campusModel, renderedBuildingBounds, [...reservedSportsBounds, {
  minX: pavilionBounds.min.x, maxX: pavilionBounds.max.x, minZ: pavilionBounds.min.z, maxZ: pavilionBounds.max.z,
}])
landscapeGroup.add(westRoadTrees)
const treeDetails = [easternPineTrees, westRoadTrees].map(installTreeDetail)

let selectionOutline: THREE.LineSegments | undefined
let selectedBuilding: Building | undefined
function removeSelectionOutline() {
  if (!selectionOutline) return
  selectionOutline.removeFromParent(); selectionOutline.geometry.dispose()
  for (const material of Array.isArray(selectionOutline.material) ? selectionOutline.material : [selectionOutline.material]) material.dispose()
  selectionOutline = undefined
}

function focusPointFor(mesh: THREE.Object3D) {
  const focusObject = (mesh.userData.focusObject as THREE.Object3D | undefined) ?? mesh
  const center = new THREE.Box3().setFromObject(focusObject).getCenter(new THREE.Vector3())
  center.y = 0
  return center
}

function focusMinDistanceFor(mesh: THREE.Object3D) {
  const focusObject = (mesh.userData.focusObject as THREE.Object3D | undefined) ?? mesh
  const size = new THREE.Box3().setFromObject(focusObject).getSize(new THREE.Vector3())
  // 选中后允许靠近至足以观察窗套和屋顶细节，但按建筑本身的尺度设下限，
  // 不会穿入体块；回到全校视图时会恢复更大的导航距离。
  return THREE.MathUtils.clamp(size.length() * 1.28, mesh.userData.building?.id === ZHOU_ENLAI_STATUE_ID ? 10 : 78, 180)
}

function selectBuilding(building: Building, animate = true) {
  const mesh = buildingMeshes.get(building.id)
  if (!mesh) {
    removeSelectionOutline();selectedBuilding=building;renderDirty=true
    controls.minDistance=mapMinDistance
    mapUI.showBuilding(building,'场地地点')
    if(animate){const [x,z]=placePosition(building);controls.target.set(x,0,z);camera.position.set(x,310,z+380);controls.update()}
    return
  }
  removeSelectionOutline()
  selectionOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 10),
    new THREE.LineBasicMaterial({ color: 0x57216f, linewidth: 1.5 })
  )
  selectionOutline.position.y = building.id === ZHOU_ENLAI_STATUE_ID ? .025 : .9
  mesh.add(selectionOutline)
  selectedBuilding = building
  renderDirty = true
  controls.minDistance = focusMinDistanceFor(mesh)
  const modelHeight = building.id === 'osm-building-616829077'
    ? '约 37 m（视觉模型）'
    : building.id === 'osm-building-1430918551'
      ? '约 35 m（正交参考模型）'
      : `${building.height} m`
  mapUI.showBuilding(building, modelHeight)
  // A tap only selects. Search focuses; subsequent pan/zoom always uses the current view.
  if (animate) focusMesh(mesh)
}

function focusMesh(mesh: THREE.Object3D, focusPoint = focusPointFor(mesh)) {
  const center = focusPoint
  controls.target.copy(center)
  // 使用与默认视图相同的南侧观察方向，选中建筑后仍保持北上、东右。
  const offset = mesh.userData.building?.id === ZHOU_ENLAI_STATUE_ID ? new THREE.Vector3(0, 14, 30) : new THREE.Vector3(0, 360, 460)
  if (mesh.userData.building?.id !== ZHOU_ENLAI_STATUE_ID) {
    const box = new THREE.Box3().setFromObject((mesh.userData.focusObject as THREE.Object3D | undefined) ?? mesh)
    const size = box.getSize(new THREE.Vector3())
    const horizontalFit = size.x / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * .8)
    offset.setLength(Math.max(offset.length(), horizontalFit))
  }
  camera.position.copy(center).add(offset)
  controls.update()
}

function resetView() {
  // “回到全校视图”后，下一次缩放回到全校中心而非遗留的建筑锚点。
  selectedBuilding = undefined
  removeSelectionOutline()
  controls.minDistance = mapMinDistance
  controls.target.copy(mapCenter)
  camera.position.copy(mapCenter).add(defaultCameraOffset)
  controls.update()
  mapUI.clearSelection()
  renderDirty = true
}
function clearBuildingSelection() {
  selectedBuilding = undefined
  removeSelectionOutline()
  controls.minDistance = mapMinDistance
  mapUI.clearSelection()
  renderDirty = true
}
function zoomCamera(scale: number) {
  const target = controls.target
  const offset = camera.position.clone().sub(target)
  const currentDistance = offset.length() || controls.minDistance
  const nextDistance = THREE.MathUtils.clamp(currentDistance * scale, controls.minDistance, controls.maxDistance)
  camera.position.copy(target).add(offset.setLength(nextDistance))
  controls.update()
}
function rotateView(angle: number) {
  const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
  camera.position.copy(controls.target).add(offset); controls.update()
}
element('rotate-left').addEventListener('click', () => rotateView(-Math.PI / 8))
element('rotate-right').addEventListener('click', () => rotateView(Math.PI / 8))
function faceNorth() {
  const offset = camera.position.clone().sub(controls.target)
  const spherical = new THREE.Spherical().setFromVector3(offset)
  spherical.theta = 0
  camera.position.copy(controls.target).add(offset.setFromSpherical(spherical)); controls.update(); renderDirty = true
}
element('compass').addEventListener('click', faceNorth)
// N only changes bearing. The separate full-campus reset remains available in the menu.
element('north-up').addEventListener('click', faceNorth)
element('tilt-view').addEventListener('click', () => {
  const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
  spherical.phi = spherical.phi > .5 ? Math.PI * .06 : Math.PI * .30
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); controls.update()
})


const compassArrow = element<HTMLElement>('compass-arrow')
const projectedTarget = new THREE.Vector3()
const projectedNorth = new THREE.Vector3()
function updateCompass() {
  // 把世界坐标的北方向投影到屏幕，让用户旋转场景后仍能辨别实际北向。
  projectedTarget.copy(controls.target).project(camera)
  projectedNorth.copy(controls.target).add(new THREE.Vector3(0, 0, -100)).project(camera)
  const angle = Math.atan2(projectedNorth.x - projectedTarget.x, projectedNorth.y - projectedTarget.y) * THREE.MathUtils.RAD2DEG
  compassArrow.style.transform = `rotate(${angle}deg)`
}

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const activePointers = new Set<number>()
let pressPosition: { x: number, y: number } | undefined
let pointerMoved = false
canvas.addEventListener('pointerdown', (event) => {
  if (!activePointers.size) { pressPosition = { x: event.clientX, y: event.clientY }; pointerMoved = false }
  activePointers.add(event.pointerId)
  if (activePointers.size > 1) pointerMoved = true
})
canvas.addEventListener('pointermove', event => { if (pressPosition && Math.hypot(event.clientX - pressPosition.x, event.clientY - pressPosition.y) > 7) pointerMoved = true })
canvas.addEventListener('pointercancel', event => { activePointers.delete(event.pointerId); pointerMoved = true; if (!activePointers.size) pressPosition = undefined })
canvas.addEventListener('pointerup', (event) => {
  activePointers.delete(event.pointerId)
  const start = pressPosition
  if (!activePointers.size) pressPosition = undefined
  if (!start || pointerMoved || activePointers.size || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) return
  pickBuildingAt(event.clientX, event.clientY)
})
function pickBuildingAt(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  // Raycaster does not skip invisible LOD children. Pick only visible renderables.
  const pickables: THREE.Object3D[] = []
  buildingGroup.traverseVisible(object => { if (object instanceof THREE.Mesh) pickables.push(object) })
  const hit = raycaster.intersectObjects(pickables, false)[0]
  let object: THREE.Object3D | undefined = hit?.object
  while (object && !object.userData.building) object = object.parent ?? undefined
  const building = object?.userData.building as Building | undefined
  if (building) selectBuilding(building, false)
}
const mapTouch = installMapTouch(canvas, camera, controls, pickBuildingAt, () => { constrainMapCamera(camera, controls, modelBounds); renderDirty = true })
const mapMarkers = createMapMarkers(element('map-markers'), building => selectBuilding(building))
function updateMapMarkers() {
  const rect = viewport.getBoundingClientRect()
  camera.updateMatrixWorld()
  mapMarkers.update(mapUI.markerBuildings(), building => {
    const [x,z]=placePosition(building)
    const point = new THREE.Vector3(x, building.height+3, z).project(camera)
    return { x:(point.x+1)*rect.width/2, y:(1-point.y)*rect.height/2, visible:point.z>-1&&point.z<1&&Math.abs(point.x)<1&&Math.abs(point.y)<1 }
  }, selectedBuilding?.id, labelsVisible && buildingGroup.visible)
}

function resize() {
  const { width, height } = viewport.getBoundingClientRect()
  mapRendering.resize(width, height)
  camera.aspect = Math.max(width, 1) / Math.max(height, 1)
  camera.updateProjectionMatrix()
  renderDirty = true
}
const viewportObserver = new ResizeObserver(resize)
viewportObserver.observe(viewport)
window.addEventListener('resize', resize)
window.visualViewport?.addEventListener('resize', resize)
resize()

let ready = false
let fallbackStarted = false
function enterFallback(reason: string) {
  if (fallbackStarted) return
  fallbackStarted = true
  activeRenderer.setAnimationLoop(null)
  viewportObserver.disconnect()
  window.removeEventListener('resize', resize)
  window.visualViewport?.removeEventListener('resize', resize)
  controls.dispose()
  mapTouch.dispose()
  mapMarkers.destroy()
  mapRendering.dispose()
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose())
  scene.clear()
  activeRenderer.dispose()
  renderFallback(reason)
}
function renderFrame() {
  if (fallbackStarted) return
  controls.update()
  constrainMapCamera(camera, controls, modelBounds)
  detailManager.update(camera, viewport.clientHeight)
  for (const trees of treeDetails) trees.update(camera, viewport.clientHeight, detailManager.mode === 'full', performance.now())
  // Inertia continues updating, but a static scene does not redraw 60 times/second.
  if (!renderDirty && ready) return
  updateCompass()
  updateMapMarkers()
  try { mapRendering.render() } catch { enterFallback('三维渲染中断'); return }
  renderDirty = false
  totalRenderedFrames += 1
  if (!ready) { ready = true; mapUI.ready('3d') }
  const detail = detailManager.stats()
  const statsText = `按需绘制 · ${activeRenderer.info.render.calls} draw calls · 远 ${detail.coarse} / 中 ${detail.medium} / 近 ${detail.fine} · ${Math.round(activeRenderer.info.render.triangles / 1000)}k 面`
  if (renderStats.textContent !== statsText) renderStats.textContent = statsText
}
activeRenderer.setAnimationLoop(renderFrame)
document.addEventListener('visibilitychange', () => { if (!fallbackStarted) { if (!document.hidden) renderDirty = true; activeRenderer.setAnimationLoop(document.hidden ? null : renderFrame) } })
window.addEventListener('pagehide', () => { activeRenderer.setAnimationLoop(null); activePointers.clear(); pressPosition = undefined; pointerMoved = true })
window.addEventListener('pageshow', () => { if (!fallbackStarted && !document.hidden) { renderDirty = true; activeRenderer.setAnimationLoop(renderFrame) } })
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); enterFallback('三维上下文丢失，已切换2D') })

// Keep the experiment visibly inspectable in browser devtools without coupling it to the website.
Object.assign(window, { campusMapLab: { mode: '3d', scene, camera, controls, campusModel, places:mapUI.catalog, selectBuilding, resetView, zoom: zoomCamera, faceNorth, rendering: mapRendering.info, lod: detailManager, performance: () => ({ calls: activeRenderer.info.render.calls, triangles: activeRenderer.info.render.triangles, frames: totalRenderedFrames }), selected: () => selectedBuilding } })
mapUI.bind({ selectBuilding, resetView, clearSelection: clearBuildingSelection, refresh: () => { renderDirty = true }, zoom: zoomCamera, setLayer: (layer, visible) => { if(layer==='labels')labelsVisible=visible;else ({ buildings: buildingGroup, roads: roadGroup, landscape: landscapeGroup })[layer].visible = visible; renderDirty = true } })
}
} catch (error) { console.error('Campus 3D initialization failed', error); renderFallback('三维初始化失败') }
}
