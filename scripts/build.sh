#!/usr/bin/env bash
# =============================================================================
# scripts/build.sh — Build & package Character Vault for deployment
#
# USAGE:
#   ./scripts/build.sh [OPTIONS]
#
# OPTIONS:
#   -e, --env <env>        Target environment: production (default) | staging
#   -o, --output <dir>     Output directory for the package (default: dist-pkg)
#   -t, --tag <tag>        Package version tag (default: git describe or timestamp)
#   -s, --skip-tests       Skip PHP and JS test suites
#   --no-clean             Do not remove the intermediate build directory
#   -h, --help             Show this help and exit
#
# WHAT IT DOES:
#   1. Validates required tools (node, npm, php, composer)
#   2. Installs/updates Node.js and Composer dependencies
#   3. Runs the JS type-checker (svelte-check) and test suite (vitest)
#   4. Runs the PHP test suite (PHPUnit)
#   5. Builds the SvelteKit frontend with `npm run build`
#   6. Assembles a deployment artifact:
#        dist-pkg/
#          character-vault-<tag>/
#            build/          ← SvelteKit build output
#            api/            ← PHP backend (controllers, config, index.php …)
#            static/         ← Static rules / assets
#            composer.json   ← For production `composer install --no-dev`
#            .htaccess       ← Generated Apache routing rules
#   7. Creates a compressed tarball: character-vault-<tag>.tar.gz
#
# PRODUCTION DEPLOYMENT CHECKLIST (after running this script):
#   • Upload the tarball to the server and extract it
#   • Run: composer install --no-dev --optimize-autoloader
#   • Set environment variables / .env  (DB_HOST, DB_NAME, DB_USER, DB_PASS,
#     JWT_SECRET, APP_ENV=production)
#   • Point the web server document root at:  <extract-dir>/build/   for assets
#     and configure /api/* to be handled by PHP (see .htaccess below)
#   • Verify PHP ≥ 8.1 with pdo_sqlite / pdo_mysql and mbstring enabled
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }
step()    { echo -e "\n${BOLD}▸ $*${RESET}"; }

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV="production"
OUTPUT_DIR="dist-pkg"
SKIP_TESTS=false
CLEAN=true
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Determine version tag ─────────────────────────────────────────────────────
if git -C "$ROOT_DIR" rev-parse --git-dir > /dev/null 2>&1; then
    TAG="$(git -C "$ROOT_DIR" describe --tags --always --dirty 2>/dev/null || true)"
fi
TAG="${TAG:-$(date +%Y%m%d-%H%M%S)}"

# ── Argument parsing ──────────────────────────────────────────────────────────
usage() {
    grep '^# ' "$0" | sed 's/^# //'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -e|--env)       ENV="$2";        shift 2 ;;
        -o|--output)    OUTPUT_DIR="$2"; shift 2 ;;
        -t|--tag)       TAG="$2";        shift 2 ;;
        -s|--skip-tests) SKIP_TESTS=true; shift ;;
        --no-clean)     CLEAN=false;     shift ;;
        -h|--help)      usage ;;
        *) die "Unknown option: $1  (use --help for usage)" ;;
    esac
done

PACKAGE_NAME="character-vault-${TAG}"
OUTPUT_DIR="${ROOT_DIR}/${OUTPUT_DIR}"
STAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"
TARBALL="${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Character Vault — Build & Package${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
info "Root dir  : ${ROOT_DIR}"
info "Tag       : ${TAG}"
info "Env       : ${ENV}"
info "Output    : ${TARBALL}"
info "Skip tests: ${SKIP_TESTS}"

# ── Step 0 — Prerequisite checks ─────────────────────────────────────────────
step "Checking prerequisites"

check_tool() {
    local cmd="$1"
    local hint="${2:-}"
    command -v "$cmd" &>/dev/null \
        || die "'${cmd}' not found.${hint:+ ${hint}}"
    success "${cmd} $(${cmd} --version 2>&1 | head -1)"
}

check_tool node  "Install Node.js ≥ 18 from https://nodejs.org"
check_tool npm
check_tool php   "Install PHP ≥ 8.1"
check_tool composer "Install from https://getcomposer.org"

PHP_MIN="8.1"
PHP_VER="$(php -r 'echo PHP_VERSION;')"
if ! php -r "exit(version_compare(PHP_VERSION, '${PHP_MIN}', '>=') ? 0 : 1);"; then
    die "PHP ${PHP_MIN}+ required (found ${PHP_VER})"
fi

NODE_MIN=18
NODE_VER="$(node -e 'process.stdout.write(process.versions.node)')"
NODE_MAJOR="${NODE_VER%%.*}"
(( NODE_MAJOR >= NODE_MIN )) || die "Node.js ${NODE_MIN}+ required (found ${NODE_VER})"

