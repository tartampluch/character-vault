#!/usr/bin/env bash
# =============================================================================
# scripts/build.sh — Build & package Character Vault for deployment
#
# USAGE:
#   ./scripts/build.sh [OPTIONS]
#
# OPTIONS:
#   -e, --env <env>        Target environment: production (default) | staging
#   -o, --output <dir>     Output directory for the tarball (default: dist-pkg)
#   -d, --deploy <dir>     Local directory for the extracted artifact (default: dist)
#                          This is a LOCAL path — not a remote deployment target.
#   -t, --tag <tag>        Package version tag (default: git describe or timestamp)
#   -s, --skip-tests       Skip PHP and JS test suites
#   --no-clean             Do not remove the intermediate build directory
#   -h, --help             Show this help and exit
#
# WHAT IT DOES:
#   0. Sets up portable build tools in .build-tools/ (never pollutes the system):
#        - Uses system PHP ≥ 8.1 if available, or downloads a static PHP binary
#        - Downloads Composer PHAR if not already cached
#   1. Installs/updates Node.js and Composer dev dependencies
#   2. Runs the JS type-checker (svelte-check) and Vitest test suite
#   3. Runs the PHP test suite (PHPUnit) — Composer is ONLY needed here
#   4. Builds the SvelteKit frontend with `npm run build`
#   5. Assembles a self-contained deployment artifact:
#        dist/
#          character-vault-<tag>/     ← extracted, ready to use (for run.sh)
#            build/     ← SvelteKit compiled output
#            api/       ← PHP backend (zero external dependencies)
#            static/    ← Static assets (rules JSON, robots.txt …)
#            .htaccess  ← Apache routing rules
#            VERSION    ← Version tag string
#        dist-pkg/
#          character-vault-<tag>.tar.gz  ← compressed tarball for upload
#
# PRODUCTION DEPLOYMENT (after uploading and extracting the tarball):
#   • Point the Apache/nginx document root at the extracted directory
#   • The database is created automatically on the first API request (no manual step)
#   • Optionally add .env next to index.html for APP_ENV=production + custom DB_PATH
#   • Verify PHP ≥ 8.1 with pdo_sqlite enabled — NO Composer needed on the server
#
# LOCAL TEST RUN (after building):
#   ./run.sh           — PHP built-in server (no dependencies beyond PHP)
#   ./run-docker.sh    — Docker with Apache + PHP (no host PHP needed)
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

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_TOOLS_DIR="${ROOT_DIR}/.build-tools"

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV="production"
OUTPUT_DIR="dist-pkg"    # tarball destination (relative to ROOT_DIR)
DEPLOY_DIR="dist"        # extracted artifact destination (relative to ROOT_DIR)
SKIP_TESTS=false
CLEAN=true

# ── Version tag ───────────────────────────────────────────────────────────────
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
        -e|--env)        ENV="$2";        shift 2 ;;
        -o|--output)     OUTPUT_DIR="$2"; shift 2 ;;
        -d|--deploy)     DEPLOY_DIR="$2"; shift 2 ;;
        -t|--tag)        TAG="$2";        shift 2 ;;
        -s|--skip-tests) SKIP_TESTS=true; shift ;;
        --no-clean)      CLEAN=false;     shift ;;
        -h|--help)       usage ;;
        *) die "Unknown option: $1  (use --help for usage)" ;;
    esac
done

PACKAGE_NAME="character-vault-${TAG}"
OUTPUT_DIR="${ROOT_DIR}/${OUTPUT_DIR}"
DEPLOY_DIR="${ROOT_DIR}/${DEPLOY_DIR}"
STAGE_DIR="${DEPLOY_DIR}/${PACKAGE_NAME}"
TARBALL="${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Character Vault — Build & Package${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
info "Root dir  : ${ROOT_DIR}"
info "Tag       : ${TAG}"
info "Env       : ${ENV}"
info "Tarball   : ${TARBALL}"
info "Deploy dir: ${STAGE_DIR}"
info "Skip tests: ${SKIP_TESTS}"

