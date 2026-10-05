#!/usr/bin/env bash
#
# Genera los iconos y las pantallas de arranque de iOS a partir del SVG del icono.
#
# Solo macOS: usa qlmanage (QuickLook) para rasterizar y sips para recortar y
# escalar, que vienen con el sistema. No hace falta ninguna dependencia.
#
#   ./scripts/generar-iconos.sh
#
# Los PNG resultantes se versionan en public/, así que esto solo hay que
# ejecutarlo si cambia el diseño del icono o se quiere añadir un tamaño.

set -euo pipefail

cd "$(dirname "$0")/.."

AZUL="#2563EB"
LIENZO="#F8FAFC"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Tamaños de pantalla (px físicos) de los iPhone que se cubren.
TAMANOS=(
  "1290x2796" "1179x2556" "1170x2532" "1284x2778" "1242x2688" "1125x2436" "828x1792"
)

# Icono cuadrado, a sangre: cada plataforma le pone su propia forma.
icono_svg() {
  local w=$1 h=$2
  cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $w $h" width="$w" height="$h">
  <rect width="$w" height="$h" fill="$AZUL" />
  <circle cx="$((w / 2))" cy="$((h / 2))" r="$((w * 26 / 100))" fill="none" stroke="#FFFFFF" stroke-width="$((w * 6 / 100))" />
  <path d="M$((w / 2)) $((h * 34 / 100))v$((h * 16 / 100))l$((w * 14 / 100)) $((h * 9 / 100))" fill="none" stroke="#FFFFFF" stroke-width="$((w * 6 / 100))" stroke-linecap="round" stroke-linejoin="round" />
</svg>
SVG
}

# Icono maskable. Android y las PWA recortan el icono con su propia forma y solo
# garantizan el 80% central, así que el reloj va más pequeño que en el normal y
# con el fondo a sangre (nada de esquinas redondeadas ni transparencias).
maskable_svg() {
  local w=$1 h=$2 cx cy r g
  cx=$((w / 2)); cy=$((h / 2))
  r=$((w * 22 / 100)); g=$((w * 5 / 100))
  cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $w $h" width="$w" height="$h">
  <rect width="$w" height="$h" fill="$AZUL" />
  <circle cx="$cx" cy="$cy" r="$r" fill="none" stroke="#FFFFFF" stroke-width="$g" />
  <path d="M$cx $((cy - r * 62 / 100))v$((r * 78 / 100))l$((r * 55 / 100)) $((r * 34 / 100))" fill="none" stroke="#FFFFFF" stroke-width="$g" stroke-linecap="round" stroke-linejoin="round" />
</svg>
SVG
}

# Pantalla de arranque: el mismo icono centrado sobre el lienzo de la app.
# Se dibuja en un cuadrado del lado mayor y se recorta al centro, porque
# qlmanage escala el SVG para cubrir el lienzo, no para encajarlo.
splash_svg() {
  local w=$1 h=$2 m=$3 icono=$4 cx cy r g
  cx=$((m / 2)); cy=$((m / 2))
  icono=$((w < h ? w : h)); icono=$((icono * 26 / 100))
  r=$((icono * 26 / 100)); g=$((icono * 6 / 100))
  cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $m $m" width="$m" height="$m">
  <rect width="$m" height="$m" fill="$LIENZO" />
  <rect x="$((cx - icono / 2))" y="$((cy - icono / 2))" width="$icono" height="$icono" rx="$((icono * 22 / 100))" fill="$AZUL" />
  <circle cx="$cx" cy="$cy" r="$r" fill="none" stroke="#FFFFFF" stroke-width="$g" />
  <path d="M$cx $((cy - r * 62 / 100))v$((r * 78 / 100))l$((r * 55 / 100)) $((r * 34 / 100))" fill="none" stroke="#FFFFFF" stroke-width="$g" stroke-linecap="round" stroke-linejoin="round" />
</svg>
SVG
}

# rasterizar SVG DESTINO LADO_DE_RENDER [RECORTE] [TAMANO_FINAL]
#
# qlmanage deja el lienzo en blanco cuando se le pide un tamaño pequeño, así que
# siempre se rasteriza en grande y se ajusta después con sips, que remuestrea
# de verdad. RECORTE y TAMANO_FINAL van en "ANCHOxALTO".
rasterizar() {
  local svg=$1 destino=$2 render=$3 recorte=${4:-} final=${5:-}
  local base
  base="$(basename "$destino" .png)"
  printf '%s' "$svg" >"$TMP/$base.svg"
  qlmanage -t -s "$render" -o "$TMP" "$TMP/$base.svg" >/dev/null 2>&1
  mv "$TMP/$base.svg.png" "$destino"
  if [ -n "$recorte" ]; then
    # Se queda con el centro, que es donde está el icono.
    sips -c "${recorte#*x}" "${recorte%x*}" "$destino" >/dev/null
  fi
  if [ -n "$final" ]; then
    sips -z "${final#*x}" "${final%x*}" "$destino" >/dev/null
  fi
}

echo "Iconos…"
for lado in 180 192 512; do
  rasterizar "$(icono_svg 1024 1024)" "public/icono-$lado.png" 1024 "" "${lado}x${lado}"
done
rasterizar "$(maskable_svg 1024 1024)" "public/icono-maskable-512.png" 1024 "" "512x512"

echo "Pantallas de arranque…"
mkdir -p public/splash
for tamano in "${TAMANOS[@]}"; do
  ancho=${tamano%x*}
  alto=${tamano#*x}
  mayor=$((ancho > alto ? ancho : alto))
  rasterizar "$(splash_svg "$ancho" "$alto" "$mayor" 0)" "public/splash/$tamano.png" "$mayor" "$tamano"
  echo "  $tamano"
done

echo
echo "Listo. Comprueba que las medidas son las esperadas:"
sips -g pixelWidth -g pixelHeight public/icono-180.png public/splash/*.png 2>/dev/null | grep -E "public/|pixel"