# ── Step 1 — Install dependencies ────────────────────────────────────────────
step "Installing Node.js dependencies"
npm ci --prefer-offline 2>&1 | tail -5
success "npm ci done"

step "Installing Composer dependencies"
composer install --working-dir="$ROOT_DIR" --prefer-dist --quiet
success "composer install done"

# ── Step 2 — Type-check & lint (JS/TS) ───────────────────────────────────────
step "Running svelte-check (TypeScript / Svelte)"
npm --prefix "$ROOT_DIR" run check \
    || die "svelte-check reported errors — aborting build"
success "svelte-check passed"

# ── Step 3 — JS / TS Tests ───────────────────────────────────────────────────
if [[ "$SKIP_TESTS" == false ]]; then
    step "Running Vitest (frontend unit tests)"
    npm --prefix "$ROOT_DIR" run test \
        || die "Vitest tests failed — aborting build"
    success "Vitest tests passed"
else
    warn "Skipping JS/TS tests (--skip-tests)"
fi

# ── Step 4 — PHP Tests ───────────────────────────────────────────────────────
if [[ "$SKIP_TESTS" == false ]]; then
    step "Running PHPUnit (backend tests)"
    php "${ROOT_DIR}/vendor/bin/phpunit" \
        --configuration "${ROOT_DIR}/phpunit.xml" \
        --no-coverage \
        || die "PHPUnit tests failed — aborting build"
    success "PHPUnit tests passed"
else
    warn "Skipping PHP tests (--skip-tests)"
fi

# ── Step 5 — SvelteKit build ─────────────────────────────────────────────────
step "Building SvelteKit frontend (NODE_ENV=${ENV})"
NODE_ENV="$ENV" npm --prefix "$ROOT_DIR" run build \
    || die "vite build failed — see output above"
success "Frontend build completed"

# ── Step 6 — Assemble staging directory ──────────────────────────────────────
step "Assembling deployment package → ${STAGE_DIR}"

[[ "$CLEAN" == true ]] && rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

# SvelteKit output (adapter-auto → .svelte-kit/output or build/)
if [[ -d "${ROOT_DIR}/.svelte-kit/output" ]]; then
    cp -r "${ROOT_DIR}/.svelte-kit/output" "${STAGE_DIR}/build"
elif [[ -d "${ROOT_DIR}/build" ]]; then
    cp -r "${ROOT_DIR}/build" "${STAGE_DIR}/build"
else
    warn "No SvelteKit build output found at 'build/' or '.svelte-kit/output/'"
fi

# PHP backend
cp -r "${ROOT_DIR}/api"           "${STAGE_DIR}/api"
cp    "${ROOT_DIR}/composer.json" "${STAGE_DIR}/composer.json"

# Static assets (game rules JSON, robots.txt …)
cp -r "${ROOT_DIR}/static"        "${STAGE_DIR}/static"

# ── Step 7 — Generate .htaccess ───────────────────────────────────────────────
step "Generating Apache .htaccess"
cat > "${STAGE_DIR}/.htaccess" <<'HTACCESS'
# Character Vault — Apache routing
# Place this file in the web server document root.

Options -Indexes

# ── Security headers ──────────────────────────────────────────────────────────
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# ── PHP API routing ───────────────────────────────────────────────────────────
# All /api/* requests are handled by the PHP front-controller.
<IfModule mod_rewrite.c>
    RewriteEngine On

    # Route /api/* to the PHP router
    RewriteRule ^api/(.*)$ api/index.php [QSA,L]

    # Route everything else to the SvelteKit build (adapter-static / SSR)
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ build/index.html [QSA,L]
</IfModule>
HTACCESS

success ".htaccess generated"

# ── Step 8 — Create tarball ───────────────────────────────────────────────────
step "Creating tarball → ${TARBALL}"
mkdir -p "$OUTPUT_DIR"
tar -czf "$TARBALL" -C "$OUTPUT_DIR" "$PACKAGE_NAME"
TARBALL_SIZE="$(du -sh "$TARBALL" | cut -f1)"
success "Package ready: ${TARBALL}  (${TARBALL_SIZE})"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Build complete!${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "  Artifact : ${BOLD}${TARBALL}${RESET}"
echo -e "  Size     : ${TARBALL_SIZE}"
echo ""
echo -e "  Deploy steps:"
echo -e "    1. Upload ${BOLD}${PACKAGE_NAME}.tar.gz${RESET} to the server"
echo -e "    2. tar -xzf ${PACKAGE_NAME}.tar.gz"
echo -e "    3. cd ${PACKAGE_NAME} && composer install --no-dev --optimize-autoloader"
echo -e "    4. Set environment variables (DB_HOST, DB_NAME, DB_USER, DB_PASS, JWT_SECRET)"
echo -e "    5. Point web root at the extracted directory"
echo ""
