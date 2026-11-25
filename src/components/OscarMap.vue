<template>
  <div class="oscar-map-shell">
    <p v-if="downloadError" class="map-download-error" role="alert">{{ downloadError }}</p>
    <div v-show="identifying" class="oscar-map-wait">{{ $t('map.identifying') }}</div>
    <div class="oscar-ol-wrap" :class="{ 'oscar-ol-wrap--single-world': basemap === 'osm', 'oscar-ol-wrap--drawing': drawingArea }" ref="wrapEl">
      <div ref="amapEl" class="oscar-amap" :style="{ visibility: basemap === 'amap' ? 'visible' : 'hidden' }"></div>
      <div ref="basemapEl" class="oscar-basemap" aria-hidden="true"></div>
      <div ref="mapEl" class="map oscar-ol-map"></div>
      <div ref="areaPinEl" class="area-station-pin" aria-hidden="true">
        <svg v-if="activeAreaStation" viewBox="0 0 256 240" :style="{ color: domainColors[activeAreaStation.domain] }">
          <path :d="areaPinPath" />
        </svg>
      </div>
      <div ref="areaHoverPinEl" class="area-station-pin" aria-hidden="true">
        <svg v-if="hoveredAreaStation" viewBox="0 0 256 240" :style="{ color: domainColors[hoveredAreaStation.domain] }">
          <path :d="areaPinPath" />
        </svg>
      </div>

      <section v-if="selectedArea" v-show="!drawingArea" class="area-results" :aria-label="areaTitle" :aria-busy="loading">
        <header class="area-results__header">
          <h3 aria-live="polite">{{ areaTitle }}</h3>
          <button type="button" :aria-label="areaSortLabel" :title="areaSortLabel"
                  @click="areaAscending = !areaAscending; setAreaPage(1)">{{ areaAscending ? '↑' : '↓' }}</button>
        </header>
        <p v-if="loading" class="area-results__status" role="status">{{ t('common.loading') }}</p>
        <div v-if="mapError" class="area-results__status" role="alert">
          {{ mapError }} <button type="button" @click="loadViewport">{{ t('common.retry') }}</button>
        </div>
        <p v-else-if="!loading && !areaStations.length" class="area-results__status">{{ t('search.noMatching') }}</p>
        <ul v-else ref="areaList" class="area-results__list">
          <li v-for="{ station, row, status } in areaPageStations" :key="station.wigosId" :data-station="station.wigosId"
              :class="{ 'area-results__active': activeAreaStation?.wigosId === station.wigosId }"
              @mouseenter="highlightAreaStation(station)" @mouseleave="highlightAreaStation()"
              @click="locateAreaStation(station)">
            <div class="area-results__station">
              <div>
                <a :href="reportHref(station.wigosId)" target="_blank" rel="noopener noreferrer"
                   @click.stop
                   @focus="highlightAreaStation(station)" @blur="highlightAreaStation()">{{ station.name }}</a>
                <small v-if="station.wigosId !== station.name">{{ station.wigosId }}</small>
              </div>
              <button type="button" class="area-results__locate" :title="t('map.locateAreaStation')"
                      :aria-label="t('map.locateAreaStation') + ' ' + station.name"
                      :aria-pressed="activeAreaStation?.wigosId === station.wigosId" @click.stop="locateAreaStation(station)">
                <i class="el-icon-map-location" aria-hidden="true"><MapLocation /></i>
              </button>
            </div>
            <dl>
              <div><dt>{{ t('search.th.type') }}</dt><dd>{{ row.type || '—' }}</dd></div>
              <div><dt>{{ t('search.th.territory') }}</dt><dd>{{ row.country || '—' }}</dd></div>
              <div><dt>{{ t('search.th.position') }}</dt><dd>{{ station.lat.toFixed(3) }}, {{ station.lon.toFixed(3) }}</dd></div>
              <div><dt>{{ t('search.th.status') }}</dt><dd>{{ status || '—' }}</dd></div>
              <div><dt>{{ t('search.th.program') }}</dt><dd>{{ row.programs.join(', ') || '—' }}</dd></div>
            </dl>
          </li>
        </ul>
        <div v-if="areaPageCount > 1" class="area-results__pagination">
          <button type="button" :disabled="areaPage === 1" :aria-label="t('common.previousPage')" @click="setAreaPage(areaPage - 1)">‹</button>
          <span>{{ areaPage }} / {{ areaPageCount }}</span>
          <button type="button" :disabled="areaPage === areaPageCount" :aria-label="t('common.nextPage')" @click="setAreaPage(areaPage + 1)">›</button>
        </div>
      </section>

      <div
        v-if="hover"
        class="identify-popup"
        :style="{ left: popupPos.x + 'px', top: popupPos.y + 'px' }"
        @mouseenter="onPopupEnter"
        @mouseleave="onPopupLeave"
      >
        <a
          v-if="!hover.count && hover.wigosId"
          class="identify-popup__title identify-popup__title-link"
          :href="reportHref(hover.wigosId)"
          target="_blank"
          rel="noopener noreferrer"
        >{{ hover.title }}</a>
        <div v-else class="identify-popup__title">{{ hover.title }}</div>
        <div v-if="hover.count" class="identify-popup__body">{{ t('map.overviewZoomHint') }}</div>
        <div v-else class="identify-popup__body">
          <div><b>{{ $t('map.wigosId') }}:</b><br />{{ hover.wigosId }}</div>
          <div><b>{{ $t('map.stationType') }}:</b><br />{{ hover.type }}</div>
          <div><b>{{ $t('map.declaredStatus') }}:</b><br />{{ hover.status }}</div>
          <div v-if="hover.programs"><b>{{ $t('map.programStatuses') }}:</b><br />{{ hover.programs }}</div>
          <div><b>{{ $t('map.dateEstablished') }}:</b><br />{{ hover.established }}</div>
          <div v-if="hover.closed"><b>{{ $t('map.dateClosed') }}:</b><br />{{ hover.closed }}</div>
        </div>
        <div v-if="!hover.count" class="identify-popup__actions">
          <span class="dl-wrap">
            <button type="button" class="btn btn-default btn-xs" :disabled="downloading" @click="dlOpen = !dlOpen">
              <svg class="legacy-replacement-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg> {{ downloading ? $t('common.generating') : $t('common.download') }} ▾
            </button>
            <span v-show="dlOpen" class="dl-menu">
              <button type="button" @click="downloadXml">{{ $t('stationReport.xml') }}</button>
              <button type="button" @click="downloadWmdrV2">{{ $t('stationReport.wmdrV2') }}</button>
            </span>
          </span>
          <a
            class="btn btn-default btn-xs"
            :href="reportHref(hover.wigosId)"
            target="_blank"
            rel="noopener noreferrer"
          >{{ $t('map.stationReport') }}</a>
        </div>
      </div>

      <div class="oscar-legend">
        <div v-for="item in legend" :key="item.labelKey" class="oscar-legend__item">
          <span class="oscar-legend__dot" :style="{ background: item.color }"></span>
          {{ $t(item.labelKey) }}
        </div>
        <div class="oscar-legend__statuses">
          <div v-for="item in statusSymbols" :key="item.status" class="oscar-legend__item">
            <svg viewBox="0 0 16 16" aria-hidden="true" class="oscar-legend__symbol">
              <path :d="item.path" fill="#808080" fill-rule="evenodd" />
            </svg>
            {{ t('search.advanced.' + item.id) }}
          </div>
        </div>
      </div>

      <div class="oscar-map-tools">
        <button type="button" :title="$t('map.zoomIn')" @click="zoomBy(1)">+</button>
        <button type="button" :title="$t('map.zoomOut')" @click="zoomBy(-1)">–</button>
        <button type="button" :title="$t('map.resetView')" class="oscar-map-tools__icon" @click="resetView">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4.5A7.5 7.5 0 1 1 4.5 12H6a6 6 0 1 0 2.1-4.5L10 10H4V4l2.2 2.2A7.47 7.47 0 0 1 12 4.5z"/></svg>
        </button>
        <button v-if="props.areaSelection" type="button" class="oscar-map-tools__icon"
                :aria-pressed="drawingArea" :aria-label="t('map.selectArea')" :title="t('map.selectArea')"
                @click="setDrawingArea(!drawingArea)">
          <Crop aria-hidden="true" />
        </button>
      </div>

      <div v-if="!selectedArea" class="oscar-map-tools oscar-map-tools--cluster">
        <button
          type="button"
          :aria-pressed="clusterEnabled"
          :aria-label="t('map.clusterToggle')"
          :title="t('map.clusterToggle')"
          @click="toggleClustering"
        >
          <i :class="clusterEnabled ? 'el-icon-help' : 'el-icon-location-outline'" aria-hidden="true">
            <Help v-if="clusterEnabled" />
            <Location v-else />
          </i>
        </button>
      </div>

      <div class="oscar-map-layers">
        <select :value="basemap" :aria-label="$t('map.basemap')" @change="selectBasemap">
          <option value="osm">{{ $t('map.basemapOsm') }}</option>
          <option value="amap">{{ $t('map.basemapAmap') }}</option>
          <option value="tianditu">{{ $t('map.basemapTianditu') }}</option>
        </select>
        <span v-if="basemapStatus" role="status">{{ $t(basemapStatus) }}</span>
      </div>

      <div v-if="!selectedArea && (loading || mapError || (!tilesActive && !matchedCount))" class="map-data-status" role="status" aria-live="polite">
        <span v-if="loading">{{ $t('common.loading') }}<span v-if="mapLoadTotal"> {{ mapLoaded.toLocaleString() }} / {{ mapLoadTotal.toLocaleString() }}</span></span>
        <span v-if="!tilesActive && !loading && !mapError && !matchedCount">{{ locale === 'zh' ? '无匹配站点' : 'No matching stations' }}</span>
        <span v-if="mapError" role="alert"> · {{ locale === 'zh' ? '加载失败，结果不完整：' : 'Loading failed; results incomplete: ' }}{{ mapError }} <button @click="loadViewport">{{ $t('common.retry') }}</button></span>
      </div>
    </div>

    <p v-if="overviewActive" class="overview-note" role="status">{{ t('map.overviewSnapshot', { date: overview.generatedAt.slice(0, 10) }) }}<span v-if="overview.unmapped"> · {{ t('map.overviewUnmapped', { count: overview.unmapped }) }}</span></p>
    <p v-else-if="filteredSnapshotDate" class="overview-note" role="status">{{ t('map.filteredSnapshot', { date: filteredSnapshotDate, count: matchedCount.toLocaleString() }) }}<span v-if="filteredUnmapped"> · {{ t('map.overviewUnmapped', { count: filteredUnmapped }) }}</span></p>
    <div v-if="selected" class="oscar-infobox">
      <strong><a :href="reportHref(selected.wigosId)" target="_blank" rel="noopener noreferrer">{{ selected.name }}</a></strong>
      <div>{{ selected.wigosId }} · {{ selected.type }}</div>
      <a :href="reportHref(selected.wigosId)" target="_blank" rel="noopener noreferrer">{{ $t('map.openStationReport') }}</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Crop, Help, Location, MapLocation } from '@element-plus/icons-vue'
