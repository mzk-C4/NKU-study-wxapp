import type { Building } from './data/jinnan-seed'
import { getPlaceKind } from './map-places'

export const MAP_THEME = {
  primary: '#57216f', lavender: '#f5f1f8', base: '#f4f0e7',
  green: '#b8d0a0', water: '#adcbd6', road: '#eee9e1', roadEdge: '#c5bbaa',
  path: '#e6dbc8', pathEdge: '#c9b798', plaza: '#e9e2d5',
  foliage: ['#708968', '#7e9471', '#657f5e', '#8a9e79'],
} as const
export type PlaceCategory = 'all' | 'teaching' | 'food' | 'residence' | 'sport' | 'landmark' | 'services'
export function matchesPlaceCategory(building: Building, category: PlaceCategory) {
  const kind=getPlaceKind(building)
  if (category === 'teaching') return kind === 'academic' || kind === 'library'
  if (category === 'residence') return kind === 'residence'
  if (category === 'food') return kind === 'food'
  if (category === 'sport') return kind === 'sport'
  if (category === 'landmark') return ['landmark','park','water'].includes(kind)
  if (category === 'services') return ['shop','medical','bank','transport'].includes(kind)
  return true
}
export function placeName(building: Building) {
  if (building.id === 'osm-building-616829077') return '中心图书馆'
  return building.name.replace(/^南开大学[（(]?津南校区[）)]?/, '').replace(/^南开大学/, '') || building.name
}
export function placeIcon(building: Building) {
  const kind=getPlaceKind(building)
  const path = /雕像/.test(building.name) ? '<circle cx="12" cy="5" r="2"/><path d="M9 10h6l1 7H8l1-7Zm1 7v4m4-4v4M7 22h10M9 10l-2 5m8-5 2 4"/>'
    : kind === 'residence' ? '<path d="M5 20V5h14v15M9 20v-5h6v5M8 8h2m4 0h2M8 11h2m4 0h2"/>'
    : kind === 'food' ? '<path d="M6 3v7m3-7v7M4 3v5c0 4 7 4 7 0V3M7 12v9m11-18v18m0-18c-5 4-5 10 0 10"/>'
    : kind === 'sport' ? '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5 5c9 3 5 11 14 14M19 5C10 8 14 16 5 19"/>'
    : kind === 'medical' ? '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>'
    : kind === 'water' ? '<path d="M2 9c3-5 5 5 10 0s7 5 10 0M2 15c3-5 5 5 10 0s7 5 10 0"/>'
    : kind === 'park' ? '<path d="m12 2-7 9h3l-4 7h16l-4-7h3l-7-9Zm0 16v4"/>'
    : kind === 'shop' ? '<path d="M4 9h16v12H4V9Zm-1 0 2-6h14l2 6M8 21v-7h8v7M3 9c0 5 5 5 5 0 0 5 8 5 8 0 0 5 5 5 5 0"/>'
    : kind === 'transport' ? '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 12h14M9 19l-2 3m8-3 2 3M8 15h1m6 0h1"/>'
    : kind === 'academic' ? '<path d="m2 8 10-5 10 5-10 5-10-5Zm4 3v6c4 3 8 3 12 0v-6m4-3v10"/>'
    : '<path d="m3 8 9-5 9 5H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18"/>'
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}
