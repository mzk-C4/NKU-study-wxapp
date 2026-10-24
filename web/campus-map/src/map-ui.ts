import type { Building, CampusSeed } from './data/jinnan-seed'
import { entryBuildingId, escapeHtml, modeUrl, selectionUrl } from './map-links'
import { matchesPlaceCategory, placeIcon, placeName } from './map-theme'
import type { PlaceCategory } from './map-theme'
import { createPlaceCatalog, placeTypeLabel } from './map-places'
import type { MapPlace } from './map-places'
import { createPlaceSearch } from './map-search'

export type MapLayer = 'buildings' | 'roads' | 'landscape' | 'labels'
export interface MapAdapter {
  selectBuilding(building: Building, animate?: boolean): void
  resetView(): void
  clearSelection?(): void
  refresh?(): void
  zoom(scale: number): void
  setLayer(layer: MapLayer, visible: boolean): void
}
export function installMapUI(model: CampusSeed) {
  const catalog=createPlaceCatalog(model),searchPlaces=createPlaceSearch(catalog)
  const findPlace=(id?:string)=>catalog.find(p=>p.id===id)
  const element = <T extends HTMLElement>(id: string) => {
    const node = document.getElementById(id); if (!node) throw new Error(`Missing map control: ${id}`)
    return node as T
  }
  const search = element<HTMLInputElement>('place-search'), results = element('search-results')
  const card = element('selection-card'), panel = document.querySelector<HTMLElement>('.side-panel')!
  const panelToggle = element<HTMLButtonElement>('map-panel-toggle'), status = element('map-status')
  const panelControls=element('map-panel-controls'),panelClose=element<HTMLButtonElement>('map-panel-close'),panelBackdrop=element<HTMLButtonElement>('map-panel-backdrop')
  const layers: MapLayer[] = ['buildings', 'roads', 'landscape', 'labels']
  let adapter: MapAdapter | undefined, selected: MapPlace | undefined, selectedHeight = '', detailsOpen = false
  let category: PlaceCategory = 'all', tab: 'all' | 'favorites' | 'recent' = 'all', expanded = false
  const readIds = (key: string) => { try { const values: unknown = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(values) ? values.filter(id => typeof id === 'string' && findPlace(id)).slice(0, 100) as string[] : [] } catch { return [] } }
  let favorites = readIds('nkustudy-map-favorites'), recent = readIds('nkustudy-map-recent').slice(0, 12)
  let storageUnavailable = false
  function saveIds(key: string, values: string[]) { try { localStorage.setItem(key, JSON.stringify(values)) } catch { storageUnavailable = true } }
  function closePanel(restoreFocus=false) {
    panel.classList.remove('is-open');panelToggle.setAttribute('aria-expanded','false');panelBackdrop.hidden=true
    if(restoreFocus)panelToggle.focus({preventScroll:true})
    adapter?.refresh?.()
  }
  function togglePanel() {
    if(panel.classList.contains('is-open')){closePanel(true);return}
    panel.classList.add('is-open');panelToggle.setAttribute('aria-expanded','true')
    const compact=document.body.classList.contains('map-compact')
    panelBackdrop.hidden=!compact
    if(compact){panelControls.scrollTop=0;panelClose.focus({preventScroll:true})}
    adapter?.refresh?.()
  }
  function refreshLinks() {
    const mode = document.body.dataset.mapMode
    for (const [id,target] of [['map-mode-switch','2d'],['map-mode-3d','3d']] as const) {
      const link = element<HTMLAnchorElement>(id); link.href = modeUrl(location.href, target)
      link.classList.toggle('is-active', mode === target); link.setAttribute('aria-current', mode === target ? 'page' : 'false')
    }
  }
  function setUrl(id?: string) { history.replaceState(null, '', selectionUrl(location.href, id)); refreshLinks() }
  const preferred = ['osm-building-616829077', 'reference-monument-zhou-enlai', 'osm-building-616829080', 'reference-building-dormitory-1']
  function places() {
    const ids = tab === 'favorites' ? favorites : tab === 'recent' ? recent : undefined
    const query = search.value.trim()
    return (query?searchPlaces(query,200):catalog.filter(p=>p.labelVisible||ids?.includes(p.id))).filter(b => matchesPlaceCategory(b,category) && (!ids || ids.includes(b.id)))
      .sort((a,b) => ids ? ids.indexOf(a.id)-ids.indexOf(b.id) : ((preferred.indexOf(a.id)+1)||100)-((preferred.indexOf(b.id)+1)||100))
  }
  function measure() {
    const compact = document.body.classList.contains('map-compact')
    document.documentElement.style.setProperty('--map-header-height', `${compact ? panel.getBoundingClientRect().bottom : 0}px`)
    document.documentElement.style.setProperty('--map-sheet-height', `${card.getBoundingClientRect().height}px`)
  }
  function renderSheet() {
    card.classList.toggle('is-empty', !selected); card.classList.toggle('is-expanded', expanded)
    const handle = `<button class="sheet-grab" data-sheet-toggle aria-label="${selected ? (detailsOpen ? '收起建筑详情' : '展开建筑详情') : (expanded ? '收起地点列表' : '展开地点列表')}" aria-expanded="${selected ? detailsOpen : expanded}"><span></span></button>`
    if (selected) {
      card.innerHTML = `${handle}<button class="selection-close" data-clear-selection aria-label="关闭地点详情">×</button><div class="place-detail-head"><span class="place-icon place-preview">${placeIcon(selected)}</span><div><h2>${escapeHtml(placeName(selected))}</h2><p>津南校区 · ${placeTypeLabel(selected)}${selected.sourceNote.includes('估位')?' · 参考图估位':''}</p></div></div><div class="selection-actions"><button class="primary-action" data-details aria-expanded="${detailsOpen}">查看详情 <span>›</span></button><button class="favorite-action ${favorites.includes(selected.id) ? 'is-saved' : ''}" data-favorite aria-pressed="${favorites.includes(selected.id)}">${favorites.includes(selected.id) ? '★ 已收藏' : '☆ 收藏'}</button></div><div class="place-details" ${detailsOpen ? '' : 'hidden'}><dl>${selected.buildingId?`<div><dt>模型高度</dt><dd>${escapeHtml(selectedHeight)}</dd></div>`:''}<div><dt>区域</dt><dd>${escapeHtml(selected.zone)}</dd></div><div><dt>地点类型</dt><dd>${placeTypeLabel(selected)}</dd></div></dl><p class="selection-warning">${escapeHtml(selected.sourceNote)} 不用于精确导航。</p></div>${storageUnavailable ? '<p class="storage-note">当前无法保存到本机，收藏仅在本次页面有效。</p>' : ''}`
    } else {
      const list = places()
      card.innerHTML = `${handle}<div class="place-tabs" role="tablist" aria-label="地点列表"><button data-place-tab="all" role="tab" aria-selected="${tab==='all'}">全部</button><button data-place-tab="favorites" role="tab" aria-selected="${tab==='favorites'}">常用</button><button data-place-tab="recent" role="tab" aria-selected="${tab==='recent'}">最近</button><span>共 ${list.length} 处</span></div><div class="place-list">${list.length ? list.map(b=>`<button class="place-row" data-building-id="${escapeHtml(b.id)}"><span class="place-icon">${placeIcon(b)}</span><span class="place-row-copy"><strong>${escapeHtml(placeName(b))}</strong><small>津南校区 · ${escapeHtml(b.category==='library'?'图书馆':b.zone)}</small></span><span class="place-chevron">›</span></button>`).join('') : `<p class="empty-places">${tab==='favorites' ? '收藏建筑后，会显示在这里' : tab==='recent' ? '查看过的建筑会显示在这里' : '这个分类暂时没有地点'}</p>`}</div><p class="storage-note">常用与最近仅存本机 · 最近最多 12 处</p>`
    }
    measure(); adapter?.refresh?.()
  }
  const ui = {
    catalog,
    bind(next: MapAdapter) {
      adapter = next
      for (const layer of layers) adapter.setLayer(layer, element<HTMLInputElement>(`layer-${layer}`).checked)
      const id = entryBuildingId(location.href), building = findPlace(id)
      if (building) adapter.selectBuilding(building)
      else { if (new URL(location.href).searchParams.has('buildingId')) setUrl(); renderSheet() }
    },
    showBuilding(building: Building, height = `${building.height} m（估计）`) {
      selected=findPlace(building.id);if(!selected)return;selectedHeight=height;detailsOpen=false;expanded=false
      recent=[building.id,...recent.filter(id=>id!==building.id)].slice(0,12);saveIds('nkustudy-map-recent',recent)
      search.value=placeName(selected);results.innerHTML='';search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');closePanel()
      element<HTMLInputElement>('layer-labels').checked=true;adapter?.setLayer('labels',true)
      element<HTMLInputElement>('layer-buildings').checked=true;adapter?.setLayer('buildings',true)
      setUrl(building.id);renderSheet()
    },
    clearSelection() { selected=undefined;search.value='';results.innerHTML='';search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');detailsOpen=false;expanded=false;closePanel();setUrl();renderSheet() },
    markerBuildings() {
      const list=catalog.filter(b=>b.labelVisible&&matchesPlaceCategory(b,category))
      return [...new Map([...(selected?[selected]:[]),...list].map(b=>[b.id,b])).values()]
    },
    ready(mode:'2d'|'3d',reason='') {
      document.body.dataset.mapMode=mode;document.body.dataset.mapReady='true';status.hidden=true
      element('mode-note').textContent=mode==='2d'?'2D 平面地图':'3D 校园地图';element('mode-note').title=reason
      element('help-popover').innerHTML=mode==='2d'?'<strong>平面地图操作</strong><p>拖动平移，双指或滚轮缩放。点击地点或搜索名称查看详情。</p>':'<strong>三维地图操作</strong><p>单指平移，双指捏合缩放、扭转转向、上下滑动调整俯仰。指南针只恢复朝北。电脑保留左键旋转、右键平移、滚轮缩放。</p>'
      for(const id of ['rotate-left','rotate-right','tilt-view','detail-mode','render-quality','compass'])element(id).hidden=mode==='2d'
      for(const id of ['detail-mode','render-quality'])element(id).closest('label')!.hidden=mode==='2d'
      refreshLinks();renderSheet()
    },
  }
  element('zone-list').innerHTML=[...new Set(model.buildings.map(b=>b.zone))].map(zone=>`<button data-zone="${escapeHtml(zone)}"><span>${escapeHtml(zone)}</span><small>${model.buildings.filter(b=>b.zone===zone).length}</small></button>`).join('')
  element('zone-list').addEventListener('click',e=>{const zone=(e.target as HTMLElement).closest<HTMLElement>('[data-zone]')?.dataset.zone;const building=model.buildings.find(b=>b.zone===zone);if(building)adapter?.selectBuilding(building)})
  search.addEventListener('input',()=>{
    const query=search.value.trim()
    if(!query){results.innerHTML='';search.setAttribute('aria-expanded','false');if(!selected)renderSheet();return}
    const matches=searchPlaces(query,20)
    results.innerHTML=matches.length?matches.map((b,i)=>`<button data-building-id="${escapeHtml(b.id)}" id="place-result-${i}" role="option" aria-selected="false"><span>${escapeHtml(placeName(b))}</span><small>${placeTypeLabel(b)}${b.sourceNote.includes('估位')?' · 参考图估位':''}</small></button>`).join(''):'<p class="no-results">没有找到地点，可试试简称、关键词或换一个字</p>'
    search.setAttribute('aria-expanded',String(matches.length>0))
  })
  let activeResult=-1
  search.addEventListener('input',()=>{activeResult=-1;search.removeAttribute('aria-activedescendant')})
  search.addEventListener('keydown',e=>{
    const buttons=[...results.querySelectorAll<HTMLButtonElement>('button')]
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!buttons.length)return;e.preventDefault();activeResult=(activeResult+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===activeResult)));search.setAttribute('aria-activedescendant',buttons[activeResult].id);buttons[activeResult].scrollIntoView({block:'nearest'})}
    if(e.key==='Enter'&&buttons.length){e.preventDefault();buttons[Math.max(0,activeResult)].click()}
  })
  results.addEventListener('click',e=>{const id=(e.target as HTMLElement).closest<HTMLElement>('[data-building-id]')?.dataset.buildingId;const building=findPlace(id);if(building){adapter?.selectBuilding(building);search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');search.blur()}})
  element('category-chips').addEventListener('click',e=>{
    const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-category]');if(!button)return
    category=button.dataset.category as PlaceCategory
    tab='all'
    element('category-chips').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)))
    if(selected)adapter?.clearSelection?.();else{search.value='';renderSheet()}
    adapter?.refresh?.()
  })
  card.addEventListener('click',e=>{
    const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return
    const building=findPlace(button.dataset.buildingId)
    if(building){adapter?.selectBuilding(building);return}
    if(button.hasAttribute('data-clear-selection')){if(adapter?.clearSelection)adapter.clearSelection();else ui.clearSelection();return}
    if(button.hasAttribute('data-details')){detailsOpen=!detailsOpen;renderSheet();return}
    if(button.hasAttribute('data-favorite')&&selected){favorites=favorites.includes(selected.id)?favorites.filter(id=>id!==selected!.id):[selected.id,...favorites];saveIds('nkustudy-map-favorites',favorites);renderSheet();return}
    if(button.dataset.placeTab){tab=button.dataset.placeTab as typeof tab;renderSheet();return}
    if(button.hasAttribute('data-sheet-toggle')){if(selected){detailsOpen=!detailsOpen}else expanded=!expanded;renderSheet()}
  })
  for(const layer of layers)element<HTMLInputElement>(`layer-${layer}`).addEventListener('change',e=>adapter?.setLayer(layer,(e.target as HTMLInputElement).checked))
  element('reset-view').addEventListener('click',()=>{closePanel();adapter?.resetView()})
  element('north-up').addEventListener('click',()=>{if(document.body.dataset.mapMode==='2d')adapter?.resetView()})
  element('zoom-in').addEventListener('click',()=>adapter?.zoom(.82));element('zoom-out').addEventListener('click',()=>adapter?.zoom(1.22))
  panelToggle.addEventListener('click',togglePanel)
  panelClose.addEventListener('click',()=>closePanel(true))
  panelBackdrop.addEventListener('click',()=>closePanel(true))
  document.addEventListener('pointerdown',e=>{
    if(!document.body.classList.contains('map-compact')||!panel.classList.contains('is-open'))return
    const target=e.target as Node
    if(!panelControls.contains(target)&&!panelToggle.contains(target)&&!panelBackdrop.contains(target))closePanel()
  })
  element('help-button').addEventListener('click',()=>{const help=element('help-popover');help.hidden=!help.hidden})
  element('share-map-link').addEventListener('click',async()=>{const button=element('share-map-link');try{await navigator.clipboard.writeText(location.href);button.textContent='已复制'}catch{button.textContent='请用微信右上角分享'}setTimeout(()=>{button.textContent='复制位置'},2500)})
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){results.innerHTML='';search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');search.blur();closePanel(panel.classList.contains('is-open'))}if(e.key.toLowerCase()==='r'&&document.activeElement!==search)adapter?.resetView()})
  const observer=new ResizeObserver(measure);observer.observe(panel);observer.observe(card)
  window.addEventListener('resize',()=>{if(!document.body.classList.contains('map-compact'))panelBackdrop.hidden=true;measure()})
  renderSheet()
  return ui
}