import { filterCountry, filterType, filterPrograms, filterStatuses, focusedStation } from '../stores/quickFilter'
import Map from 'ol/Map'
import Overlay from 'ol/Overlay'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import type LayerGroup from 'ol/layer/Group'
import type { Locale } from '../i18n'
import { amapConfigured, loadAmap, toGcj02 } from '../utils/amap'
import { tiandituKey, tiandituSource } from '../utils/tianditu'
import { createLocalizedLayer, type WorldStyleKey } from '../utils/localizedBasemap'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import VectorTileLayer from 'ol/layer/VectorTile'
import VectorTileSource from 'ol/source/VectorTile'
import DragBox from 'ol/interaction/DragBox'
import MVT from 'ol/format/MVT'
import Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import GeoJSON from 'ol/format/GeoJSON'
import Point from 'ol/geom/Point'
import Polygon, { fromExtent } from 'ol/geom/Polygon'
import LineString from 'ol/geom/LineString'
import { fromLonLat, getPointResolution, toLonLat, transformExtent } from 'ol/proj'
import { Circle as CircleStyle, Fill, Icon, Stroke, Style } from 'ol/style'
import Control from 'ol/control/Control'
import { defaults as defaultControls } from 'ol/control/defaults'
import type { Station, StationDomain, StationStatus } from '../data/stations'
import { domainColors } from '../data/stations'
import { downloadCatalogueRecord } from '../utils/catalogueDownload'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { WORLD_ISLANDS, WORLD_LAND } from '../data/worldLand'
import {
  WIGOS_TILES_URL,
  WIGOS_COLLECTION_URL,
  useMapTiles,
  type FacilitySearchParams,
  type WigosBbox,
  getFeature,
  featureClosed,
  featureEstablished,
  featureProgramIds,
  featureStatus,
  areaReportingStatuses,
  featureToStation,
  type WigosFeature,
  featureToRow,
} from '../api/wigos'
import { facilityTypeDomain, facilityTypeTitle, programTitle, findTerritoryId, programIdByTitle } from '../data/wmdrCodes'
import 'ol/ol.css'
import overview from '../data/stationOverview.json'
import { loadFilteredMap } from '../api/mapFacilities'
import { runtimeConfig } from '../utils/runtimeConfig'

interface HoverInfo {
  count?: number
  title: string
  wigosId: string
  type: string
  status: string
  programs: string
  established: string
  closed?: string
  stationId?: string
}

const props = defineProps<{
  visibleStations?: Station[]
  mapQuery?: FacilitySearchParams
  focusExactMatch?: boolean
  areaSelection?: boolean
}>()
const emit = defineEmits<{
  viewportCount: [query: FacilitySearchParams, count: number | undefined, failed: boolean]
}>()

