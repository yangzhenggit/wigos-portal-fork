<template>
  <div class="station-browser">
    <div class="criteria-column">
    <aside class="criteria-card">
      <header>
        <h2>{{ $t('search.criteria') }}</h2>
        <div class="criteria-actions">
          <el-button native-type="button" size="small" @click="reset">{{ $t('common.reset') }}</el-button>
          <el-button type="primary" native-type="submit" form="search-elevation" size="small">{{ t('common.search') }}</el-button>
        </div>
      </header>
      <label class="criterion"><span>{{ $t('search.keyword') }}</span><el-input v-model="keyword" clearable @focus="keywordFocused = true" @blur="keywordFocused = false" @keyup.enter="submitKeyword" :placeholder="$t('search.keywordPlaceholder')" :prefix-icon="Search" /></label>
      <p v-if="keywordTooShort" role="status">{{ t('home.searchMinLength') }}</p>
      <label v-for="field in fields" :key="field.key" class="criterion">
        <span>{{ field.label }}</span>
        <el-select v-model="filters[field.key]" multiple collapse-tags collapse-tags-tooltip filterable clearable :placeholder="$t('common.all')" :aria-label="field.label">
          <el-option v-for="option in field.options" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </label>
      <label class="criterion">
        <span>{{ t('search.advanced.approval') }}</span>
        <el-select v-model="approvalStatus" :aria-label="t('search.advanced.approval')">
          <el-option value="all" :label="t('common.all')" />
          <el-option v-for="status in approvalStatuses" :key="status" :value="status" :label="t('search.advanced.' + status)" />
        </el-select>
        <small v-if="approvalStatus !== 'all'" role="status">{{ t('search.advanced.approvalUnavailable') }}</small>
      </label>
      <fieldset class="advanced-filter">
        <legend>{{ t('search.advanced.reportingStatus') }}</legend>
        <div class="status-source">
          <label><input v-model="statusSource" type="radio" value="declared" /> {{ t('search.advanced.declared') }}</label>
          <label><input v-model="statusSource" type="radio" value="assessed" /> {{ t('search.advanced.assessed') }}</label>
        </div>
        <el-select v-model="selectedReportingStatuses" multiple collapse-tags collapse-tags-tooltip clearable
                   :placeholder="t('common.all')"
                   :aria-label="t('search.advanced.reportingStatus')">
          <el-option v-for="status in visibleStatuses" :key="status" :value="status" :label="t('search.advanced.' + status)" />
        </el-select>
        <!-- <p v-if="statusSource === 'assessed'" role="status">{{ t('search.advanced.assessedUnavailable') }}</p> -->
      </fieldset>
      <form id="search-elevation" class="range-filter" @submit.prevent="applyRanges">
        <fieldset class="advanced-filter">
          <legend>{{ t('search.advanced.elevation') }}</legend>
          <div class="range-filter__grid">
            <label><span>{{ t('search.advanced.minElevation') }}</span><input v-model="rangeDraft.minElevation" type="number" step="any" /></label>
            <label><span>{{ t('search.advanced.maxElevation') }}</span><input v-model="rangeDraft.maxElevation" type="number" step="any" /></label>
          </div>
        </fieldset>
        <p v-if="invalidRange" role="alert">{{ t('search.advanced.invalidRange') }}</p>
      </form>
    </aside>
    <section v-if="mode === 'map'" class="area-controls">
      <div class="area-controls__actions">
        <el-button :type="mapWidget?.drawingArea ? 'default' : 'primary'" :disabled="!mapWidget" @click="toggleAreaDrawing">
          {{ t(mapWidget?.drawingArea ? 'map.cancelAreaDrawing' : mapWidget?.selectedArea ? 'map.reselectArea' : 'map.selectArea') }}
        </el-button>
      </div>
      <p v-if="mapWidget?.drawingArea" role="status">{{ t('map.areaDrawHint') }}</p>
      <form v-if="mapWidget?.selectedArea" class="area-controls__coordinates" @submit.prevent="applyArea">
        <div class="range-filter__grid">
          <label><span>{{ t('search.advanced.longitudeFrom') }}</span><input v-model="areaCoordinates.west" type="number" step="any" required /></label>
          <label><span>{{ t('search.advanced.longitudeTo') }}</span><input v-model="areaCoordinates.east" type="number" step="any" required /></label>
          <label><span>{{ t('search.advanced.latitudeFrom') }}</span><input v-model="areaCoordinates.south" type="number" step="any" required /></label>
          <label><span>{{ t('search.advanced.latitudeTo') }}</span><input v-model="areaCoordinates.north" type="number" step="any" required /></label>
        </div>
        <p v-if="invalidArea" role="alert">{{ t('map.areaInvalid') }}</p>
        <div class="area-controls__actions" style="justify-content: space-between;">
          <el-button size="small" v-if="mapWidget?.selectedArea" @click="mapWidget?.setSelectedArea()">{{ t('map.clearArea') }}</el-button>
          <el-button native-type="submit" type="primary" size="small">{{ t('map.applyArea') }}</el-button>
        </div>
      </form>
    </section>
    </div>
    <section class="results-card" :aria-busy="showMapCount ? mapCount === undefined && !mapCountFailed : loading">
      <header class="results-header">
        <div>
          <h2>{{ $t('search.results') }}</h2>
          <span v-if="showMapCount && mapCount !== undefined">{{ $t('search.mapCount', { count: mapCount.toLocaleString() }) }}</span>
          <span v-else-if="!showMapCount && !loading && !error">{{ $t('search.remoteCount', { count: total.toLocaleString() }) }}</span>
        </div>
        <div class="mode-switch" :aria-label="$t('search.resultsDisplayMode')">
          <button :class="{ active: mode === 'list' }" @click="mode = 'list'"><el-icon><List /></el-icon> {{ $t('common.list') }}</button>
          <button :class="{ active: mode === 'map' }" @click="mode = 'map'"><el-icon><MapLocation /></el-icon> {{ $t('common.map') }}</button>
        </div>
      </header>
      <div class="active-criteria"><span>{{ $t('search.activeCriteria', { value: activeCriteria.length ? activeCriteria.join(' · ') : $t('search.none') }) }}</span></div>
      <div v-if="mapOpened" v-show="mode === 'map'" class="map-wrap">
        <OscarMap ref="mapWidget" :map-query="displayedMapQuery" focus-exact-match area-selection @viewport-count="updateMapCount" />
      </div>
      <p v-if="loading && mode === 'list'" class="state-message">{{ $t('search.loadingRemote') }}</p>
      <div v-else-if="error && mode === 'list'" class="state-message" role="alert">{{ error }} <el-button @click="loadPage">{{ $t('common.retry') }}</el-button></div>
      <template v-else-if="mode === 'list'">
          <div class="table-wrap">
            <table>
              <thead><tr><th><button class="sort-button" @click="toggleSort">{{ $t('search.th.stationName') }} {{ ascending ? '↑' : '↓' }}</button></th><th>{{ $t('search.th.type') }}</th><th>{{ $t('search.th.territory') }}</th><th>{{ $t('search.th.position') }}</th><th>{{ $t('search.th.status') }}</th><th>{{ $t('search.th.program') }}</th></tr></thead>
              <tbody><tr v-for="station in paged" :key="station.id">
                <td><router-link :to="{ name: 'stationReportDetails', params: { wigosId: station.wigos } }">{{ station.name }}</router-link><small>{{ station.wigos }}</small></td>
                <td>{{ station.type }}</td><td>{{ station.terr }}</td>
                <td class="position">{{ station.lat == null || station.lon == null ? '—' : `${coordinate(station.lat, true)}, ${coordinate(station.lon, false)}` }}<small>{{ station.elev == null ? '—' : `${station.elev} m` }}</small></td>
                <td><span class="status" :class="{ operational: station.decl === 'Operational' }">{{ station.decl || $t('common.unknown') }}</span></td>
                <td><span v-for="program in station.prog" :key="program" class="program">{{ program }}</span></td>
              </tr><tr v-if="!filtered.length"><td colspan="6" class="state-message">{{ $t('search.noMatching') }}</td></tr></tbody>
            </table>
          </div>
          <footer class="pagination">
            <el-button size="small" :disabled="page <= 1 || loading" :icon="ArrowLeft" :aria-label="$t('common.previousPage')" @click="goPage(page - 1)" />
            <span>{{ $t('search.pagination', { page, count: pageCount, total: total.toLocaleString() }) }}</span>
            <el-button size="small" :disabled="page >= pageCount || loading" :icon="ArrowRight" :aria-label="$t('common.nextPage')" @click="goPage(page + 1)" />
            <select v-model.number="pageSize" :aria-label="$t('common.recordsPerPage')"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select>
          </footer>
      </template>
      <footer v-if="fetchedAt && mode === 'list'" class="data-note">{{ $t('search.remoteNote', { count: filtered.length, total: total.toLocaleString(), date: fetchedAt.slice(0, 10) }) }}</footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight, List, MapLocation, Search } from '@element-plus/icons-vue'
