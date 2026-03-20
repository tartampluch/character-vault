#!/usr/bin/env bash
# =============================================================================
# scripts/build-docker.sh — Build Character Vault inside Docker
#
# Builds the Docker image (all stages: type-check → test → build → package)
# and exports the deployment tarball to the host.  No Node.js, PHP or Composer
# installation is required on the host — everything runs inside Docker.
#
# USAGE:
#   ./scripts/build-docker.sh [OPTIONS]
#
# OPTIONS:
#   -t, --tag <tag>        App version tag (default: git describe or timestamp)
#   -o, --output <dir>     Host output directory (default: ./dist-pkg)
#   --no-cache             Disable Docker layer cache (full rebuild)
#   --push                 Push the builder image to a registry after build
#   --registry <url>       Registry URL used with --push (default: docker.io)
#   -h, --help             Show this help and exit
#
# PREREQUISITES:
#   - Docker Engine ≥ 24 with BuildKit enabled (default since Docker 23)
#   - docker compose v2  (bundled with Docker Desktop / docker-compose-plugin)
#
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

# ── Defaults ──────────────────────────────────────────────────────────────────
OUTPUT_DIR="${ROOT_DIR}/dist-pkg"
NO_CACHE=""
PUSH=false
REGISTRY="docker.io"
IMAGE_NAME="character-vault-builder"

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
        -t|--tag)       TAG="$2";        shift 2 ;;
        -o|--output)    OUTPUT_DIR="$2"; shift 2 ;;
        --no-cache)     NO_CACHE="--no-cache"; shift ;;
        --push)         PUSH=true;       shift ;;
        --registry)     REGISTRY="$2";   shift 2 ;;
        -h|--help)      usage ;;
        *) die "Unknown option: $1  (use --help for usage)" ;;
    esac
done

TARBALL="${OUTPUT_DIR}/character-vault-${TAG}.tar.gz"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Character Vault — Docker Build & Package${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
info "Root dir  : ${ROOT_DIR}"
info "Tag       : ${TAG}"
info "Output    : ${TARBALL}"
info "No-cache  : ${NO_CACHE:-(using cache)}"

# ── Prerequisite checks ───────────────────────────────────────────────────────
step "Checking prerequisites"

command -v docker &>/dev/null \
    || die "'docker' not found. Install Docker Engine from https://docs.docker.com/get-docker/"

DOCKER_VER="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'unknown')"
success "docker ${DOCKER_VER}"

# Prefer 'docker compose' (v2 plugin) over the standalone 'docker-compose' (v1)
if docker compose version &>/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE="docker-compose"
    warn "Using legacy docker-compose v1 — upgrade to docker compose v2 recommended"
else
    die "'docker compose' not found. Install the Docker Compose plugin: https://docs.docker.com/compose/install/"
fi
success "${COMPOSE} $(${COMPOSE} version --short 2>/dev/null || true)"

# ── Ensure output directory exists ────────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"

# ── Build via docker compose ──────────────────────────────────────────────────
step "Building Docker image (all stages)"

cd "$ROOT_DIR"

# Export variables read by docker-compose.yml
export APP_VERSION="${TAG}"
export OUTPUT_DIR="${OUTPUT_DIR}"

# Build the image (includes type-check, test, vite build, PHPUnit, packaging)
${COMPOSE} build ${NO_CACHE} builder

# ── Run the container to export the artefact ──────────────────────────────────
step "Exporting artefact → ${OUTPUT_DIR}"

${COMPOSE} run --rm builder

# ── Verify the artefact ───────────────────────────────────────────────────────
step "Verifying artefact"

if [[ -f "$TARBALL" ]]; then
    TARBALL_SIZE="$(du -sh "$TARBALL" | cut -f1)"
    success "Artefact found: ${TARBALL}  (${TARBALL_SIZE})"
    info "Contents:"
    tar -tzf "$TARBALL" | head -30
else
    die "Expected artefact not found: ${TARBALL}"
fi

# ── Optional: push the builder image ─────────────────────────────────────────
if [[ "$PUSH" == true ]]; then
    step "Pushing image to ${REGISTRY}"
    FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
    docker tag "${IMAGE_NAME}:latest" "$FULL_IMAGE" 2>/dev/null || true
    docker push "$FULL_IMAGE"
    success "Image pushed: ${FULL_IMAGE}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Docker build complete!${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════${RESET}"
echo -e "  Artefact : ${BOLD}${TARBALL}${RESET}"
echo -e "  Size     : ${TARBALL_SIZE}"
echo ""
echo -e "  Deploy steps:"
echo -e "    1. Upload  ${BOLD}character-vault-${TAG}.tar.gz${RESET}  to the server"
echo -e "    2. tar -xzf character-vault-${TAG}.tar.gz"
echo -e "    3. cd character-vault && composer install --no-dev --optimize-autoloader"
echo -e "    4. Set environment variables (DB_HOST, DB_NAME, DB_USER, DB_PASS, JWT_SECRET)"
echo -e "    5. Point web root at the extracted directory"
echo ""
