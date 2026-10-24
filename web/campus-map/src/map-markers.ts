import type { Building } from './data/jinnan-seed'
import { placeIcon, placeName } from './map-theme'
import { getPlaceKind } from './map-places'
import { layoutMapLabels } from './map-label-layout'

/** HTML markers stay crisp, independent of renderer resolution and model geometry. */
export function createMapMarkers(host: HTMLElement, onSelect: (building: Building) => void) {
  const buttons = new Map<string, HTMLButtonElement>()
  const activeTouches=new Set<number>()
  let multiTouch=false,lastTouch=0
  const trackDown=(e:PointerEvent)=>{if(e.pointerType!=='touch')return;if(!activeTouches.size)multiTouch=false;activeTouches.add(e.pointerId);multiTouch ||= activeTouches.size>1}
  const trackUp=(e:PointerEvent)=>{activeTouches.delete(e.pointerId)}
  document.addEventListener('pointerdown',trackDown,true)
  document.addEventListener('pointerup',trackUp,true)
  document.addEventListener('pointercancel',trackUp,true)
  function bindTouch(button:HTMLButtonElement,building:Building) {
    const starts=new Map<number,{x:number;y:number;moved:boolean}>()
    const forward=(event:PointerEvent,type=event.type)=>{
      const surface=host.parentElement?.querySelector<HTMLElement>('#map-canvas, #flat-map')
      surface?.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:event.pointerId,pointerType:'touch',isPrimary:event.isPrimary,clientX:event.clientX,clientY:event.clientY,buttons:type==='pointerup'||type==='pointercancel'?0:1,button:0}))
    }
    button.addEventListener('pointerdown',event=>{
      if(event.pointerType!=='touch')return
      event.preventDefault();starts.set(event.pointerId,{x:event.clientX,y:event.clientY,moved:false})
      forward(event);button.setPointerCapture(event.pointerId)
    })
    button.addEventListener('pointermove',event=>{
      const start=starts.get(event.pointerId);if(!start)return
      start.moved ||= Math.hypot(event.clientX-start.x,event.clientY-start.y)>7;forward(event)
    })
    for(const type of ['pointerup','pointercancel'])button.addEventListener(type,event=>{
      const pointer=event as PointerEvent,start=starts.get(pointer.pointerId);if(!start)return
      const tap=type==='pointerup'&&!multiTouch&&!start.moved&&Math.hypot(pointer.clientX-start.x,pointer.clientY-start.y)<=7
      // Cancel canvas picking on a clean label tap; every drag/pinch still reaches the map.
      forward(pointer,tap?'pointercancel':type);starts.delete(pointer.pointerId);lastTouch=performance.now()
      if(tap)onSelect(building)
    })
    button.addEventListener('click',()=>{if(performance.now()-lastTouch>500)onSelect(building)})
  }
  return { update(buildings: Building[], project: (building: Building) => { x: number; y: number; visible: boolean }, selectedId?: string, visible = true) {
    host.hidden = !visible
    if (!visible) return
    const ids = new Set(buildings.map(b => b.id))
    for (const [id,button] of buttons) if (!ids.has(id)) { button.remove(); buttons.delete(id) }
    const rect=host.getBoundingClientRect()
    const obstacles=[...document.querySelectorAll<HTMLElement>('.map-compact .side-panel, #selection-card, .map-actions, .map-overview, #compass, .canvas-header, .help-popover:not([hidden]), .map-compact .side-panel.is-open #map-panel-controls')].filter(n=>!n.hidden).map(n=>n.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>({left:r.left-rect.left,top:r.top-rect.top,right:r.right-rect.left,bottom:r.bottom-rect.top}))
    const candidates=buildings.map(building=>{
      const p=project(building),selected=selectedId===building.id
      return {id:building.id,...p,width:Math.min(172,36+[...placeName(building)].reduce((s,c)=>s+(/[\u3400-\u9fff]/.test(c)?11:6.5),0)),priority:('labelPriority' in building?Number(building.labelPriority):50),selected}
    })
    const layout=layoutMapLabels(candidates.filter(c=>c.visible),rect.width,rect.height,obstacles)
    for (const building of buildings) {
      let button = buttons.get(building.id)
      if (!button) {
        button = document.createElement('button'); button.className = 'map-pin'
        button.dataset.kind = getPlaceKind(building)
        button.dataset.placeId = building.id; button.setAttribute('aria-label', placeName(building))
        const glyph = document.createElement('span'); glyph.className = 'pin-glyph'; glyph.innerHTML = placeIcon(building)
        const label = document.createElement('span'); label.className = 'pin-label'; label.textContent = placeName(building)
        button.append(glyph,label); bindTouch(button,building)
        host.append(button); buttons.set(building.id, button)
      }
      const point = layout.get(building.id)
      button.hidden = !point; button.classList.toggle('is-selected', selectedId === building.id)
      if(point){button.dataset.side=point.side;button.style.transform = `translate(${point.x}px, ${point.y}px)`}
    }
  }, destroy() { buttons.forEach(b => b.remove()); buttons.clear();document.removeEventListener('pointerdown',trackDown,true);document.removeEventListener('pointerup',trackUp,true);document.removeEventListener('pointercancel',trackUp,true) } }
}