import OscarMap from '../components/OscarMap.vue'
import { saveSearchSnapshot } from '../stores/searchExport'
import { ElButton, ElIcon, ElInput, ElOption, ElSelect } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/select/style/css'
import { useI18n } from 'vue-i18n'
import { searchFacilities, featureToRow, useMapTiles, type FacilitySearchParams, type WigosFeature } from '../api/wigos'
import { facilityTypes, programAffiliations, loadProgramAffiliations, variableInfo, wmoRegions, type WmdrCode } from '../data/wmdrCodes'
import type { Locale } from '../i18n'
import { searchOptionLabel } from '../i18n/searchOptions'
import { territories } from '../data/wmdrTerritories'
import variableTreeRaw from '../data/variableTree.json'

interface Station {
  id: string
  name: string
  wigos: string
  lat: number | null
  lon: number | null
  elev: number | null
  type: string
  cls: string
  terr: string
  ra: string
  decl: string
  ass: string
  prog: string[]
}

type FilterKey = 'type' | 'program' | 'variable' | 'ra' | 'terr'

const programmeOptions = ref([...programAffiliations])
onMounted(async () => { programmeOptions.value = await loadProgramAffiliations() })

const route = useRoute()
const { t, locale } = useI18n()
const keyword = ref(String(route.query.q || ''))
const keywordFocused = ref(false)
const keywordTooShort = computed(() => keywordFocused.value && Array.from(keyword.value.trim()).length < 3)
const mode = ref<'map' | 'list'>(route.query.mode === 'list' ? 'list' : 'map')
const mapOpened = ref(mode.value === 'map')
const mapWidget = ref<InstanceType<typeof OscarMap>>()
const areaCoordinates = reactive({ west: '', south: '', east: '', north: '' })
const invalidArea = ref(false)