const legend: { labelKey: string; domain: StationDomain; color: string }[] = [
  { labelKey: 'map.legend.air', domain: 'air', color: domainColors.air },
  { labelKey: 'map.legend.landOcean', domain: 'land-ocean', color: domainColors['land-ocean'] },
  { labelKey: 'map.legend.subsurface', domain: 'subsurface', color: domainColors.subsurface },
  { labelKey: 'map.legend.lake', domain: 'lake', color: domainColors.lake },
]
const statusSymbols = [
  { status: 'Operational', id: 'operational', path: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11Z' },
  { status: 'Partly operational', id: 'partlyOperational', path: 'M8 2 14 13H2Z' },
  { status: 'Closed', id: 'closed', path: 'M4 2 8 6 12 2 14 4 10 8 14 12 12 14 8 10 4 14 2 12 6 8 2 4Z' },
  { status: 'Silent', id: 'nonReporting', path: 'M8 2a6 6 0 1 0 0 12 6 6 0 1 0 0-12ZM8 4a4 4 0 1 1 0 8 4 4 0 1 1 0-8Z' },
  { status: 'Unknown', id: 'unknown', path: 'M8 2a6 6 0 1 0 0 12 6 6 0 1 0 0-12ZM8 4a4 4 0 0 1 3.5 6L6 4.5A4 4 0 0 1 8 4ZM4.5 6l5.5 5.5A4 4 0 0 1 4.5 6Z' },
] as const satisfies readonly { status: StationStatus; id: string; path: string }[]

function statusSymbolUrl(symbol: { path: string }, color: string) {
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="${symbol.path}" fill="${color}" fill-rule="evenodd" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/></svg>`,
  )
}

const mapEl = ref<HTMLDivElement | null>(null)
const basemapEl = ref<HTMLDivElement | null>(null)
const basemapRef = shallowRef<Map | null>(null)
const wrapEl = ref<HTMLDivElement | null>(null)
const mapRef = shallowRef<Map | null>(null)
const vectorRef = shallowRef<VectorLayer<VectorSource> | null>(null)
const resizeObserver = ref<ResizeObserver | null>(null)
const identifying = ref(false)
const selected = ref<Station | null>(null)
const hover = ref<HoverInfo | null>(null)
const popupPos = ref({ x: 0, y: 0 })
const popupPinned = ref(false)
const isOverPopup = ref(false)
const downloading = ref(false)
const downloadError = ref('')
const { t, locale } = useI18n()
const router = useRouter()

/** Station reports open in a new tab; hash routing resolves relative to the deployed base. */
function reportHref(wigosId: string): string {
  return router.resolve({
    name: 'stationReportDetails',
    params: { wigosId },
    query: basemap.value === 'osm' ? {} : { basemap: basemap.value },
  }).href
}
const dlOpen = ref(false)
import { selectedBasemap, rememberBasemap, type Basemap } from '../utils/basemap'
const DEFAULT_CENTER = [0, 0]
const WORLD_EXTENT = transformExtent([-180, -85, 180, 85], 'EPSG:4326', 'EPSG:3857')
const DEFAULT_ZOOM = 2.2
// At the equator, 160 CSS pixels represent 5,000 km at this resolution.
const DEFAULT_WORLD_RESOLUTION = 5_000_000 / 160
const CHINA_CENTER: [number, number] = [104, 35]
const CHINA_ZOOM = 4
// Start from 'osm' as the applied baseline; onMounted applies selectedBasemap
// (the OpenFreeMap world basemap) through selectBasemap so it is loaded.
const basemap = ref<Basemap>('osm')
const basemapStatus = ref('')
const amapEl = ref<HTMLDivElement | null>(null)
/** Locale-aware vector world basemaps, one per menu entry, created on demand. */
const worldLayers: Partial<Record<WorldStyleKey, LayerGroup>> = {}
const worldVersions: Partial<Record<WorldStyleKey, number>> = {}
const tiandituLayers = (['vec', 'cva'] as const).map((layer) => new TileLayer({
  source: tiandituSource(layer), visible: false,
}))
let amap: InstanceType<Awaited<ReturnType<typeof loadAmap>>['Map']> | undefined
let selectionVersion = 0
let cancelAmapLoad: (() => void) | undefined
let lastAmapView = ''

function mapCoordinate(lon: number, lat: number) {
  return fromLonLat(basemap.value === 'amap' ? toGcj02(lon, lat) : [lon, lat])
}

function syncAmap() {
  const view = mapRef.value?.getView()
  const center = view?.getCenter()
  const zoom = view?.getZoom()
  if (!amap || basemap.value !== 'amap' || !center || zoom === undefined) return
  const signature = [zoom, ...center].join(',')
  if (lastAmapView === signature) return
  lastAmapView = signature
  amap.setZoomAndCenter(zoom, toLonLat(center), true)
}
const tilesActive = ref(false)
const overviewActive = ref(false)
const drawingArea = ref(false)
const selectedArea = shallowRef<WigosBbox>()
const clusterPreference = ref(false)
const clusterEnabled = computed(() => clusterPreference.value && !selectedArea.value)
const clusterSource = new VectorSource({ wrapX: false })
const clusterLayer = new VectorLayer({
  source: clusterSource,
  visible: false,
  style: feature => {
    const station = feature.get('count') === 1 ? feature.get('features')?.[0] : undefined
    return station?.getStyle() ?? tileStyles[feature.get('domain') as StationDomain]
  },
})
let tileClusterRevision = 0
let clusterKey = ''
let overviewUnavailable = overview.source !== WIGOS_COLLECTION_URL
let gofcOverviewFailed = false
const pendingTiles = new Set<unknown>()
const realtimeTileSource = new VectorTileSource({
  format: new MVT({ layers: ['hits'] }),
  url: WIGOS_TILES_URL,
  wrapX: false,
})
const overviewTileSource = new VectorTileSource({
  format: new MVT({ layers: ['hits'] }),
  url: `${import.meta.env.BASE_URL}${overview.path}`,
  tileSize: overview.tileSize,
  maxZoom: overview.maxZoom,
  wrapX: false,
})
let tileSource = overviewTileSource
const tileStyles = Object.fromEntries(Object.entries(domainColors).map(([domain, color]) => [domain, dotStyle(color, 2.5)])) as Record<StationDomain, Style>
const stationStatusStyles = new globalThis.Map<StationDomain, globalThis.Map<StationStatus, Style>>(
  legend.map(({ domain, color }) => [domain, new globalThis.Map(statusSymbols.map(symbol => [
    symbol.status,
    new Style({ image: new Icon({ src: statusSymbolUrl(symbol, color), width: 11, height: 11 }) }),
  ]))]),
)
const stationTiles = new VectorTileLayer({
  source: tileSource,
  visible: false,
  declutter: false,
  style: feature => {
    if (clusterEnabled.value || feature.get('layer') !== 'hits') return undefined
    return tileStyles[facilityTypeDomain(feature.get('properties.facilityType.id') ?? '')]
  },
})
function canUseOverviewTiles() {
  return tilesActive.value && !overviewUnavailable &&
    (mapRef.value?.getView().getZoom() ?? DEFAULT_ZOOM) < overview.maxZoom + 1
}

function selectStationSource() {
  const local = canUseOverviewTiles() && (!runtimeConfig.gofcTilesFirst || gofcOverviewFailed)
  overviewActive.value = local
  const next = local ? overviewTileSource : realtimeTileSource
  if (tileSource === next) return
  pendingTiles.clear()
  tileClusterRevision++
  tileSource = next
  stationTiles.setSource(next)
  hoverRequestVersion++
  hover.value = null
  hoverKey = ''
  popupPinned.value = false
  isOverPopup.value = false
  mapError.value = ''
  loading.value = false
}
function tileFinished(tile: unknown) {
  pendingTiles.delete(tile)
  tileClusterRevision++
  if (tilesActive.value) loading.value = pendingTiles.size > 0
}

function createStationCluster(geometry: Point, features: Feature[]) {
  const domainCounts = new globalThis.Map<StationDomain, number>()
  let count = 0
  for (const feature of features) {
    const domain: StationDomain = feature.get('domain') ?? facilityTypeDomain(feature.get('properties.facilityType.id') ?? '')
    const stationCount = Number(feature.get('count')) || 1
    count += stationCount
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + stationCount)
  }
  let domain: StationDomain = 'land-ocean'
  let largestCount = 0
  for (const [candidate, domainCount] of domainCounts) {
    if (domainCount <= largestCount) continue
    domain = candidate
    largestCount = domainCount
  }
  return new Feature({ geometry, features, count, domain })
}

function clusterGroupSize(resolution: number) {
  const zoomSteps = DEFAULT_WORLD_RESOLUTION / resolution
  if (zoomSteps < 2 - 1e-9) return 20
  if (zoomSteps < 4 - 1e-9) return 10
  if (zoomSteps < 8 - 1e-9) return 5
  return 1
}

function spatialOrder(x: number, y: number) {
  // Interleave coordinate bits to keep nearby stations close in the sort order.
  const [minX, minY, maxX, maxY] = WORLD_EXTENT
  const column = Math.floor(65535 * (x - minX) / (maxX - minX))
  const row = Math.floor(65535 * (y - minY) / (maxY - minY))
  let order = 0
  for (let bit = 0; bit < 16; bit++) {
    order |= ((column >>> bit) & 1) << (2 * bit)
    order |= ((row >>> bit) & 1) << (2 * bit + 1)
  }
  return order >>> 0
}

function groupStationPoints(points: Feature[], groupSize: number) {
  const ordered = points.flatMap(feature => {
    const geometry = feature.getGeometry()
    if (!(geometry instanceof Point)) return []
    const [x, y] = geometry.getCoordinates() as [number, number]
    return [{ feature, x, y, order: groupSize > 1 ? spatialOrder(x, y) : 0 }]
  })
  if (groupSize > 1) ordered.sort((a, b) => a.order - b.order)
  const groups: Feature[] = []
  for (let start = 0; start < ordered.length; start += groupSize) {
    const group = ordered.slice(start, start + groupSize)
    let x = 0
    let y = 0
    for (const point of group) {
      x += point.x
      y += point.y
    }
    groups.push(createStationCluster(new Point([x / group.length, y / group.length]), group.map(point => point.feature)))
  }
  return groups
}

function tilePointsInExtent(extent: number[]) {
  const points: Feature[] = []
  const seen = new Set<unknown>()
  for (const feature of stationTiles.getFeaturesInExtent(extent)) {
    if (feature.get('layer') !== 'hits') continue
    const geometry = feature.getGeometry()
    if (geometry?.getType() !== 'Point') continue
    const id = feature.get('id') ?? feature.get('_id') ?? feature.getId()
    if (id != null && seen.has(id)) continue
    if (id != null) seen.add(id)
    points.push(new Feature({ ...feature.getProperties(), geometry: new Point(geometry.getFlatCoordinates()) }))
  }
  return points
}

function updateStationClusters(map: Map) {
  const size = map.getSize()
  const view = map.getView()
  const resolution = view.getResolution()
  if (!clusterEnabled.value || !size || !resolution || view.getAnimating() || view.getInteracting()) return
  const groupSize = clusterGroupSize(resolution)
  const extent = view.calculateExtent(size)
  const source = vectorRef.value?.getSource()
  const key = tilesActive.value
    ? ['tiles', tileClusterRevision, groupSize, ...extent].join(',')
    : ['stations', source?.getRevision(), groupSize].join(',')
  if (key === clusterKey) return
  clusterKey = key
  const points = tilesActive.value ? tilePointsInExtent(extent) : source?.getFeatures() ?? []
  const groups = groupStationPoints(points, groupSize)
  clusterSource.clear(true)
  clusterSource.addFeatures(groups)
}

function syncClusterLayers() {
  clusterKey = ''
  clusterSource.clear(true)
  clusterLayer.setVisible(clusterEnabled.value)
  vectorRef.value?.setVisible(!clusterEnabled.value)
}

function toggleClustering() {
  clusterPreference.value = !clusterPreference.value
  hoverRequestVersion++
  hover.value = null
  hoverKey = ''
  selected.value = null
  popupPinned.value = false
  isOverPopup.value = false
  dlOpen.value = false
  syncClusterLayers()
  stationTiles.changed()
}
for (const source of [overviewTileSource, realtimeTileSource]) {
  source.on('tileloadstart', event => {
    if (source !== tileSource) return
    pendingTiles.add(event.tile)
    if (tilesActive.value) loading.value = true
  })
  source.on('tileloadend', event => { if (source === tileSource) tileFinished(event.tile) })
  source.on('tileloaderror', event => {
    if (source !== tileSource) return
    tileFinished(event.tile)
    if (source === overviewTileSource) {
      overviewUnavailable = true
      selectStationSource()
    } else if (runtimeConfig.gofcTilesFirst && canUseOverviewTiles()) {
      gofcOverviewFailed = true
      selectStationSource()
    } else if (tilesActive.value) mapError.value = locale.value === 'zh' ? '站点瓦片加载失败，请重试' : 'Station tiles failed to load. Please retry.'
  })
}
const loading = ref(false)
const mapError = ref('')
const matchedCount = ref(0)
const mapLoaded = ref(0)
const mapLoadTotal = ref(0)
const filteredSnapshotDate = ref('')
const filteredUnmapped = ref(0)
let viewportController: AbortController | undefined
let pendingTimer = 0
let hideTimer = 0
let hoverKey = ''
let hoverRequestVersion = 0
let viewportTimer = 0
let loadSeq = 0

const liveFeatures = shallowRef<WigosFeature[]>([])
const areaPageSize = 100
const areaPage = ref(1)
const areaList = ref<HTMLUListElement>()
const areaAscending = ref(true)
const areaSortLabel = computed(() => t('search.th.stationName') + (areaAscending.value ? ' ↑' : ' ↓'))
const activeAreaStation = shallowRef<Station>()
const hoveredAreaStation = shallowRef<Station>()
const areaPinEl = ref<HTMLDivElement>()
const areaHoverPinEl = ref<HTMLDivElement>()
const areaPinPath = 'M127.99414,15.9971a88.1046,88.1046,0,0,0-88,88c0,75.29688,80,132.17188,83.40625,134.55469a8.023,8.023,0,0,0,9.1875,0c3.40625-2.38281,83.40625-59.25781,83.40625-134.55469A88.10459,88.10459,0,0,0,127.99414,15.9971ZM128,72a32,32,0,1,1-32,32A31.99909,31.99909,0,0,1,128,72Z'
const areaPinOptions = {
  className: 'oscar-area-pin-overlay',
  positioning: 'bottom-center' as const,
  stopEvent: false,
}
const areaPin = new Overlay(areaPinOptions)
const areaHoverPin = new Overlay(areaPinOptions)
watch([activeAreaStation, hoveredAreaStation, basemap], ([active, hovered]) => {
  areaPin.setPosition(active ? mapCoordinate(active.lon, active.lat) : undefined)
  areaHoverPin.setPosition(hovered ? mapCoordinate(hovered.lon, hovered.lat) : undefined)
})
const areaStations = computed(() => selectedArea.value ? liveFeatures.value.flatMap(feature => {
  const station = featureToStation(feature)
  if (!station) return []
  const row = featureToRow(feature, true)
  const status = areaReportingStatuses(feature).join(', ')
  return [{ station, row, status }]
}).sort((a, b) => (areaAscending.value ? 1 : -1) *
  (a.station.name.localeCompare(b.station.name, locale.value) || a.station.wigosId.localeCompare(b.station.wigosId))) : [])
const areaTitle = computed(() => t('map.areaStations', { count: areaStations.value.length.toLocaleString(locale.value) }))
const areaPageCount = computed(() => Math.max(1, Math.ceil(areaStations.value.length / areaPageSize)))
const areaPageStations = computed(() => areaStations.value.slice((areaPage.value - 1) * areaPageSize, areaPage.value * areaPageSize))
const areaOutline = new Feature<Polygon>()
const areaOutlineLayer = new VectorLayer({
  source: new VectorSource({ features: [areaOutline], wrapX: false }),
  style: new Style({ stroke: new Stroke({ color: '#005a9f', width: 2 }), fill: new Fill({ color: 'rgba(0, 90, 159, 0.07)' }) }),
})
const areaBox = new DragBox({ className: 'oscar-area-drag-box' })
areaBox.setActive(false)

function highlightAreaStation(station?: Station) {
  hoveredAreaStation.value = station?.wigosId !== activeAreaStation.value?.wigosId ? station : undefined
}

function locateAreaStation(station: Station) {
  const view = mapRef.value?.getView()
  if (!view) return
  activeAreaStation.value = station
  highlightAreaStation()
  view.cancelAnimations()
  view.animate({
    center: mapCoordinate(station.lon, station.lat),
    zoom: Math.max(view.getZoom() ?? 0, 8),
    duration: 350,
  })
}

function setAreaPage(page: number) {
  areaPage.value = page
  if (areaList.value) areaList.value.scrollTop = 0
  highlightAreaStation()
}

async function revealAreaStation(id: string) {
  const index = areaStations.value.findIndex(({ station }) => station.wigosId === id)
  const station = areaStations.value[index]?.station
  if (!station) return
  activeAreaStation.value = station
  setAreaPage(Math.floor(index / areaPageSize) + 1)
  await nextTick()
  const list = areaList.value
  const row = list?.querySelector<HTMLElement>('[data-station="' + CSS.escape(id) + '"]')
  if (list && row) {
    list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top
  }
}

function drawAreaOutline() {
  const area = selectedArea.value
  areaOutline.setGeometry(area ? fromExtent([...mapCoordinate(area[0], area[1]), ...mapCoordinate(area[2], area[3])]) : undefined)
}

function setDrawingArea(active: boolean) {
  drawingArea.value = active
  areaBox.setActive(active)
  hoverRequestVersion++
  hover.value = null
  hoverKey = ''
  popupPinned.value = false
  isOverPopup.value = false
  const target = mapRef.value?.getTargetElement()
  if (target) target.style.cursor = active ? 'crosshair' : ''
}

function setSelectedArea(area?: WigosBbox) {
  setDrawingArea(false)
  selectedArea.value = area
  activeAreaStation.value = undefined
  setAreaPage(1)
  drawAreaOutline()
  syncClusterLayers()
  stationTiles.changed()
  window.clearTimeout(viewportTimer)
  void loadViewport()
}

areaBox.on('boxend', () => {
  const [west, south, east, north] = geographicExtent(areaBox.getGeometry().getExtent())
  const bbox: WigosBbox = [Math.max(-180, west), Math.max(-85, south), Math.min(180, east), Math.min(85, north)]
  if (bbox[0] < bbox[2] && bbox[1] < bbox[3]) setSelectedArea(bbox)
})

defineExpose({ selectedArea, drawingArea, setDrawingArea, setSelectedArea })
const detailCache: Record<string, WigosFeature> = {}

const LAND_FILL = '#f2f5ef'
const LAND_STROKE = '#8fa89c'
const GRID_STROKE = 'rgba(120, 150, 160, 0.35)'

function graticuleLines(step = 20): Feature[] {
  const features: Feature[] = []
  for (let lon = -180; lon <= 180; lon += step) {
    features.push(new Feature({ geometry: new LineString([fromLonLat([lon, -80]), fromLonLat([lon, 80])]) }))
  }
  for (let lat = -80; lat <= 80; lat += step) {
    features.push(new Feature({ geometry: new LineString([fromLonLat([-180, lat]), fromLonLat([180, lat])]) }))
  }
  return features
}

function landFeatures(): Feature<Geometry>[] {
  const feats: Feature<Geometry>[] = WORLD_LAND.map(
    (ring) => new Feature({ geometry: new Polygon([ring.map(([lon, lat]) => fromLonLat([lon, lat]))]) }),
  )
  for (const [lon, lat] of WORLD_ISLANDS) {
    const f = new Feature({ geometry: new Point(fromLonLat([lon, lat])), island: true })
    f.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 1.6,
          fill: new Fill({ color: LAND_FILL }),
          stroke: new Stroke({ color: LAND_STROKE, width: 0.7 }),
        }),
      }),
    )
    feats.push(f)
  }
  return feats
}

// Paint the bundled world outline while the remote basemap loads.
const landSource = new VectorSource({ features: landFeatures(), wrapX: false })
const gridLayer = new VectorLayer({
  source: new VectorSource({ features: graticuleLines(), wrapX: false }),
  style: new Style({ stroke: new Stroke({ color: GRID_STROKE, width: 1 }) }),
})

const landLayer = new VectorLayer({
  source: landSource,
  style: new Style({
    fill: new Fill({ color: LAND_FILL }),
    stroke: new Stroke({ color: LAND_STROKE, width: 1.2 }),
  }),
})

let worldLoaded = false
async function loadWorldLand() {
  if (worldLoaded) return
  worldLoaded = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/world-countries.geojson`)
    if (!res.ok) throw new Error(`world land ${res.status}`)
    const data = await res.json()
    const features = new GeoJSON().readFeatures(data, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    }) as Feature<Geometry>[]
    landSource.clear()
    landSource.addFeatures(features)
  } catch {
    landSource.clear()
    landSource.addFeatures(landFeatures())
  }
}

