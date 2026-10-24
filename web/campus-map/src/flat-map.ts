import type { Building, CampusSeed, Point } from './data/jinnan-seed'
import type { MapAdapter, MapLayer } from './map-ui'
import { escapeHtml } from './map-links'
import { ROAD_PROFILE, roadStripPolygons } from './road-profile'
import { MAP_THEME } from './map-theme'
import { createMapMarkers } from './map-markers'
import { LANDSCAPE_TREE_SITES } from './data/landscape-tree-sites'
import { createPlaceCatalog, placePosition } from './map-places'

const polygonPath = (points: Point[]) => `M${points.map(p => `${p[0]},${p[1]}`).join('L')}Z`
export function flatMapMarkup(model: CampusSeed): string {
  const plantedScope: Point[] = [[1430,-1345],[2230,-1275],[2126,23],[1410,-47]]
  const northeastReserve: Point[] = [[1824,-1299],[2230,-1275],[2183,-704],[1908,-736],[1919,-903],[1812,-985]]
  const exclusions = model.buildings.map(b => { const xs=b.footprint.map(p=>p[0]),zs=b.footprint.map(p=>p[1]);return `<rect x="${Math.min(...xs)-5}" y="${Math.min(...zs)-5}" width="${Math.max(...xs)-Math.min(...xs)+10}" height="${Math.max(...zs)-Math.min(...zs)+10}" fill="black"/>` }).join('')
  const gardenTrees = [...LANDSCAPE_TREE_SITES.east,...LANDSCAPE_TREE_SITES.west].map(([x,z])=>{const color=MAP_THEME.foliage[Math.abs(Math.round(x*13+z*7))%4];return `<circle class="flat-tree" cx="${x}" cy="${z}" r="3.05" fill="${color}"/>`}).join('')
  const roads = model.roads.map(road => {
    const fill = road.kind === 'walkway' ? MAP_THEME.path : MAP_THEME.road
    const edge = road.kind === 'walkway' ? MAP_THEME.pathEdge : MAP_THEME.roadEdge
    return `<path d="${roadStripPolygons(road, ROAD_PROFILE.edgeScale).map(polygonPath).join('')}" fill="${edge}"/><path d="${roadStripPolygons(road, ROAD_PROFILE.surfaceScale).map(polygonPath).join('')}" fill="${fill}"/>`
  }).join('')
  const colors = { academic: '#e6ded1', library: '#d5b99a', service: '#dcd3c4', residence: '#d7cec0', sport: '#cab18d', landmark: '#c58c62' }
  return `<svg id="flat-map" xmlns="http://www.w3.org/2000/svg" aria-label="津南校区完整二维地图" role="group">
    <defs><mask id="planted-land-mask" maskUnits="userSpaceOnUse" x="1400" y="-1360" width="870" height="1500"><path d="${polygonPath(plantedScope)}" fill="white"/><path d="${polygonPath(northeastReserve)}" fill="black"/>${exclusions}</mask></defs>
    <g data-map-layer="landscape"><path d="${polygonPath(plantedScope)}" fill="${MAP_THEME.green}" mask="url(#planted-land-mask)"/>${model.greens.map(area => `<path d="${polygonPath(area.polygon)}" fill="${area.kind === 'water' ? MAP_THEME.water : area.kind === 'green' ? MAP_THEME.green : MAP_THEME.plaza}"/>`).join('')}</g>
    <g data-map-layer="roads">${roads}</g>
    <g data-map-layer="buildings">${model.buildings.map(building => `<g data-building-id="${escapeHtml(building.id)}" tabindex="0" role="button" aria-label="${escapeHtml(building.name)}"><title>${escapeHtml(building.name)}</title>${(building.volumes ?? [{ footprint: building.footprint }]).map(part => `<path d="${polygonPath(part.footprint)}" fill="${colors[building.category]}" stroke="#927d65" stroke-width="1.2"/>`).join('')}</g>`).join('')}</g>
    <g class="flat-trees" aria-hidden="true">${gardenTrees}</g>
    <g data-map-layer="labels"></g>
  </svg>`
}