watch(() => mapWidget.value?.selectedArea, area => {
  areaCoordinates.west = area ? area[0].toFixed(6) : ''
  areaCoordinates.south = area ? area[1].toFixed(6) : ''
  areaCoordinates.east = area ? area[2].toFixed(6) : ''
  areaCoordinates.north = area ? area[3].toFixed(6) : ''
  invalidArea.value = false
})

function toggleAreaDrawing() {
  mapWidget.value?.setDrawingArea(!mapWidget.value.drawingArea)
}

function applyArea() {
  const parts = [areaCoordinates.west, areaCoordinates.south, areaCoordinates.east, areaCoordinates.north]
  const [west, south, east, north] = parts.map(Number)
  invalidArea.value = parts.some(value => String(value).trim() === '') ||
    west === undefined || south === undefined || east === undefined || north === undefined ||
    ![west, south, east, north].every(Number.isFinite) ||
    west < -180 || east > 180 || south < -85 || north > 85 || west >= east || south >= north
  if (!invalidArea.value) mapWidget.value?.setSelectedArea([west!, south!, east!, north!])
}
const filters = reactive<Record<FilterKey, string[]>>({ type: [], program: [], variable: [], ra: [], terr: [] })
const statusSource = ref<'declared' | 'assessed'>('declared')
const reportingStatuses = ref<string[]>([])
const assessedStatuses = ref<string[]>([])
const selectedReportingStatuses = computed({
  get: () => statusSource.value === 'declared' ? reportingStatuses.value : assessedStatuses.value,
  set: (value: string[]) => {
    if (statusSource.value === 'declared') reportingStatuses.value = value
    else assessedStatuses.value = value
  },
})
const declaredStatuses = ['operational', 'partlyOperational', 'unknown', 'nonReporting', 'closed']
const visibleStatuses = computed(() => statusSource.value === 'declared' ? declaredStatuses : declaredStatuses.slice(0, -1))
const approvalStatuses = ['approved', 'declined', 'pending']
const approvalStatus = ref('all')
const emptyRangeDraft = { minElevation: '', maxElevation: '' }
const rangeDraft = reactive({ ...emptyRangeDraft })
const appliedRange = shallowRef<Pick<FacilitySearchParams, 'minElevation' | 'maxElevation'>>({})
const invalidRange = ref(false)