function dotStyle(color: string, radius = 2) {
  return new Style({
    image: new CircleStyle({
      radius,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#ffffff', width: 0.8 }),
    }),
  })
}

function buildCloud(): Feature[] {
  const selectedStatuses = props.mapQuery?.reportingStatuses
  const stations = props.visibleStations?.map(station => ({ station, status: station.status })) ?? liveFeatures.value.flatMap(f => {
    const station = featureToStation(f)
    if (!station) return []
    const statuses = selectedArea.value || !f.mapSummary ? areaReportingStatuses(f) : []
    const status = statusSymbols.find(symbol => selectedStatuses?.includes(symbol.id) && statuses.includes(symbol.status))?.status ?? statuses[0]
    return [{ station, status }]
  })
  return stations.map(({ station: s, status }) => {
    const feature = new Feature({ geometry: new Point(mapCoordinate(s.lon, s.lat)), station: s, domain: s.domain,
      wigosId: props.visibleStations ? undefined : s.wigosId })
    feature.setStyle((status && stationStatusStyles.get(s.domain)?.get(status)) || tileStyles[s.domain])
    return feature
  })
}

function stationToHover(s: Station): HoverInfo {
  return {
    title: s.name || s.wigosId,
    wigosId: s.wigosId,
    type: s.type,
    status: s.status,
    programs: s.programs,
    established: s.established,
    closed: s.status === 'Closed' ? s.established : undefined,
    stationId: s.id,
  }
}

