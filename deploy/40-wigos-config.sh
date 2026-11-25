#!/bin/sh
# Generates /usr/share/nginx/html/config.js from environment variables.
# Runs automatically from the nginx image entrypoint (/docker-entrypoint.d/).
set -eu

OUT=/usr/share/nginx/html/config.js
service_host=${AMAP_SERVICE_HOST:-}
if [ -z "$service_host" ] && [ -n "${AMAP_SECURITY_JS_CODE:-}" ]; then
  service_host=/_AMapService
fi

escape() {
  printf '%s' "${1:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

cat > "$OUT" <<EOF
window.__WIGOS_CONFIG__ = {
  tiandituKey: "$(escape "${TIANDITU_KEY:-}")",
  amapKey: "$(escape "${AMAP_KEY:-}")",
  amapServiceHost: "$(escape "$service_host")",
  wigosGofcUrl: "$(escape "${WIGOS_GOFC_URL:-}")",
  gofcTilesFirst: "$(escape "${WIGOS_GOFC_TILES_FIRST:-}")",
};
EOF

chmod 644 "$OUT"
echo "wigos-portal: wrote $OUT (tianditu=$( [ -n "${TIANDITU_KEY:-}" ] && echo set || echo empty ), amap=$( [ -n "${AMAP_KEY:-}" ] && echo set || echo empty ))"