function applyRanges() {
  const { minElevation, maxElevation } = rangeDraft
  const minimum = minElevation === '' ? undefined : Number(minElevation)
  const maximum = maxElevation === '' ? undefined : Number(maxElevation)
  invalidRange.value = minimum !== undefined && maximum !== undefined && minimum > maximum
  if (invalidRange.value) return
  appliedRange.value = { minElevation: minimum, maxElevation: maximum }
}
const rows = ref<Station[]>([])
const total = ref(0)
const fetchedAt = ref('')
const loading = ref(true)
const error = ref('')
const page = ref(1)
const pageSize = ref(25)
const ascending = ref(true)
let requestSeq = 0
let pageController: AbortController | undefined

interface VariableNode { id: number; text: string; children?: VariableNode[] }

function flattenVariables(nodes: VariableNode[]): { id: number; text: string }[] {
  const out: { id: number; text: string }[] = []
  for (const node of nodes) {
    out.push({ id: node.id, text: node.text })
    if (node.children?.length) out.push(...flattenVariables(node.children))
  }
  return out
}

function resetRanges() {
  Object.assign(rangeDraft, emptyRangeDraft)
  appliedRange.value = {}
  invalidRange.value = false
}

const variableOptions = flattenVariables(variableTreeRaw as VariableNode[])
  .map(({ id, text }) => ({ id: String(id), title: text }))

const optionCollator = computed(() => new Intl.Collator(locale.value, { sensitivity: 'base' }))

function sortedOptions(group: FilterKey, codes: WmdrCode[]) {
  const language = locale.value as Locale
  const collator = optionCollator.value
  return codes.map(({ id, title }) => ({ value: id, label: searchOptionLabel(group, id, title, language) }))
    .sort((left, right) => collator.compare(left.label, right.label))
}

const fields = computed<{ key: FilterKey; label: string; options: ReturnType<typeof sortedOptions> }[]>(() => [
  { key: 'type', label: t('search.field.type'), options: sortedOptions('type', facilityTypes.filter((type) => type.id !== 'unknown')) },
  { key: 'program', label: t('search.field.program'), options: sortedOptions('program', programmeOptions.value) },
  { key: 'variable', label: t('search.field.variable'), options: sortedOptions('variable', variableOptions) },
  { key: 'ra', label: t('search.field.region'), options: sortedOptions('ra', wmoRegions) },
  { key: 'terr', label: t('search.field.territory'), options: sortedOptions('terr', territories) },
])

const activeCriteria = computed(() =>
  [
    keyword.value.trim(),
    ...fields.value.flatMap(({ key, options }) =>
      filters[key].map((value) => options.find((option) => option.value === value)?.label ?? value)),
    ...(statusSource.value === 'declared' ? reportingStatuses.value.map(status => t('search.advanced.' + status)) : []),
    ...(['minElevation', 'maxElevation'] as const).flatMap(key => {
      const value = appliedRange.value[key]
      return value === undefined ? [] : [t('search.advanced.' + key) + ' ' + value + ' m']
    }),
  ].filter(Boolean),
)