# =============================================================================
# Step 0 — Portable build-tool setup (.build-tools/)
# =============================================================================
step "Setting up portable build tools (.build-tools/)"

mkdir -p "${BUILD_TOOLS_DIR}/bin"

# ── 0a: PHP ───────────────────────────────────────────────────────────────────
# We try (in order):
#   1. Cached portable PHP from a previous build
#   2. System PHP if it meets the version requirement
#   3. Download a static PHP binary from static-php-cli releases
PHP_MIN="8.1"
PORTABLE_PHP="${BUILD_TOOLS_DIR}/bin/php"

# PHP command array — supports flags without string-splitting issues
PHP=()

_php_ok() {
    local bin="$1"
    [[ -x "$bin" ]] && "$bin" -r "exit(version_compare(PHP_VERSION,'${PHP_MIN}','>=') ? 0 : 1);" 2>/dev/null
}

if _php_ok "$PORTABLE_PHP"; then
    PHP=("$PORTABLE_PHP")
    success "Portable PHP cached: $(${PORTABLE_PHP} -r 'echo PHP_VERSION;')"

elif _php_ok "$(command -v php 2>/dev/null || true)"; then
    PHP=("$(command -v php)")
    success "Using system PHP: $(php -r 'echo PHP_VERSION;')"

else
    info "No suitable PHP found — downloading a static PHP binary…"

    _OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    _ARCH="$(uname -m)"
    [[ "$_ARCH" == "arm64" ]] && _ARCH="aarch64"

    case "${_OS}-${_ARCH}" in
        linux-x86_64)    _PLATFORM="linux-x86_64"   ;;
        linux-aarch64)   _PLATFORM="linux-aarch64"  ;;
        darwin-x86_64)   _PLATFORM="macos-x86_64"   ;;
        darwin-aarch64)  _PLATFORM="macos-aarch64"  ;;
        *)
            die "No pre-built PHP binary available for ${_OS}-${_ARCH}.
  → Install PHP ${PHP_MIN}+ manually (brew install php, apt install php8.3-cli, …)
  → Or use the Docker build: ./scripts/build-docker.sh"
            ;;
    esac

    info "Querying GitHub API for latest static-php-cli release (${_PLATFORM})…"
    _API_RESP="$(curl -sfL \
        "https://api.github.com/repos/crazywhalecc/static-php-cli/releases/latest" \
        2>/dev/null)" \
        || die "Cannot reach GitHub API. Check your connection or use: ./scripts/build-docker.sh"

    _PHP_URL="$(printf '%s\n' "$_API_RESP" \
        | grep '"browser_download_url"' \
        | grep -E "php-8\.[0-9]+-cli-${_PLATFORM}" \
        | head -1 \
        | sed 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"

    [[ -n "$_PHP_URL" ]] \
        || die "No PHP binary found for ${_PLATFORM} in the latest static-php-cli release.
  → Install PHP ${PHP_MIN}+ manually or use: ./scripts/build-docker.sh"

    info "Downloading: ${_PHP_URL}"
    _TMP_ARCHIVE="$(mktemp /tmp/php-static-XXXXXX.tar.gz)"
    curl -#L "$_PHP_URL" -o "$_TMP_ARCHIVE" \
        || die "Download failed. Use: ./scripts/build-docker.sh"

    # Extract — handle archives with or without a containing directory
    _TMP_EXTRACT="$(mktemp -d /tmp/php-extract-XXXXXX)"
    tar -xzf "$_TMP_ARCHIVE" -C "$_TMP_EXTRACT"
    rm -f "$_TMP_ARCHIVE"

    _PHP_FOUND="$(find "$_TMP_EXTRACT" -maxdepth 3 -type f -name 'php' | head -1)"
    [[ -n "$_PHP_FOUND" ]] \
        || die "Could not find a 'php' binary inside the downloaded archive"

    mv "$_PHP_FOUND" "$PORTABLE_PHP"
    rm -rf "$_TMP_EXTRACT"
    chmod +x "$PORTABLE_PHP"

    _php_ok "$PORTABLE_PHP" \
        || die "Downloaded PHP binary failed the version check (need ≥ ${PHP_MIN})"

    PHP=("$PORTABLE_PHP")
    success "Portable PHP ready: $("$PORTABLE_PHP" -r 'echo PHP_VERSION;')"