function hoverFromFeature(feature: WigosFeature): HoverInfo {
  const s = featureToStation(feature)
  if (s) {
    return {
      title: feature.properties.title || s.name || feature.id,
      wigosId: s.wigosId,
      type: s.type,
      status: s.status,
      programs: s.programs,
      established: s.established,
      closed: s.status === 'Closed' ? s.established : undefined,
      stationId: s.id,
    }
  }
  return {
    title: feature.properties.title || feature.id,
    wigosId: feature.id,
    type: facilityTypeTitle(feature.properties.facilityType?.id) || 'unknown',
    status: featureStatus(feature),
    programs: featureProgramIds(feature).map((id) => programTitle(id)).join(', '),
    established: featureEstablished(feature),
    closed: featureClosed(feature) || undefined,
  }
}

function stationAtPixel(map: Map, pixel: number[]) {
  if (clusterEnabled.value) {
    return map.forEachFeatureAtPixel(pixel, feature => {
      const members = feature.get('features') as Feature[]
      return feature.get('count') > 1 ? feature : members[0]
    }, { hitTolerance: 6, layerFilter: layer => layer === clusterLayer })
  }
  if (tilesActive.value) {
    const coordinate = map.getCoordinateFromPixel(pixel)
    const resolution = map.getView().getResolution()
    if (!coordinate || !resolution) return undefined
    const [x, y] = coordinate as [number, number]
    const radius = 8 * resolution
    const candidates = stationTiles.getFeaturesInExtent([x - radius, y - radius, x + radius, y + radius])
    let nearest: (typeof candidates)[number] | undefined
    let bestDistance = radius ** 2
    for (const feature of candidates) {
      if (feature.get('layer') !== 'hits') continue
      const [pointX, pointY] = feature.getGeometry()?.getFlatCoordinates() ?? []
      if (pointX === undefined || pointY === undefined) continue
      const distance = (pointX - x) ** 2 + (pointY - y) ** 2
      if (distance > bestDistance || (nearest && distance === bestDistance)) continue
      nearest = feature
      bestDistance = distance
    }
    return nearest
  }
  return map.forEachFeatureAtPixel(pixel, (feature) => feature, {
    hitTolerance: 6,
    layerFilter: layer => layer === vectorRef.value,
  })
}

function onPointerMove(evt: { pixel: number[] }) {
  if (drawingArea.value || selectedArea.value) return
  const map = mapRef.value
  if (!map) return
  if (isOverPopup.value) return
  window.clearTimeout(pendingTimer)
  const [px, py] = evt.pixel
  const pointerVersion = ++hoverRequestVersion
  pendingTimer = window.setTimeout(() => {
    if (pointerVersion !== hoverRequestVersion || isOverPopup.value || mapRef.value !== map) return
    const hit = stationAtPixel(map, evt.pixel)
    const station = (hit?.get('station') as Station | undefined) ?? null
    const wigosId = (hit?.get('wigosId') ?? hit?.get('id') ?? hit?.get('_id')) as string | undefined
    const key = wigosId || (station ? station.wigosId : '')
    const count = Number(hit?.get('count') ?? 1)
    if (count > 1) {
      window.clearTimeout(hideTimer)
      hoverKey = ''
      popupPos.value = clampPopup(px + 14, py + 14)
      hover.value = { title: t('map.clusterCount', { count }), count, wigosId: '', type: '', status: '', programs: '', established: '' }
      const target = map.getTargetElement()
      if (target) target.style.cursor = 'pointer'
      return
    }
    if (station && !wigosId) {
      if (!hover.value || hoverKey !== key) {
        hoverKey = key
        popupPos.value = clampPopup(px + 14, py + 14)
      }
      window.clearTimeout(hideTimer)
      hover.value = stationToHover(station)
    } else if (wigosId) {
      if (!hover.value || hoverKey !== key) {
        hoverKey = key
        popupPos.value = clampPopup(px + 14, py + 14)
        const cached = detailCache[wigosId]
        const source = cached ?? liveFeatures.value.find((f) => f.id === wigosId)
        if (source && !source.mapSummary) hover.value = hoverFromFeature(source)
        else {
          // Tile features are not in liveFeatures. Show their summary immediately
          // so the asynchronous full-record response can update the same popup.
          hover.value = {
            title: source?.properties.title || hit?.get('properties.title') || wigosId,
            wigosId,
            type: facilityTypeTitle(source?.properties.facilityType?.id ?? hit?.get('properties.facilityType.id')) || '—',
            status: '—',
            programs: hit?.get('properties.observations.programAffiliations.programAffiliation.id') || '—',
            established: '—',
          }
        }
      }
      window.clearTimeout(hideTimer)
      if (!detailCache[wigosId]) {
        downloadError.value = ''
        void getFeature(wigosId)
          .then((feature) => {
            if (!feature || hover.value?.wigosId !== wigosId) return
            detailCache[wigosId] = feature
            hover.value = hoverFromFeature(feature)
          })
          .catch(() => {
            if (hover.value?.wigosId === wigosId) {
              downloadError.value = locale.value === 'zh' ? '站点详情加载失败，当前显示瓦片摘要；移开后重新悬停可重试。' : 'Station details failed to load. Tile summary shown; hover again to retry.'
            }
          })
      }
    } else {
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => {
        if (!isOverPopup.value && !popupPinned.value) {
          hover.value = null
          hoverKey = ''
        }
      }, 500)
    }
    const target = map.getTargetElement()
    if (target) target.style.cursor = hover.value ? 'pointer' : ''
  }, 60)
}

function clampPopup(x: number, y: number) {
  const wrap = wrapEl.value
  const W = 248
  const H = 360
  const maxX = Math.max(8, (wrap?.clientWidth ?? 800) - W - 8)
  const maxY = Math.max(8, (wrap?.clientHeight ?? 520) - H - 8)
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) }
}

function onPopupEnter() {
  isOverPopup.value = true
  popupPinned.value = true
  window.clearTimeout(hideTimer)
}

function onPopupLeave() {
  isOverPopup.value = false
  popupPinned.value = false
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    hover.value = null
    hoverKey = ''
  }, 250)
}

async function runDownload(format: 'xml' | 'json') {
  if (!hover.value || downloading.value) return
  const id = hover.value.wigosId
  downloading.value = true
  downloadError.value = ''
  dlOpen.value = false
  try {
    await downloadCatalogueRecord(id, format)
  } catch (cause) {
    downloadError.value = t('stationReport.downloadError', {
      message: cause instanceof Error ? cause.message : String(cause),
    })
  } finally {
    downloading.value = false
  }
}

const downloadXml = () => runDownload('xml')
const downloadWmdrV2 = () => runDownload('json')
function geographicExtent(ext: number[]): WigosBbox {
  let [minLon, minLat, maxLon, maxLat] = transformExtent(ext, 'EPSG:3857', 'EPSG:4326')
  if (basemap.value === 'amap') {
    const [gcjWest, gcjSouth] = toGcj02(minLon, minLat)
    const [gcjEast, gcjNorth] = toGcj02(maxLon, maxLat)
    minLon += minLon - gcjWest
    minLat += minLat - gcjSouth
    maxLon += maxLon - gcjEast
    maxLat += maxLat - gcjNorth
  }
  return [minLon, minLat, maxLon, maxLat]
}

function currentBbox(): WigosBbox | null {
  const map = mapRef.value
  const size = map?.getSize()
  if (!map || !size?.[0] || !size[1] || !mapEl.value?.clientWidth || !mapEl.value.clientHeight) return null
  const [minLon, minLat, maxLon, maxLat] = geographicExtent(map.getView().calculateExtent(size))
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  // A wrapped viewport must include both sides of the date line.
  // Query all longitudes when crossing it; never silently clip away one side.
  const width = maxLon - minLon
  const west = ((minLon + 180) % 360 + 360) % 360 - 180
  const crossesDateLine = width >= 360 || west + width > 180
  const lonMin = crossesDateLine ? -180 : west
  const lonMax = crossesDateLine ? 180 : west + width
  const latMin = clamp(minLat, -85, 85)
  const latMax = clamp(maxLat, -85, 85)
  if (lonMax <= lonMin || latMax <= latMin) return null
  return [lonMin, latMin, lonMax, latMax]
}

function selectedProgramIds(): string[] {
  return (filterPrograms.value ?? [])
    .map((id) => programIdByTitle(id) ?? id)
    .filter(Boolean)
}

let focusedExactQuery: FacilitySearchParams | undefined
let viewportNeedsSize = false

