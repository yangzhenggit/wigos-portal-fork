/**
 * Runtime configuration.
 *
 * `public/config.js` is loaded by index.html before the app bundle and may
 * define `window.__WIGOS_CONFIG__`. The container entrypoint regenerates that
 * file from environment variables at start-up, so an image can be built once and
 * pointed at another key / catalogue host without a rebuild.
 *
 * Values here win over the build-time `VITE_*` variables, which stay as a
 * development fallback (see `.env.local`).
 */
export interface PortalRuntimeConfig {
  tiandituKey?: string
  amapKey?: string
  amapSecurityJsCode?: string
  amapServiceHost?: string
  wigosGofcUrl?: string
  gofcTilesFirst?: boolean
}

type RawConfig = Partial<Record<keyof PortalRuntimeConfig, unknown>>

const raw = typeof window === 'undefined'
  ? {}
  : (window as Window & { __WIGOS_CONFIG__?: RawConfig }).__WIGOS_CONFIG__ ?? {}

const read = (key: keyof PortalRuntimeConfig): string | undefined => {
  const value = raw[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const env = import.meta.env
const gofcTilesFirst = read('gofcTilesFirst') ?? env.VITE_WIGOS_GOFC_TILES_FIRST?.trim()

export const runtimeConfig: PortalRuntimeConfig = {
  tiandituKey: read('tiandituKey') ?? env.VITE_TIANDITU_KEY?.trim(),
  amapKey: read('amapKey') ?? env.VITE_AMAP_KEY?.trim(),
  amapSecurityJsCode: read('amapSecurityJsCode') ?? env.VITE_AMAP_SECURITY_JS_CODE?.trim(),
  amapServiceHost: read('amapServiceHost') ?? env.VITE_AMAP_SERVICE_HOST?.trim(),
  wigosGofcUrl: read('wigosGofcUrl') ?? env.VITE_WIGOS_GOFC_URL?.trim(),
  gofcTilesFirst: gofcTilesFirst
    ? gofcTilesFirst === 'true'
    : env.DEV || env.MODE === 'test' || env.MODE === 'staging',
}
