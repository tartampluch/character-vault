#!/usr/bin/env bash
# =============================================================================
# scripts/php-dev.sh — PHP wrapper for development and VS Code launch configs
#
# USAGE:
#   scripts/php-dev.sh [PHP_ARGUMENTS...]
#
# DESCRIPTION:
#   Resolves the best available PHP binary and forwards all arguments to it.
#
#   Resolution order for Xdebug-capable sessions (when XDEBUG_MODE is set):
#     1. PHP binary explicitly set in CHAR_VAULT_PHP env var
#     2. System PHP if it has the Xdebug extension loaded
#     3. Any PHP ≥ 8.1 found on PATH
#
#   Resolution order for plain execution (builds, tests, server):
#     1. PHP binary explicitly set in CHAR_VAULT_PHP env var
#     2. .build-tools/bin/php (cached portable PHP)
#     3. System PHP ≥ 8.1
#
#   WHY A WRAPPER?
#     - VS Code launch.json uses a fixed "runtimeExecutable" path.
#       This script ensures the correct PHP is used without hardcoding any path.
#     - The portable static PHP binary cached in .build-tools/ does NOT include
#       Xdebug (Zend extensions cannot be statically compiled). For debugging,
#       a system PHP with Xdebug installed is required.
#     - When no Xdebug-capable PHP is found, the script falls back gracefully
#       and prints a clear message.
#
# ENVIRONMENT VARIABLES:
#   CHAR_VAULT_PHP   Override all detection — use this exact PHP binary.
#                    Example: CHAR_VAULT_PHP=/opt/homebrew/bin/php ./scripts/php-dev.sh …
#   XDEBUG_MODE      When set, triggers Xdebug-aware resolution (prefers system PHP).
#   XDEBUG_CONFIG    Standard Xdebug environment variable (passed through as-is).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PORTABLE_PHP="${ROOT_DIR}/.build-tools/bin/php"

_php_ver_ok() {
    local bin="$1"
    [[ -x "$bin" ]] \
        && "$bin" -r "exit(version_compare(PHP_VERSION,'8.1','>=') ? 0 : 1);" 2>/dev/null
}

_has_xdebug() {
    local bin="$1"
    [[ -x "$bin" ]] \
        && "$bin" -r 'exit(extension_loaded("xdebug") ? 0 : 1);' 2>/dev/null
}

# ── Explicit override ─────────────────────────────────────────────────────────
if [[ -n "${CHAR_VAULT_PHP:-}" ]]; then
    exec "${CHAR_VAULT_PHP}" "$@"
fi

# ── Xdebug-aware resolution ───────────────────────────────────────────────────
if [[ -n "${XDEBUG_MODE:-}" ]]; then
    # 1. Try each PHP on PATH and pick the first one with Xdebug
    while IFS= read -r candidate; do
        if _php_ver_ok "$candidate" && _has_xdebug "$candidate"; then
            exec "$candidate" "$@"
        fi
    done < <(command -v php php8.3 php8.2 php8.1 2>/dev/null || true)

    # 2. No Xdebug found — warn but fall through so the server still starts
    echo "[php-dev] WARNING: Xdebug not found on any system PHP." >&2
    echo "[php-dev] Breakpoints will not work. Install Xdebug:" >&2
    echo "[php-dev]   macOS:  pecl install xdebug  (after: brew install php)" >&2
    echo "[php-dev]   Linux:  apt install php-xdebug" >&2
    echo "[php-dev] Set CHAR_VAULT_PHP to override the binary used." >&2
fi

# ── Normal resolution (no Xdebug requirement) ─────────────────────────────────
# 1. Portable PHP cached by build.sh
if _php_ver_ok "$PORTABLE_PHP"; then
    exec "$PORTABLE_PHP" "$@"
fi

# 2. System PHP
SYSTEM_PHP="$(command -v php 2>/dev/null || true)"
if _php_ver_ok "$SYSTEM_PHP"; then
    exec "$SYSTEM_PHP" "$@"
fi

echo "[php-dev] ERROR: No PHP 8.1+ found." >&2
echo "[php-dev] Run ./scripts/build.sh once to download a portable PHP binary." >&2
echo "[php-dev] Or install PHP: brew install php / apt install php8.3-cli" >&2
exit 1
