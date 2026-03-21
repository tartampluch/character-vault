#!/usr/bin/env bash
# =============================================================================
# run.sh — Run Character Vault locally using PHP's built-in server
#
# USAGE:
#   ./run.sh [OPTIONS]
#
# OPTIONS:
#   -p, --port <port>   Port to listen on (default: 8080)
#   -d, --dir <path>    Path to the extracted artifact directory
#                       (default: latest entry in dist/)
#   -h, --help          Show this help and exit
#
# DESCRIPTION:
#   Uses PHP's built-in web server with a custom router that dispatches:
#     /api/*  → PHP backend  (api/index.php)
#     /*      → SvelteKit static files from build/, with SPA fallback
#
#   PHP is located (in order):
#     1. .build-tools/bin/php  (cached by scripts/build.sh)
#     2. System PHP (if ≥ 8.1)
#
#   For a production-like run with Apache + mod_rewrite, use run-docker.sh.
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()     { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8080
APP_DIR=""

# ── Argument parsing ──────────────────────────────────────────────────────────
usage() { grep '^# ' "$0" | sed 's/^# //'; exit 0; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port) PORT="$2"; shift 2 ;;
        -d|--dir)  APP_DIR="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) die "Unknown option: $1  (use --help for usage)" ;;
    esac
done

# ── Locate the artifact ───────────────────────────────────────────────────────
if [[ -z "$APP_DIR" ]]; then
    DIST_DIR="${SCRIPT_DIR}/dist"
    [[ -d "$DIST_DIR" ]] \
        || die "No dist/ directory found. Run ./scripts/build.sh first."

    APP_DIR="$(find "$DIST_DIR" -maxdepth 1 -mindepth 1 -type d \
                   -name 'character-vault-*' \
               | sort | tail -1)"

    [[ -n "$APP_DIR" ]] \
        || die "No artifact found in dist/. Run ./scripts/build.sh first."
fi

APP_DIR="$(cd "$APP_DIR" && pwd)"   # resolve to absolute path

[[ -d "${APP_DIR}/api" ]]   || die "Malformed artifact: missing api/ in ${APP_DIR}"
[[ -d "${APP_DIR}/build" ]] || die "Malformed artifact: missing build/ in ${APP_DIR}"

# ── Locate PHP ────────────────────────────────────────────────────────────────
PORTABLE_PHP="${SCRIPT_DIR}/.build-tools/bin/php"
PHP_BIN=""

_php_ok() {
    local b="$1"
    [[ -x "$b" ]] && "$b" -r "exit(version_compare(PHP_VERSION,'8.1','>=') ? 0 : 1);" 2>/dev/null
}

if _php_ok "$PORTABLE_PHP"; then
    PHP_BIN="$PORTABLE_PHP"
elif _php_ok "$(command -v php 2>/dev/null || true)"; then
    PHP_BIN="$(command -v php)"
else
    die "PHP 8.1+ not found.
  → Run ./scripts/build.sh first (it caches a portable PHP in .build-tools/)
  → Or install PHP: brew install php / apt install php8.3-cli
  → Or use Docker:  ./run-docker.sh"
fi

PHP_VER="$("$PHP_BIN" -r 'echo PHP_VERSION;')"

# ── Write the built-in server router ─────────────────────────────────────────
# The router handles three cases:
#   1. /api/*  → require api/index.php (chdir to artifact root for relative paths)
#   2. Static file in build/ → read + serve with correct MIME type
#   3. Anything else → serve build/index.html (SvelteKit SPA fallback)
ROUTER="$(mktemp /tmp/character-vault-router-XXXXXX.php)"
trap 'rm -f "$ROUTER"' EXIT

cat > "$ROUTER" <<'ROUTER_PHP'
<?php
/**
 * PHP built-in server router for Character Vault.
 *
 * Env: CHARACTER_VAULT_DIR — absolute path to the extracted artifact.
 */
declare(strict_types=1);

$appDir = rtrim((string)getenv('CHARACTER_VAULT_DIR'), '/');
$uri    = urldecode((string)parse_url((string)$_SERVER['REQUEST_URI'], PHP_URL_PATH));

// ── 1. PHP API ────────────────────────────────────────────────────────────────
if (str_starts_with($uri, '/api')) {
    // Ensure relative requires inside api/ resolve correctly
    chdir($appDir);
    // Forward the request path — api/index.php strips the /api prefix itself
    require $appDir . '/api/index.php';
    return;
}

// ── 2. Static file from build/ ────────────────────────────────────────────────
$staticFile = $appDir . '/build' . $uri;
if ($uri !== '/' && is_file($staticFile)) {
    static $mimes = [
        'html'  => 'text/html; charset=utf-8',
        'js'    => 'application/javascript',
        'mjs'   => 'application/javascript',
        'css'   => 'text/css',
        'json'  => 'application/json',
        'svg'   => 'image/svg+xml',
        'png'   => 'image/png',
        'jpg'   => 'image/jpeg',
        'jpeg'  => 'image/jpeg',
        'gif'   => 'image/gif',
        'ico'   => 'image/x-icon',
        'woff'  => 'font/woff',
        'woff2' => 'font/woff2',
        'ttf'   => 'font/ttf',
        'webp'  => 'image/webp',
        'txt'   => 'text/plain',
        'xml'   => 'application/xml',
    ];
    $ext = strtolower((string)pathinfo($staticFile, PATHINFO_EXTENSION));
    if (isset($mimes[$ext])) {
        header('Content-Type: ' . $mimes[$ext]);
    }
    // Long-lived cache for versioned assets (_app/immutable/…)
    if (str_contains($uri, '/_app/immutable/')) {
        header('Cache-Control: public, max-age=31536000, immutable');
    }
    readfile($staticFile);
    return;
}

// ── 3. SvelteKit SPA fallback ─────────────────────────────────────────────────
$index = $appDir . '/build/index.html';
if (is_file($index)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($index);
    return;
}

http_response_code(404);
header('Content-Type: text/plain');
echo "404 – Not Found\n";
echo "Artifact path: $appDir\n";
ROUTER_PHP

# ── Launch ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Character Vault — Local server${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
info "Artifact  : ${APP_DIR}"
info "PHP       : ${PHP_BIN} (${PHP_VER})"
info "Address   : http://localhost:${PORT}"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop."
echo ""

export CHARACTER_VAULT_DIR="$APP_DIR"
exec "$PHP_BIN" -S "localhost:${PORT}" -t "$APP_DIR" "$ROUTER"