const mapQuery = computed(() => ({
  q: keyword.value.trim() || undefined,
  types: [...filters.type],
  programs: [...filters.program],
  territories: [...filters.terr],
  variables: filters.variable.map(Number),
  regions: [...filters.ra],
  reportingStatuses: statusSource.value === 'declared' ? [...reportingStatuses.value] : [],
  ...appliedRange.value,
}))
const showMapCount = computed(() => mode.value === 'map' && (Boolean(mapWidget.value?.selectedArea) || !useMapTiles(mapQuery.value)))
const uniqueKeywordMatch = shallowRef<{ query: FacilitySearchParams; id: string }>()
const displayedMapQuery = computed(() => {
  if (mapWidget.value?.selectedArea) return mapQuery.value
  const match = uniqueKeywordMatch.value
  return match?.query === mapQuery.value ? { ...match.query, q: match.id } : mapQuery.value
})
let mapSubmission: FacilitySearchParams | undefined
const mapCount = ref<number>()
const mapCountFailed = ref(false)

function updateMapCount(query: FacilitySearchParams, count: number | undefined, failed: boolean) {
  if (query !== displayedMapQuery.value) return
  mapCount.value = count
  mapCountFailed.value = failed
}

function submitKeyword() {
  const query = mapQuery.value
  if (query.q?.startsWith('0-')) {
    mode.value = 'map'
  } else if (query.q && mode.value === 'list') {
    mapSubmission = query
    window.clearTimeout(filterTimer)
    goPage(1)
  }
}

function toStation(feature: WigosFeature): Station {
  const row = featureToRow(feature, true)
  const categories = [
    ...new Set(
      (feature.properties.observations ?? [])
        .map((observation) => variableInfo(observation.observedProperty?.id)?.category)
        .filter(Boolean) as string[],
    ),
  ]
  return {
    id: feature.id,
    name: row.name,
    wigos: feature.id,
    lat: row.lat,
    lon: row.lon,
    elev: row.elevation ?? null,
    type: row.type,
    cls: categories.join(', '),
    terr: row.country,
    ra: feature.properties.wmoRegion?.id ? feature.properties.wmoRegion.id : '',
    decl: row.status,
    ass: row.status,
    prog: row.programs,
  }
}