async function loadViewport() {
  if (props.visibleStations) return
  viewportController?.abort()
  const countryId = filterCountry.value ? findTerritoryId(filterCountry.value) : undefined
  const query: FacilitySearchParams = props.mapQuery ?? {
    territories: countryId ? [countryId] : [],
    types: filterType.value ? [filterType.value] : [],
    programs: selectedProgramIds(),
  }
  const wasTiles = tilesActive.value
  filteredSnapshotDate.value = ''
  filteredUnmapped.value = 0
  mapLoaded.value = 0
  mapLoadTotal.value = 0
  const area = selectedArea.value
  tilesActive.value = !area && useMapTiles(query)
  selectStationSource()
  stationTiles.setVisible(tilesActive.value)
  if (wasTiles !== tilesActive.value) syncClusterLayers()
  if (tilesActive.value) {
    viewportNeedsSize = false
    loadSeq++
    liveFeatures.value = []
    vectorRef.value?.getSource()?.clear()
    hover.value = null
    selected.value = null
    const retry = wasTiles && !!mapError.value
    mapError.value = ''
    loading.value = pendingTiles.size > 0
    if (retry) tileSource.refresh()
    return
  }
  const visibleBbox = area ?? currentBbox()
  viewportNeedsSize = !visibleBbox
  if (!visibleBbox) return
  // An exact station lookup can start outside the visible map.
  const shouldFocus = !area && props.focusExactMatch && query.q?.startsWith('0-') && focusedExactQuery !== query
  const bounds = query.bbox
  const bbox: WigosBbox | undefined = shouldFocus ? bounds : bounds ? [
    Math.max(visibleBbox[0], bounds[0]), Math.max(visibleBbox[1], bounds[1]),
    Math.min(visibleBbox[2], bounds[2]), Math.min(visibleBbox[3], bounds[3]),
  ] : visibleBbox
  emit('viewportCount', query, undefined, false)
  const controller = new AbortController()
  viewportController = controller
  const seq = ++loadSeq
  loading.value = true
  mapError.value = ''
  matchedCount.value = 0
  if (area) {
    activeAreaStation.value = undefined
    setAreaPage(1)
  }
  liveFeatures.value = []
  vectorRef.value?.getSource()?.clear()
  if (focusedExactQuery !== query) {
    hover.value = null
    selected.value = null
    popupPinned.value = false
  }
  const received = new globalThis.Map<string, WigosFeature>()
  let paintTimer = 0
  const paint = () => {
    window.clearTimeout(paintTimer)
    paintTimer = 0
    if (seq !== loadSeq || controller.signal.aborted) return
    liveFeatures.value = [...received.values()]
    matchedCount.value = received.size
    const source = vectorRef.value?.getSource()
    source?.clear()
    source?.addFeatures(buildCloud())
  }
  try {
    const emptyBounds = bbox && (bbox[0] >= bbox[2] || bbox[1] >= bbox[3])
    const result = emptyBounds ? { features: [], unmapped: 0, snapshotDate: undefined } : await loadFilteredMap({ ...query, bbox, signal: controller.signal }, (delta, loaded, total) => {
      if (seq !== loadSeq || controller.signal.aborted) return
      for (const feature of delta) received.set(feature.id, feature)
      mapLoaded.value = loaded
      mapLoadTotal.value = total
      if (!paintTimer) paintTimer = window.setTimeout(paint, 150)
    }, { areaRows: Boolean(area) })
    if (seq === loadSeq && !controller.signal.aborted) {
      received.clear()
      for (const feature of result.features) received.set(feature.id, feature)
      paint()
      filteredSnapshotDate.value = result.snapshotDate ?? ''
      filteredUnmapped.value = result.unmapped
      if (shouldFocus) {
        focusedExactQuery = query
        const feature = result.features[0]
        if (feature) flyToFocusedStation(featureToStation(feature))
      }
      emit('viewportCount', query, matchedCount.value, false)
    }
  } catch (cause) {
    if (seq === loadSeq && !controller.signal.aborted) {
      mapError.value = cause instanceof Error ? cause.message : String(cause)
      emit('viewportCount', query, undefined, true)
    }
  } finally {
    window.clearTimeout(paintTimer)
    if (seq === loadSeq) loading.value = false
  }
}