export function createFlatMap(viewport: HTMLElement, model: CampusSeed, onSelect: (building: Building) => void, onReset: () => void, markerBuildings: () => Building[] = () => createPlaceCatalog(model).filter(p=>p.labelVisible)) {
  viewport.querySelector('#map-canvas, #flat-map')?.remove()
  viewport.insertAdjacentHTML('afterbegin', flatMapMarkup(model))
  const svg = viewport.querySelector<SVGSVGElement>('#flat-map')!
  type View = { x: number; z: number; width: number; height: number }
  const bounds = model.meta.bounds
  let selected: Building | undefined
  let markersVisible = true, buildingsVisible = true
  const markers = createMapMarkers(viewport.querySelector<HTMLElement>('#map-markers')!, b => adapter.selectBuilding(b))
  let view: View = { x: bounds.minX, z: bounds.minZ, width: bounds.maxX - bounds.minX, height: bounds.maxZ - bounds.minZ }
  function updateMarkers() { const screen=size();markers.update(markerBuildings(), b => { const point=placePosition(b);const x=(point[0]-view.x)/view.width*screen.width,y=(point[1]-view.z)/view.height*screen.height;return {x,y,visible:x>0&&x<screen.width&&y>0&&y<screen.height} }, selected?.id,markersVisible&&buildingsVisible) }
  function commit() { svg.setAttribute('viewBox', `${view.x} ${view.z} ${view.width} ${view.height}`);updateMarkers() }
  function size() { const rect = svg.getBoundingClientRect(); return { width: rect.width || 1, height: rect.height || 1 } }
  function fit(x: number, z: number, width: number, height: number) {
    const screen = size(), ratio = screen.width / screen.height
    const w = Math.max(width, height * ratio), h = w / ratio
    view = { x: x - w / 2, z: z - h / 2, width: w, height: h }; commit()
  }
  const adapter: MapAdapter = {
    refresh: updateMarkers,
    clearSelection() {selected=undefined;svg.querySelectorAll('.is-selected').forEach(node=>node.classList.remove('is-selected'));onReset();updateMarkers()},
    selectBuilding(building) {
      selected = building
      svg.querySelectorAll('[data-building-id]').forEach(node => node.classList.toggle('is-selected', node.getAttribute('data-building-id') === building.id))
      const xs = building.footprint.map(p => p[0]), zs = building.footprint.map(p => p[1])
      fit((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(100, (Math.max(...xs) - Math.min(...xs)) * 1.7), Math.max(130, (Math.max(...zs) - Math.min(...zs)) * 1.7))
      onSelect(building)
    },
    resetView() {
      selected = undefined; svg.querySelectorAll('.is-selected').forEach(node => node.classList.remove('is-selected'))
      fit((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, (bounds.maxX - bounds.minX) * 1.04, (bounds.maxZ - bounds.minZ) * 1.04)
      onReset()
    },
    zoom(scale) {
      const width = Math.max(50, Math.min((bounds.maxX - bounds.minX) * 3, view.width * scale))
      fit(view.x + view.width / 2, view.z + view.height / 2, width, width * size().height / size().width)
    },
    setLayer(layer: MapLayer, visible: boolean) { (svg.querySelector(`[data-map-layer="${layer}"]`) as SVGGElement).style.display = visible ? '' : 'none';if(layer==='landscape')(svg.querySelector('.flat-trees') as SVGGElement).style.display=visible?'':'none';if(layer==='labels')markersVisible=visible;if(layer==='buildings')buildingsVisible=visible;updateMarkers() },
  }
  const pointers = new Map<number, { x: number; y: number }>()
  let gesture: { view: View; x: number; y: number; distance: number } | undefined
  let candidate = '', moved = false, multi = false
  function metrics() {
    const values = [...pointers.values()]
    return { x: values.reduce((n, p) => n + p.x, 0) / values.length, y: values.reduce((n, p) => n + p.y, 0) / values.length, distance: values.length > 1 ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) : 0 }
  }
  function begin() { gesture = { view: { ...view }, ...metrics() } }
  svg.addEventListener('pointerdown', event => {
    if (!pointers.size) { moved = false; multi = false; candidate = (event.target as Element).closest('[data-building-id]')?.getAttribute('data-building-id') ?? '' }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); multi ||= pointers.size > 1
    svg.setPointerCapture(event.pointerId); begin(); event.preventDefault()
  })
  svg.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = metrics(), screen = size(), base = gesture.view
    moved ||= Math.hypot(current.x - gesture.x, current.y - gesture.y) > 7
    const scale = gesture.distance && current.distance ? gesture.distance / current.distance : 1
    const width = Math.max(50, Math.min((bounds.maxX - bounds.minX) * 3, base.width * scale)), ratio = width / base.width
    const originX = base.x + (gesture.x - svg.getBoundingClientRect().left) / screen.width * base.width
    const originZ = base.z + (gesture.y - svg.getBoundingClientRect().top) / screen.height * base.height
    view = { x: originX - (current.x - svg.getBoundingClientRect().left) / screen.width * width, z: originZ - (current.y - svg.getBoundingClientRect().top) / screen.height * base.height * ratio, width, height: base.height * ratio }; commit()
  })
  function finish(event: PointerEvent, cancelled = false) {
    const released = pointers.get(event.pointerId)
    if (!released) return
    if (gesture) moved ||= Math.hypot(event.clientX - released.x, event.clientY - released.y) > 7
    pointers.delete(event.pointerId)
    if (pointers.size) { multi = true; begin(); return }
    gesture = undefined
    const building = model.buildings.find(b => b.id === candidate)
    if (!cancelled && !multi && !moved && building) adapter.selectBuilding(building)
  }
  svg.addEventListener('pointerup', event => finish(event))
  svg.addEventListener('pointercancel', event => finish(event, true))
  svg.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const id = (event.target as Element).closest('[data-building-id]')?.getAttribute('data-building-id')
    const building = model.buildings.find(b => b.id === id)
    if (building) { event.preventDefault(); adapter.selectBuilding(building) }
  })
  svg.addEventListener('wheel', event => { event.preventDefault(); adapter.zoom(event.deltaY > 0 ? 1.1 : .9) }, { passive: false })
  const observer = new ResizeObserver(() => fit(view.x + view.width / 2, view.z + view.height / 2, view.width, view.width * size().height / size().width))
  observer.observe(svg)
  // 初次装配不能清空 URL，否则随后绑定入口时会丢失建筑深链接。
  const initialWidth = Math.min(1250, bounds.maxX-bounds.minX)
  fit((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, initialWidth, initialWidth*size().height/size().width)
  return { ...adapter, selected: () => selected, destroy: () => { observer.disconnect(); markers.destroy();svg.remove() } }
}