async function loadPage() {
  pageController?.abort()
  const seq = ++requestSeq
  const mapOnly = mode.value === 'map'
  const query = mapQuery.value
  if (mapOnly && (mapWidget.value?.selectedArea || query.minElevation !== undefined || query.maxElevation !== undefined)) {
    loading.value = false
    return
  }
  const controller = new AbortController()
  pageController = controller
  loading.value = true
  error.value = ''
  try {
    const result = await searchFacilities({
      ...query,
      limit: mapOnly ? 1 : pageSize.value,
      offset: mapOnly ? 0 : (page.value - 1) * pageSize.value,
      full: !mapOnly || Boolean(query.q && !query.q.startsWith('0-')),
      signal: controller.signal,
      sortby: ascending.value ? 'title' : '-title',
    })
    if (seq !== requestSeq || query !== mapQuery.value) return
    const id = result.features[0]?.id
    if (query.q && !query.q.startsWith('0-') && result.numberMatched === 1 && id) {
      if (uniqueKeywordMatch.value?.query !== query || uniqueKeywordMatch.value.id !== id) {
        uniqueKeywordMatch.value = { query, id }
      }
      if (mapSubmission === query) mode.value = 'map'
    }
    if (mapSubmission === query) mapSubmission = undefined
    rows.value = mapOnly ? [] : result.features.map(toStation)
    total.value = result.numberMatched
    fetchedAt.value = result.timeStamp ?? new Date().toISOString()
  } catch (cause) {
    if (seq !== requestSeq || query !== mapQuery.value) return
    if (mapSubmission === query) mapSubmission = undefined
    rows.value = []
    total.value = 0
    error.value = t('search.remoteError', { message: cause instanceof Error ? cause.message : String(cause) })
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

const filtered = computed(() => rows.value)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const paged = computed(() => filtered.value)
function coordinate(value: number | null, latitude: boolean) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.abs(value).toFixed(3)}°${latitude ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E')}`
}

function reset() {
  keyword.value = ''
  for (const key of Object.keys(filters) as FilterKey[]) filters[key] = []
  statusSource.value = 'declared'
  reportingStatuses.value = []
  assessedStatuses.value = []
  approvalStatus.value = 'all'
  resetRanges()
  page.value = 1
  void loadPage()
}

function goPage(next: number) {
  page.value = Math.min(pageCount.value, Math.max(1, next))
  void loadPage()
}

function toggleSort() {
  ascending.value = !ascending.value
  page.value = 1
  void loadPage()
}

let filterTimer = 0
function scheduleReload() {
  window.clearTimeout(filterTimer)
  filterTimer = window.setTimeout(() => {
    page.value = 1
    void loadPage()
  }, 350)
}

onMounted(() => {
  void loadPage()
})

onBeforeUnmount(() => {
  requestSeq++
  pageController?.abort()
  window.clearTimeout(filterTimer)
})

watch(displayedMapQuery, () => {
  mapCount.value = undefined
  mapCountFailed.value = false
})
watch(mapQuery, scheduleReload)
watch(() => Boolean(mapWidget.value?.selectedArea), () => {
  if (mode.value === 'map') void loadPage()
})
watch(mode, () => {
  if (mode.value !== 'map') mapWidget.value?.setDrawingArea(false)
  if (mode.value === 'map') mapOpened.value = true
  void loadPage()
})
watch(pageSize, () => {
  page.value = 1
  void loadPage()
})
watch([rows, total, activeCriteria], () => {
  saveSearchSnapshot({
    query: {
      ...mapQuery.value,
      sortby: ascending.value ? 'title' : '-title',
    },
    total: total.value,
    filteredIds: rows.value.map((row) => row.id),
    filteredCount: rows.value.length,
    criteriaLabel: activeCriteria.value.join(' · ') || 'none',
    updatedAt: new Date().toISOString(),
  })
}, { immediate: true })
</script>

<style scoped lang="scss">
.station-browser { --search-accent: var(--oscar-theme); display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 18px; padding: 16px; background: #f2f6fa; align-items: start; color: #536475; }
.criteria-card, .results-card { background: white; border: 1px solid #e0e8ec; border-radius: 8px; padding: 20px; min-width: 0; }
.criteria-card { max-height: calc(100vh - 190px); overflow-y: auto; }
.criteria-column { min-width: 0; }
.advanced-filter { min-width: 0; margin: 12px 0 12px; padding: 8px; }
.advanced-filter legend { padding: 0 4px; font-size: 13px; }
.advanced-filter p, .criterion small, .range-filter p { margin: 6px 0 0; font-size: 12px; }
.status-source { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; font-size: 12px; }
.status-source label { display: flex; align-items: center; gap: 3px; }
.range-filter__grid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.range-filter__grid label { display: grid; gap: 4px; font-size: 12px; }
.range-filter__grid input { box-sizing: border-box; width: 100%; padding: 5px; border: 1px solid #c4d2de; border-radius: 4px; }
.range-filter [role='alert'] { color: #a12727; margin-bottom: 6px; }
.criteria-actions { display: flex; justify-content: flex-end; gap: 8px; margin-left: auto; }
.criteria-actions :deep(.el-button + .el-button) { margin-left: 0; }
.area-controls { margin-top: 12px; padding: 14px; background: #fff; border: 1px solid #e0e8ec; border-radius: 8px; }
.area-controls__actions { display: flex; flex-wrap: wrap; gap: 6px; }
.area-controls__actions :deep(.el-button + .el-button) { margin-left: 0; }
.area-controls p { margin: 8px 0 0; font-size: 12px; }
.area-controls__coordinates { display: grid; gap: 8px; margin-top: 12px; }
.area-controls__coordinates button { justify-self: start; }
.area-controls p[role='alert'] { color: #a12727; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { display: inline; margin: 0; padding: 0; border: 0; text-transform: uppercase; font-size: 13px; letter-spacing: 1px; font-weight: 700; color: #405365; }
.criterion { display: block; margin-top: 17px; font-weight: 400; }
.criterion > span { display: block; text-transform: uppercase; font-size: 11px; margin-bottom: 7px; color: #718194; }
.criterion :deep(.el-select) { width: 100%; }
.criterion :deep(.el-input),
.criterion :deep(.el-select) {
  --el-border-color: #303133;
  --el-border-color-hover: #303133;
  --el-text-color-placeholder: #303133;
  --el-text-color-disabled: #303133;
  --el-input-border-color: #303133;
  --el-input-hover-border-color: #303133;
  --el-input-placeholder-color: #303133;
  --el-input-icon-color: #303133;
}
.criterion :deep(.el-select__caret) { color: #303133; }
.mode-switch { display: inline-flex; padding: 3px; border: 1px solid #e2e9ed; border-radius: 24px; white-space: nowrap; }
.mode-switch button { display: inline-flex; gap: 5px; align-items: center; justify-content: center; border: 0; background: transparent; border-radius: 20px; padding: 6px 12px; color: #647588; font-size: 12px; }
.mode-switch button.active { background: var(--oscar-theme-soft); color: var(--search-accent); box-shadow: inset 0 0 0 1px #b3cee6; }
.results-header > div:first-child { display: flex; align-items: center; gap: 14px; }
.results-header span, .data-note { font-size: 11px; color: #7d8b99; }
.active-criteria { margin: 16px 0 12px; font-size: 11px; }
.active-criteria span { display: inline-block; padding: 4px 8px; background: #f5f7fa; border: 1px solid #e4eaf0; border-radius: 4px; overflow-wrap: anywhere; }
.map-wrap { position: relative; overflow: hidden; border: 1px solid #d9e5e7; border-radius: 6px; }
.map-wrap :deep(.oscar-ol-wrap) { margin-inline: 0; }
.map-wrap :deep(.oscar-ol-map) { height: max(430px, calc(100vh - 330px)); }
.map-caption { padding: 6px 10px; background: #f5f8fa; font-size: 10px; }
.map-empty { position: absolute; top: 45%; width: 100%; text-align: center; background: #ffffffd9; padding: 12px; }
.table-wrap { height: max(390px, calc(100vh - 380px)); overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { position: sticky; top: 0; background: #f4f7fb; color: #718198; text-transform: uppercase; font-size: 11px; padding: 12px 10px; white-space: nowrap; z-index: 1; }
td { padding: 12px 10px; border-bottom: 1px solid #e8edf1; vertical-align: top; }
td:first-child { min-width: 160px; }
a { color: var(--oscar-theme); }
small { display: block; margin-top: 5px; color: #8a96a3; font-size: 10px; }
.sort-button { border: 0; background: none; color: var(--search-accent); text-transform: uppercase; padding: 0; }
.position { white-space: nowrap; font-family: monospace; }
.status, .program { display: inline-block; border: 1px solid #e0e7ec; border-radius: 3px; padding: 3px 6px; background: #f7f9fc; font-size: 10px; margin: 0 3px 3px 0; }
.status.operational { color: var(--search-accent); background: var(--oscar-theme-soft); border-color: #c8ddf0; }
.pagination { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; font-size: 11px; }
.pagination select { border: 1px solid #dce4e9; border-radius: 4px; padding: 6px; }
.data-note { margin-top: 14px; }
.state-message { padding: 40px 15px; text-align: center; }
@media (max-width: 1000px) { .station-browser { grid-template-columns: 235px minmax(0, 1fr); gap: 12px; padding: 8px; } .criteria-card, .results-card { padding: 12px; } }
@media (max-width: 700px) { .station-browser { grid-template-columns: 1fr; } .criteria-card { max-height: 320px; } .results-header > div:first-child { flex-wrap: wrap; gap: 6px; } }
</style>
