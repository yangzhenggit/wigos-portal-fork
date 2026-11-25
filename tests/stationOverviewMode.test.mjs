import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'
const source = await readFile('src/components/OscarMap.vue', 'utf8')
const start = source.indexOf('function canUseOverviewTiles(')
const end = source.indexOf('\nfunction tileFinished', start)
const eventStart = source.indexOf('for (const source of [overviewTileSource, realtimeTileSource])')
const eventEnd = source.indexOf('\nconst loading', eventStart)
const code = ts.transpileModule(source.slice(start, end) + source.slice(eventStart, eventEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
let zoom = 2, selected
const tileSourceMock = () => {
  const events = new Map()
  return {
    on: (name, callback) => events.set(name, callback),
    fail: () => events.get('tileloaderror')({ tile: {} }),
  }
}
const local = tileSourceMock(), remote = tileSourceMock()
const context = {
  tilesActive: { value: true }, overviewUnavailable: false,
  runtimeConfig: { gofcTilesFirst: false }, gofcOverviewFailed: false,
  locale: { value: 'en' }, tileFinished: () => {},
  mapRef: { value: { getView: () => ({ getZoom: () => zoom }) } },
  DEFAULT_ZOOM: 2.2, overview: { maxZoom: 5 }, overviewActive: { value: false },
  overviewTileSource: local, realtimeTileSource: remote, tileSource: local,
  pendingTiles: new Set(), tileClusterRevision: 0, stationTiles: { setSource: value => { selected = value } },
  hoverRequestVersion: 0, hover: { value: null }, hoverKey: '', mapError: { value: '' }, loading: { value: false },
  popupPinned: { value: false }, isOverPopup: { value: false },
}
vm.createContext(context); vm.runInContext(code, context)
context.selectStationSource(); assert.equal(context.overviewActive.value, true)
context.pendingTiles.add('obsolete-local-tile')
zoom = 6; context.selectStationSource()
assert.equal(selected, remote); assert.equal(context.overviewActive.value, false)
assert.equal(context.pendingTiles.size, 0)
zoom = 5; context.selectStationSource()
assert.equal(selected, local); assert.equal(context.overviewActive.value, true)
context.tilesActive.value = false; context.selectStationSource()
assert.equal(context.overviewActive.value, false)
context.tilesActive.value = true; context.overviewUnavailable = true; context.selectStationSource()
assert.equal(context.tileSource, remote)
console.log('PASS: overview/live zoom boundary, filtered mode and local failure fallback')

context.overviewUnavailable = false
context.runtimeConfig.gofcTilesFirst = true
context.selectStationSource()
assert.equal(context.tileSource, remote)
assert.equal(context.overviewActive.value, false)
local.fail()
assert.equal(context.overviewUnavailable, false)
zoom = 6
remote.fail()
assert.equal(context.tileSource, remote)
assert.equal(context.gofcOverviewFailed, false)
assert.match(context.mapError.value, /failed to load/)
zoom = 5
remote.fail()
assert.equal(context.tileSource, local)
assert.equal(context.overviewActive.value, true)
assert.equal(context.mapError.value, '')
context.selectStationSource()
assert.equal(context.tileSource, local)
local.fail()
assert.equal(context.tileSource, remote)
assert.equal(context.overviewActive.value, false)
remote.fail()
assert.match(context.mapError.value, /failed to load/)
console.log('PASS: GOFC-first mode falls back only at low zoom without a source-switch loop')