function createMetricScaleLine() {
  const element = document.createElement('div')
  element.className = 'ol-scale-line ol-unselectable'
  const line = document.createElement('div')
  line.className = 'ol-scale-line-inner'
  element.append(line)
  return new Control({
    element,
    render({ frameState }) {
      if (!frameState) {
        element.hidden = true
        return
      }
      const { projection, resolution, center } = frameState.viewState
      const metersPerPixel = getPointResolution(projection, resolution, center, 'm')
      const minimumDistance = 120 * metersPerPixel
      if (!(minimumDistance > 0) || !Number.isFinite(minimumDistance)) {
        element.hidden = true
        return
      }
      const magnitude = 10 ** Math.floor(Math.log10(minimumDistance))
      const step = [1, 2, 3, 5, 10].find(value => value * magnitude >= minimumDistance) ?? 10
      const meters = step * magnitude
      const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`
      if (line.textContent !== label) line.textContent = label
      line.style.width = `${Math.round(meters / metersPerPixel)}px`
      element.hidden = false
    },
  })
}

onMounted(() => {
  if (!mapEl.value || !basemapEl.value) return
  const vector = new VectorLayer({
    source: new VectorSource({ features: buildCloud(), wrapX: false }),
    declutter: false,
  })
  vectorRef.value = vector
  const map = new Map({
    target: mapEl.value,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    controls: defaultControls({ zoom: false, rotate: false }).extend([
      createMetricScaleLine(),
    ]),
    layers: [areaOutlineLayer, stationTiles, vector, clusterLayer],
    view: new View({
      center: fromLonLat(DEFAULT_CENTER),
      resolution: DEFAULT_WORLD_RESOLUTION,
      minZoom: -2,
      maxZoom: 18,
      enableRotation: !props.areaSelection,
      extent: WORLD_EXTENT,
      constrainOnlyCenter: true,
      constrainResolution: false,
      smoothResolutionConstraint: true,
      showFullExtent: false,
    }),
  })
  // Separate Maps own separate tile queues. Unreachable basemap services must
  // never occupy the loading slots needed by station tiles.
  basemapRef.value = new Map({
    target: basemapEl.value,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    controls: [],
    interactions: [],
    layers: [landLayer, gridLayer, ...tiandituLayers],
    view: map.getView(),
  })
  if (props.areaSelection) {
    map.addInteraction(areaBox)
    areaPin.setElement(areaPinEl.value)
    map.addOverlay(areaPin)
    areaHoverPin.setElement(areaHoverPinEl.value)
    map.addOverlay(areaHoverPin)
  }
  map.on('singleclick', (evt) => {
    if (drawingArea.value) return
    const hit = stationAtPixel(map, evt.pixel)
    if (selectedArea.value) {
      const station = hit?.get('station') as Station | undefined
      if (station) {
        hoverRequestVersion++
        hover.value = null
        hoverKey = ''
        popupPinned.value = false
        void revealAreaStation(station.wigosId)
      }
      return
    }
    if (Number(hit?.get('count') ?? 1) > 1) {
      const view = map.getView()
      const maxZoom = clusterEnabled.value ? view.getMaxZoom() : overview.maxZoom + 1
      const geometry = hit?.getGeometry()
      const center = geometry instanceof Point ? geometry.getCoordinates() : evt.coordinate
      popupPinned.value = false
      hover.value = null
      const zoomStep = clusterEnabled.value ? 1 : 2
      view.animate({ center, zoom: Math.min(maxZoom, (view.getZoom() ?? 2) + zoomStep), duration: 250 })
      return
    }
    if (tilesActive.value) {
      if (hit) onPointerMove(evt)
      return
    }
    identifying.value = true
    window.setTimeout(() => {
      identifying.value = false
    }, 250)
    selected.value = (hit?.get('station') as Station | undefined) ?? null
  })
  map.on('pointermove', onPointerMove)
  map.on('postrender', () => {
    syncAmap()
    clipWorldBasemap(map)
    updateStationClusters(map)
  })
  map.on('movestart', () => {
    if (selectedArea.value) return
    viewportController?.abort()
    loadSeq++
    if (!tilesActive.value) loading.value = false
  })
  map.on('moveend', () => {
    if (selectedArea.value) return
    if (!tilesActive.value) {
      const source = vectorRef.value?.getSource()
      source?.clear()
      source?.addFeatures(buildCloud())
    }
    window.clearTimeout(viewportTimer)
    viewportTimer = window.setTimeout(() => void loadViewport(), 400)
  })
  ;(map.getTargetElement() as HTMLElement | null)?.addEventListener('pointerleave', () => {
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => {
      if (!isOverPopup.value && !popupPinned.value) {
        hover.value = null
        hoverKey = ''
      }
    }, 500)
  })
  mapRef.value = map
  map.getView().on('change:resolution', () => { if (tilesActive.value) selectStationSource() })
  void loadWorldLand()
  if (!props.visibleStations) {
    void loadViewport()
  }
  resizeObserver.value = new ResizeObserver(() => {
    map.updateSize()
    basemapRef.value?.updateSize()
    if (viewportNeedsSize && currentBbox()) void loadViewport()
  })
  resizeObserver.value.observe(mapEl.value)
  void selectBasemap({ target: { value: selectedBasemap.value } } as unknown as Event)
})

watch(() => props.visibleStations, () => {
  const source = vectorRef.value?.getSource()
  if (!source || !props.visibleStations) return
  window.clearTimeout(pendingTimer)
  window.clearTimeout(hideTimer)
  source.clear()
  source.addFeatures(buildCloud())
  selected.value = null
  hover.value = null
  hoverKey = ''
  popupPinned.value = false
  isOverPopup.value = false
  dlOpen.value = false
})

watch(locale, () => {
  // Every world basemap that has been created so far must follow the UI language.
  for (const kind of Object.keys(worldLayers) as WorldStyleKey[]) void loadWorldLayer(kind)
})

watch(() => props.mapQuery, (query, previous) => {
  viewportController?.abort()
  loadSeq++
  filteredSnapshotDate.value = ''
  mapLoaded.value = 0
  mapLoadTotal.value = 0
  loading.value = true
  const bounds = query?.bbox
  const map = mapRef.value
  if (bounds && !selectedArea.value && bounds.some((value, index) => value !== previous?.bbox?.[index]) && mapEl.value?.clientWidth) {
    const south = Math.max(-85, bounds[1])
    const north = Math.min(85, bounds[3])
    if (south < north) {
      map?.getView().fit([...mapCoordinate(bounds[0], south), ...mapCoordinate(bounds[2], north)], {
        padding: [24, 24, 24, 24], maxZoom: 12,
      })
    }
  }
  window.clearTimeout(viewportTimer)
  viewportTimer = window.setTimeout(() => void loadViewport(), 350)
}, { deep: true })

watch([focusedStation, filterCountry, filterType, filterPrograms, filterStatuses], () => {
  if (props.visibleStations) return
  if (focusedStation.value) flyToFocusedStation()
  void loadViewport()
})

onBeforeUnmount(() => {
  viewportController?.abort()
  loadSeq++
  selectionVersion++
  cancelAmapLoad?.()
  amap?.destroy()
  amap = undefined
  resizeObserver.value?.disconnect()
  window.clearTimeout(pendingTimer)
  window.clearTimeout(hideTimer)
  window.clearTimeout(viewportTimer)
  hoverRequestVersion++
  mapRef.value?.dispose()
  mapRef.value = null
  basemapRef.value?.dispose()
  basemapRef.value = null
})

function zoomBy(delta: number) {
  const view = mapRef.value?.getView()
  if (!view) return
  const zoom = view.getZoom() ?? 2
  view.animate({ zoom: zoom + delta, duration: 180 })
}

function clipWorldBasemap(map: Map) {
  const element = basemapEl.value
  if (!element) return
  if (basemap.value !== 'osm') {
    element.style.clipPath = ''
    return
  }
  const width = map.getSize()?.[0]
  const west = map.getPixelFromCoordinate([WORLD_EXTENT[0]!, 0])?.[0]
  const east = map.getPixelFromCoordinate([WORLD_EXTENT[2]!, 0])?.[0]
  if (!width || west === undefined || east === undefined) return
  const left = Math.max(0, west)
  const right = Math.max(0, width - east)
  element.style.clipPath = left || right ? `inset(0 ${right}px 0 ${left}px)` : ''
}

function resetWorldView(duration = 0) {
  mapRef.value?.getView().animate({
    center: fromLonLat(DEFAULT_CENTER),
    resolution: DEFAULT_WORLD_RESOLUTION,
    duration,
  })
}

function resetView() {
  const world = basemap.value === 'osm'
  if (world) {
    resetWorldView(250)
    return
  }
  mapRef.value?.getView().animate({
    center: world ? fromLonLat(DEFAULT_CENTER) : mapCoordinate(CHINA_CENTER[0], CHINA_CENTER[1]),
    zoom: world ? DEFAULT_ZOOM : CHINA_ZOOM,
    duration: 250,
  })
}

/**
 * Load (or reload on language change) one of the locale-aware vector basemaps.
 * The vector style replaces the old raster OpenStreetMap layer: raster tiles
 * have the place names baked into the image, so they can never follow the UI
 * language.
 */
async function loadWorldLayer(kind: WorldStyleKey) {
  const version = (worldVersions[kind] ?? 0) + 1
  worldVersions[kind] = version
  let loaded: Awaited<ReturnType<typeof createLocalizedLayer>>
  try {
    loaded = await createLocalizedLayer(locale.value as Locale, kind)
  } catch {
    if (version === worldVersions[kind] && basemap.value === kind) {
      // Offline land polygons are the only thing we can still show.
      landLayer.setVisible(true)
      basemapStatus.value = 'map.basemapLoadError'
    }
    return
  }
  if (version !== worldVersions[kind] || !basemapRef.value) {
    loaded.group.dispose()
    return
  }
  const basemapMap = basemapRef.value
  const layers = basemapMap.getLayers()
  const previous = worldLayers[kind]
  if (previous) {
    const index = layers.getArray().indexOf(previous)
    if (index >= 0) layers.setAt(index, loaded.group)
    previous.dispose()
  } else {
    // Sit on top of the offline land fallback, below the graticule.
    layers.insertAt(1, loaded.group)
  }
  worldLayers[kind] = loaded.group
  const active = basemap.value === kind
  loaded.group.setVisible(active)
  if (active) {
    basemapStatus.value = ''
    landLayer.setVisible(false)
    if (loaded.background && basemapEl.value) basemapEl.value.style.backgroundColor = loaded.background
  }
}

async function selectBasemap(event: Event) {
  const select = event.target as HTMLSelectElement
  const next = select.value as Basemap
  const version = ++selectionVersion
  cancelAmapLoad?.()
  basemapStatus.value = ''
  // Re-selecting the current entry is a no-op, except on first mount: the ref
  // already starts as 'osm' while the vector style behind it has not loaded
  // yet, and an early return would leave only the offline land fallback on
  // screen (no place names) until the user switched away and back.
  const worldPending = next === 'osm' && !worldLayers.osm
  if (next === basemap.value && !worldPending) return

  if ((next === 'amap' && !amapConfigured) || (next === 'tianditu' && !tiandituKey)) {
    select.value = basemap.value
    basemapStatus.value = 'map.basemapMissingKey'
    return
  }

  if (next === 'amap') {
    basemapStatus.value = 'common.loading'
    try {
      const api = await loadAmap()
      if (version !== selectionVersion || !amapEl.value) return
      const instance = new api.Map(amapEl.value, {
        viewMode: '2D', center: toGcj02(CHINA_CENTER[0], CHINA_CENTER[1]), zoom: CHINA_ZOOM, zooms: [2, 18],
        // zoomEnable also controls setZoomAndCenter; pointer-events blocks SDK input.
        dragEnable: false, zoomEnable: true, keyboardEnable: false,
        animateEnable: false, resizeEnable: true,
        doubleClickZoom: false, scrollWheel: false, touchZoom: false,
      })
      await new Promise<void>((resolve, reject) => {
        const fail = () => {
          window.clearTimeout(timer)
          cancelAmapLoad = undefined
          instance.destroy()
          reject(new Error('AMap initialization interrupted'))
        }
        const timer = window.setTimeout(fail, 15000)
        cancelAmapLoad = fail
        instance.on('complete', () => {
          if (cancelAmapLoad !== fail) return
          window.clearTimeout(timer)
          cancelAmapLoad = undefined
          resolve()
        })
      })
      if (version !== selectionVersion) {
        instance.destroy()
        return
      }
      amap = instance
      lastAmapView = ''
    } catch {
      if (version === selectionVersion) {
        select.value = basemap.value
        basemapStatus.value = 'map.basemapLoadError'
      }
      return
    }
  } else {
    amap?.destroy()
    amap = undefined
  }

  const isWorld = next === 'osm'
  basemapStatus.value = ''
  basemap.value = next
  drawAreaOutline()
  highlightAreaStation()
  rememberBasemap(next)
  for (const [kind, layer] of Object.entries(worldLayers) as [WorldStyleKey, LayerGroup][]) {
    layer.setVisible(kind === next)
  }
  tiandituLayers.forEach((layer) => layer.setVisible(next === 'tianditu'))
  if (isWorld && !worldLayers.osm) void loadWorldLayer('osm')
  gridLayer.setVisible(next !== 'amap')
  // The vector basemap paints its own land and coastlines; the offline land
  // polygons remain visible while the world style loads or if loading fails.
  landLayer.setVisible(isWorld && !worldLayers.osm)
  if (!isWorld && basemapEl.value) basemapEl.value.style.backgroundColor = ''
  const source = vectorRef.value?.getSource()
  source?.clear()
  source?.addFeatures(buildCloud())
  hover.value = null
  hoverKey = ''
  popupPinned.value = false
  const view = mapRef.value?.getView()
  view?.cancelAnimations()
  view?.setMinZoom(next === 'amap' ? 2 : next === 'tianditu' ? 1 : -2)
  view?.setCenter(isWorld ? fromLonLat(DEFAULT_CENTER) : mapCoordinate(CHINA_CENTER[0], CHINA_CENTER[1]))
  if (isWorld) resetWorldView()
  else view?.setZoom(CHINA_ZOOM)
  syncAmap()
}

function flyToFocusedStation(focus = focusedStation.value) {
  const map = mapRef.value
  if (!map || !focus || props.visibleStations) return
  window.clearTimeout(hideTimer)
  window.clearTimeout(pendingTimer)
  hoverRequestVersion++
  selected.value = focus
  hover.value = stationToHover(focus)
  hoverKey = focus.wigosId
  popupPinned.value = true
  const view = map.getView()
  view.animate({ center: mapCoordinate(focus.lon, focus.lat), zoom: Math.max(view.getZoom() ?? 2.2, 6), duration: 600 }, (completed) => {
    if (!completed || selected.value?.wigosId !== focus.wigosId) return
    const px = map.getPixelFromCoordinate(mapCoordinate(focus.lon, focus.lat))
    if (px) popupPos.value = clampPopup(px[0] + 14, px[1] + 14)
  })
}
</script>
<style scoped lang="scss">
.map-data-status { position: absolute; bottom: 30px; left: 12px; right: 56px; z-index: 5; padding: 6px 10px; background: #fffffff0; border-radius: 5px; font-size: 12px; overflow-wrap: anywhere; }
.overview-note { margin: 4px 16px; font-size: 11px; color: #586e83; }
.oscar-map-shell {
  position: relative;
  padding: 0 0 14px;
}

.oscar-ol-wrap {
  position: relative;
  overflow: hidden;
  border: 1px solid #dce6ef;
  border-radius: 12px;
  background: #dcebf3;
  margin: 0 16px;
}

.oscar-ol-map {
  position: relative;
  width: 100%;
  height: 520px;
}

.oscar-ol-wrap--single-world {
  background: #fff;
}

.oscar-basemap {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.oscar-map-wait {
  position: absolute;
  top: 10px;
  left: 16px;
  z-index: 5;
  background: coral;
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.oscar-map-loading {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 5;
  background: rgba(0, 91, 171, 0.9);
  color: #fff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 11px;
  pointer-events: none;
}

.identify-popup {
  position: absolute;
  z-index: 6;
  width: 240px;
  max-height: 340px;
  overflow: auto;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #a9bfd4;
  border-radius: 4px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  font-size: 12px;
  color: #222;
  pointer-events: auto;
}

.identify-popup__title {
  display: block;
  overflow-wrap: anywhere;
  padding: 6px 8px;
  border-bottom: 1px solid #d5e3ef;
  font-weight: 600;
  background: #fff;
  color: #222;
}

.identify-popup__title-link {
  color: #005288;
  text-decoration: none;
}

.identify-popup__title-link:hover,
.identify-popup__title-link:focus-visible {
  text-decoration: underline;
}

.identify-popup__body {
  padding: 6px 8px;
  line-height: 1.45;
  white-space: pre-line;
}

.identify-popup__body b {
  color: #000;
}

.identify-popup__actions {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid #d5e3ef;
  background: #f6f9fc;
}

.identify-popup__actions .btn-xs {
  font-size: 11px;
  padding: 3px 8px;
  text-decoration: none;
}

.identify-popup__actions .dl-wrap {
  position: relative;
  display: inline-block;
}

.identify-popup__actions .dl-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 4px);
  z-index: 10;
  min-width: 180px;
  background: #fff;
  border: 1px solid #a9bfd4;
  border-radius: 4px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  padding: 4px;
  display: flex;
  flex-direction: column;
}

.identify-popup__actions .dl-menu button {
  border: 0;
  background: transparent;
  text-align: left;
  font-size: 11px;
  color: #222;
  padding: 6px 8px;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
}

.identify-popup__actions .dl-menu button:hover {
  background: var(--oscar-theme-soft);
  color: var(--oscar-theme);
}

.oscar-legend {
  position: absolute;
  top: 14px;
  right: 58px;
  left: auto;
  z-index: 4;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #dce6ef;
  color: #35536e;
  font-size: 14px;
  min-width: 128px;
  box-shadow: 0 2px 10px rgba(0, 91, 171, 0.08);
}

.oscar-legend__title {
  font-weight: 700;
  margin-bottom: 6px;
}

.oscar-legend__item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.oscar-legend__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.oscar-legend__statuses {
  margin-top: 7px;
  padding-top: 3px;
  border-top: 1px solid #dce6ef;
}
.oscar-legend__symbol {
  width: 14px;
  height: 14px;
}

.oscar-map-tools {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.oscar-map-tools button {
  width: 34px;
  height: 34px;
  border: 1px solid #dce6ef;
  border-radius: 8px;
  background: #fff;
  color: var(--oscar-theme);
  font-size: 18px;
  line-height: 1;
  padding: 0;
}

.oscar-map-tools button:hover,
.oscar-map-tools button:focus-visible {
  background: var(--oscar-theme-soft);
  border-color: var(--oscar-theme);
}

.oscar-map-tools__icon svg {
  width: 16px;
  height: 16px;
}

.oscar-map-tools--cluster {
  top: auto;
  bottom: 14px;
}

.oscar-ol-wrap--drawing :deep(.oscar-ol-map) {
  cursor: crosshair;
}

.oscar-ol-wrap :deep(.oscar-area-drag-box) {
  border: 2px dashed #005a9f;
  background: rgba(0, 90, 159, 0.12);
}

.area-results {
  position: absolute;
  z-index: 5;
  top: 64px;
  left: 14px;
  bottom: 42px;
  width: min(320px, 44%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #dce6ef;
  border-radius: 8px;
  box-shadow: 0 3px 12px rgba(27, 60, 89, 0.16);
  color: #253b50;
}

.area-results__header { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 8px 6px 12px; border-bottom: 1px solid #dce6ef; }
.area-results h3 { margin: 0; font-size: 14px; }
.area-results__status { margin: 0; padding: 8px 12px; font-size: 12px; overflow-wrap: anywhere; }
.area-results__list { flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; overflow: auto; overscroll-behavior: contain; }
.area-results__list li { padding: 9px 12px; border-bottom: 1px solid #e9eff5; overflow-wrap: anywhere; }
.area-results__list li { cursor: pointer; }
.area-results__list li:hover, .area-results__list li:focus-within, .area-results__active { background: #e6f2ff; }
.area-results__station { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
.area-results__header button, .area-results__locate { flex: 0 0 auto; display: grid; place-items: center; width: 27px; height: 27px; padding: 0; border: 1px solid #dce6ef; border-radius: 4px; background: #fff; color: #005a9f; cursor: pointer; }
.area-results__header button:hover, .area-results__locate:hover { border-color: #005a9f; }
.area-results__locate i { display: flex; }
.area-results__locate svg { width: 17px; height: 17px; }
.area-results__locate[aria-pressed='true'] { border-color: #005a9f; background: #e6f2ff; }
.oscar-ol-wrap :deep(.oscar-area-pin-overlay) { pointer-events: none !important; }
.area-station-pin svg { width: 36px; height: 34px; display: block; overflow: visible; fill: currentColor; stroke: #fff; stroke-width: 10; paint-order: stroke; filter: drop-shadow(0 1px 2px #25455a70); }
.area-results__list dl { display: grid; gap: 3px; margin: 6px 0 0; font-size: 12px; }
.area-results__list dl div { display: flex; align-items: baseline; gap: 5px; }
.area-results__list dt { flex: 0 0 auto; font-weight: 600; }
.area-results__list dd { min-width: 0; margin: 0; }
.area-results__list a { color: #005a9f; font-size: 13px; font-weight: 600; }
.area-results__list small { display: block; color: #526b82; }
.area-results__pagination { display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; border-top: 1px solid #dce6ef; font-size: 12px; }
.area-results__pagination button { min-width: 28px; border: 1px solid #dce6ef; border-radius: 4px; background: #fff; color: #005a9f; }
.area-results__pagination button:disabled { opacity: 0.45; }

.oscar-map-tools--cluster button {
  display: grid;
  place-items: center;
}

.oscar-map-tools button[aria-pressed='true'] {
  background: var(--oscar-theme);
  border-color: var(--oscar-theme);
  color: #fff;
}

.oscar-map-tools--cluster i {
  display: flex;
}

.oscar-map-tools--cluster svg {
  width: 18px;
  height: 18px;
}

.oscar-amap {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.oscar-map-layers {
  position: absolute;
  left: 14px;
  top: 14px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.oscar-map-layers select,
.oscar-map-layers span {
  padding: 6px 8px;
  border: 1px solid #dce6ef;
  border-radius: 8px;
  background: #fff;
  color: #35536e;
  font-size: 12px;
}

.oscar-infobox {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #dce6ef;
  border-radius: 10px;
  background: #fff;
  color: #35536e;
  font-size: 12px;
}

.oscar-infobox a {
  color: var(--oscar-theme);
}

.oscar-ol-wrap :deep(.ol-scale-line) {
  left: 14px;
  bottom: 12px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
}

.oscar-ol-wrap :deep(.ol-scale-line-inner) {
  border-color: #35536e;
  color: #35536e;
  font-size: 11px;
}

.oscar-ol-wrap :deep(.ol-attribution) {
  background: transparent;
  color: #687e90;
  font-size: 10px;
}
.oscar-legend__statuses .oscar-legend__item{
  gap: 5px;
}
</style>