fi

# Write a minimal php.ini for the build environment (memory + display errors only;
# pdo_sqlite and other extensions are compiled into static binaries or already active).
BUILD_PHP_INI="${BUILD_TOOLS_DIR}/php.ini"
cat > "$BUILD_PHP_INI" <<'PHPINI'
; Character Vault — build-environment PHP configuration
; Used only by the build script; never deployed to production.
memory_limit        = 512M
max_execution_time  = 120
error_reporting     = E_ALL
display_errors      = On
log_errors          = Off
PHPINI

# Add the ini flag only for the portable binary (system PHP has its own ini)
[[ "${PHP[0]}" == "$PORTABLE_PHP" ]] && PHP+=("-c" "$BUILD_PHP_INI")

# ── 0b: Composer ──────────────────────────────────────────────────────────────
# Composer is ONLY needed to install PHPUnit for the test suite.
# The production artifact contains no PHP vendor dependencies whatsoever.
COMPOSER_PHAR="${BUILD_TOOLS_DIR}/composer.phar"

if [[ -f "$COMPOSER_PHAR" ]]; then
    _CV="$("${PHP[@]}" "$COMPOSER_PHAR" --version --no-ansi 2>/dev/null | head -1 || true)"
    success "Composer cached: ${_CV}"
else
    info "Downloading Composer PHAR…"
    curl -sfL "https://getcomposer.org/download/latest-stable/composer.phar" \
        -o "$COMPOSER_PHAR" \
        || die "Failed to download Composer. Check your internet connection."
    chmod +x "$COMPOSER_PHAR"
    _CV="$("${PHP[@]}" "$COMPOSER_PHAR" --version --no-ansi 2>/dev/null | head -1 || true)"
    success "Composer ready: ${_CV}"
fi

# =============================================================================
# Step 1 — Check Node.js
# =============================================================================
step "Checking Node.js prerequisites"

command -v node &>/dev/null \
    || die "'node' not found. Install Node.js ≥ 18 from https://nodejs.org"
command -v npm &>/dev/null \
    || die "'npm' not found"

NODE_MIN=18
NODE_VER="$(node -e 'process.stdout.write(process.versions.node)')"
NODE_MAJOR="${NODE_VER%%.*}"
(( NODE_MAJOR >= NODE_MIN )) \
    || die "Node.js ${NODE_MIN}+ required (found ${NODE_VER})"

success "node ${NODE_VER}"

# =============================================================================
# Step 2 — Install dependencies
# =============================================================================
step "Installing Node.js dependencies"
npm ci --prefer-offline 2>&1 | tail -5
success "npm ci done"

step "Installing Composer dev dependencies (PHPUnit)"
"${PHP[@]}" "$COMPOSER_PHAR" install \
    --working-dir="$ROOT_DIR" \
    --prefer-dist \
    --quiet
success "composer install done (vendor/ — dev only, not deployed)"

# =============================================================================
# Step 3 — Type-check (JS/TS)
# =============================================================================
step "Running svelte-check (TypeScript / Svelte)"
npm --prefix "$ROOT_DIR" run check \
    || die "svelte-check reported errors — aborting build"
success "svelte-check passed"

# =============================================================================
# Step 4 — JS / TS tests (Vitest)
# =============================================================================
if [[ "$SKIP_TESTS" == false ]]; then
    step "Running Vitest (frontend unit tests)"
    npm --prefix "$ROOT_DIR" run test \
        || die "Vitest tests failed — aborting build"
    success "Vitest tests passed"
else
    warn "Skipping JS/TS tests (--skip-tests)"
fi

# =============================================================================
# Step 5 — PHP tests (PHPUnit)
# =============================================================================
if [[ "$SKIP_TESTS" == false ]]; then
    step "Running PHPUnit (backend tests)"
    "${PHP[@]}" "${ROOT_DIR}/vendor/bin/phpunit" \
        --configuration "${ROOT_DIR}/phpunit.xml" \
        --no-coverage \
        || die "PHPUnit tests failed — aborting build"
    success "PHPUnit tests passed"
else
    warn "Skipping PHP tests (--skip-tests)"
fi

# =============================================================================
# Step 6 — SvelteKit frontend build
# =============================================================================
step "Building SvelteKit frontend (NODE_ENV=${ENV})"
NODE_ENV="$ENV" npm --prefix "$ROOT_DIR" run build \
    || die "vite build failed — see output above"
success "Frontend build completed"

# =============================================================================
# Step 7 — Assemble the deployment artifact
# =============================================================================
step "Assembling deployment artifact → ${STAGE_DIR}"

[[ "$CLEAN" == true ]] && rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

# SvelteKit compiled output — FLATTENED to the artifact root.
# adapter-static writes to build/; copying its contents (not the directory
# itself) places index.html, _app/, locales/, rules/ … directly at the
# artifact root so Apache/nginx can serve them without any sub-path rewriting.
if [[ -d "${ROOT_DIR}/build" ]]; then
    cp -r "${ROOT_DIR}/build/." "${STAGE_DIR}/"
else
    die "SvelteKit build output not found at '${ROOT_DIR}/build/'.  Run 'npm run build' first."
fi

# PHP backend — no vendor/ directory needed; zero production dependencies
cp -r "${ROOT_DIR}/api"    "${STAGE_DIR}/api"

# Static assets (game-rule JSON files, robots.txt …) — kept separately for
# the PHP API (RulesController reads from ../static/rules/ relative to api/).
cp -r "${ROOT_DIR}/static" "${STAGE_DIR}/static"

# Version tag
echo "$TAG" > "${STAGE_DIR}/VERSION"

# =============================================================================
# Step 8 — Generate server configuration files
# =============================================================================
step "Generating Apache .htaccess and nginx.conf.example"

cat > "${STAGE_DIR}/.htaccess" <<'HTACCESS'
# Character Vault — Apache routing
# ─────────────────────────────────────────────────────────────────────────────
# Extract this artifact into any Apache document root and browse to it —
# no other configuration is required as long as AllowOverride All is set
# (the default on most shared hosts: OVH, cPanel, Plesk, etc.).
#
# REQUIREMENTS:
#   PHP ≥ 8.1 with pdo_sqlite  (standard on all shared hosting)
#   Apache mod_rewrite          (enabled by default)
#   AllowOverride All           (set in the VirtualHost or .htaccess parent)
#
# FIRST RUN:
#   The database (database.sqlite) is created automatically on the first
#   API request — no manual migration step is needed.
#
# PRODUCTION — move the database outside the web root to prevent download:
#   SetEnv DB_PATH /home/yourlogin/private/cvault.sqlite
#   SetEnv APP_ENV production

Options -Indexes

# ── Security headers ──────────────────────────────────────────────────────────
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options  "nosniff"
    Header always set X-Frame-Options         "SAMEORIGIN"
    Header always set X-XSS-Protection        "1; mode=block"
    Header always set Referrer-Policy         "strict-origin-when-cross-origin"
</IfModule>

<IfModule mod_rewrite.c>
    RewriteEngine On

    # ── Deny access to sensitive runtime files ────────────────────────────────
    # Dotfiles (.htaccess, .env, .git, …) — config and secret files
    RewriteRule (^|/)\. - [F,L]
    # SQLite database — prevent direct download of user data
    RewriteRule \.sqlite3?$ - [F,L]
    # storage/ — runtime-writable GM rules directory (PHP-only access)
    RewriteRule ^storage/ - [F,L]

    # ── Routing ───────────────────────────────────────────────────────────────
    # /api/* → PHP front-controller (auto-migrates DB on first request)
    RewriteRule ^api/(.*)$ api/index.php [QSA,L]

    # Serve existing static files and directories as-is (_app/, locales/, rules/, …)
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    # Everything else → SvelteKit SPA entry point
    RewriteRule ^(.*)$ index.html [QSA,L]
</IfModule>
HTACCESS

cat > "${STAGE_DIR}/nginx.conf.example" <<'NGINX'
# Character Vault — example nginx + php-fpm configuration
# ─────────────────────────────────────────────────────────────────────────────
# 1. Copy this file to /etc/nginx/sites-available/character-vault
# 2. Symlink: ln -s /etc/nginx/sites-available/character-vault /etc/nginx/sites-enabled/
# 3. Adjust root, server_name and fastcgi_pass below, then: nginx -s reload

server {
    listen 80;
    server_name example.com www.example.com;

    # Point root to the extracted artifact directory
    root /var/www/character-vault;
    index index.html;

    # PHP-FPM socket — adjust to match your system
    # Common paths:
    #   Debian/Ubuntu 8.3:  unix:/run/php/php8.3-fpm.sock
    #   CentOS/RHEL:        unix:/var/run/php-fpm/php-fpm.sock
    #   TCP:                127.0.0.1:9000
    set $phpfpm unix:/run/php/php8.3-fpm.sock;

    # Security headers
    add_header X-Content-Type-Options  "nosniff"                        always;
    add_header X-Frame-Options         "SAMEORIGIN"                     always;
    add_header X-XSS-Protection        "1; mode=block"                  always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin" always;

    # Deny access to dotfiles (.env, .htaccess, .git, …)
    location ~ /\. {
        deny all;
    }

    # Deny direct access to SQLite database files
    location ~* \.sqlite3?$ {
        deny all;
    }

    # Deny direct access to the storage/ directory (GM rule files — PHP-only)
    location /storage/ {
        deny all;
    }

    # Long-lived cache for versioned SvelteKit assets
    location ~* ^/_app/immutable/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # PHP API — route all /api/ requests through the PHP front-controller
    location /api/ {
        try_files $uri @php_api;
    }
    location @php_api {
        fastcgi_pass   $phpfpm;
        fastcgi_index  index.php;
        fastcgi_param  SCRIPT_FILENAME $document_root/api/index.php;
        include        fastcgi_params;

        # Optional: move the DB outside the web root for production
        # fastcgi_param  DB_PATH /home/user/private/cvault.sqlite;
        # fastcgi_param  APP_ENV production;
    }

    # SPA fallback — serve index.html for all client-side routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

success "Server config files generated (.htaccess, nginx.conf.example)"

# =============================================================================
# Step 9 — Create tarball
# =============================================================================
step "Creating tarball → ${TARBALL}"
mkdir -p "$OUTPUT_DIR"
tar -czf "$TARBALL" -C "$DEPLOY_DIR" "$PACKAGE_NAME"
TARBALL_SIZE="$(du -sh "$TARBALL" | cut -f1)"
success "Tarball ready: ${TARBALL}  (${TARBALL_SIZE})"

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Build complete!${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "  Tarball    : ${BOLD}${TARBALL}${RESET}  (${TARBALL_SIZE})"
echo -e "  Extracted  : ${BOLD}${STAGE_DIR}${RESET}"
echo ""
echo -e "  ${BOLD}Production deployment${RESET} (shared hosting, OVH, etc.):"
echo -e "    1. Upload  ${BOLD}${PACKAGE_NAME}.tar.gz${RESET}  to the server"
echo -e "    2. tar -xzf ${PACKAGE_NAME}.tar.gz"
echo -e "    3. Point web document root at the extracted directory"
echo -e "    4. Browse to the site — database is created automatically on first request"
echo -e "    ${CYAN}→ No Composer, no Node.js, no npm, no manual migration needed on the server.${RESET}"
echo -e "    ${CYAN}→ Only PHP ≥ 8.1 with pdo_sqlite (standard on all shared hosts).${RESET}"
echo -e "    ${CYAN}→ Optionally add .env next to index.html for APP_ENV=production + custom DB_PATH.${RESET}"
echo ""
echo -e "  ${BOLD}Local test run${RESET}:"
echo -e "    ./run.sh          # PHP built-in server on http://localhost:8080"
echo -e "    ./run-docker.sh   # Docker (Apache + PHP) on http://localhost:8080"
echo ""
