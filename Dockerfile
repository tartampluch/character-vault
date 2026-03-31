# =============================================================================
# Dockerfile — Character Vault multi-stage build
#
# STAGES:
#   1. node-deps      Install Node.js dependencies (cached layer)
#   2. node-check     Type-check with svelte-check
#   3. node-test      Run Vitest unit tests
#   4. node-build     Build the SvelteKit frontend (vite build)
#   5. php-deps       Install Composer dependencies
#   6. php-test       Run PHPUnit test suite
#   7. artifact       Assemble the final deployment package + tarball
#
# BUILD:
#   docker build --target artifact -o dist-pkg .
#   # or via docker-compose:
#   docker compose run --rm builder
#
# OUTPUT:
#   The final stage exports (via BuildKit --output) a tarball:
#     dist-pkg/character-vault-<GIT_TAG>.tar.gz
#
# BUILD ARGS:
#   NODE_VERSION   (default: 22-alpine)
#   PHP_VERSION    (default: 8.3-cli-alpine)
#   APP_VERSION    (default: dev — override with git tag at build time)
# =============================================================================

ARG NODE_VERSION=22-alpine
ARG PHP_VERSION=8.3-cli-alpine

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — node-deps : install Node.js dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS node-deps

WORKDIR /app

# Copy only the lockfiles first for better layer caching
COPY package.json package-lock.json .npmrc ./

RUN npm ci --prefer-offline


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — node-check : svelte-check (TypeScript + Svelte type checking)
# ─────────────────────────────────────────────────────────────────────────────
FROM node-deps AS node-check

# Copy complete source required for svelte-check
COPY svelte.config.js tsconfig.json vite.config.ts ./
COPY src/ ./src/

RUN npm run check


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — node-test : Vitest unit tests
# ─────────────────────────────────────────────────────────────────────────────
FROM node-check AS node-test

# static/ needed by some tests that load JSON rule files
COPY static/ ./static/

RUN npm run test


# ─────────────────────────────────────────────────────────────────────────────
# Stage 4 — node-build : vite build (SvelteKit frontend)
# ─────────────────────────────────────────────────────────────────────────────
FROM node-test AS node-build

# Nothing new to copy — all sources already present from node-test
RUN NODE_ENV=production npm run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 5 — php-deps : install Composer dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM php:${PHP_VERSION} AS php-deps

# Install system deps needed by Composer and common PHP extensions
RUN apk add --no-cache \
        git \
        unzip \
        curl \
    && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

WORKDIR /app

COPY composer.json ./
# composer.lock is optional — if absent Composer resolves from composer.json
COPY composer.loc[k] ./

RUN composer install \
        --no-interaction \
        --prefer-dist \
        --optimize-autoloader


# ─────────────────────────────────────────────────────────────────────────────
# Stage 6 — php-test : run PHPUnit test suite
# ─────────────────────────────────────────────────────────────────────────────
FROM php-deps AS php-test

# Install the SQLite3 extension used by test fixtures
RUN apk add --no-cache sqlite-dev \
    && docker-php-ext-install pdo pdo_sqlite

COPY phpunit.xml ./
COPY api/        ./api/
COPY tests/      ./tests/

RUN php vendor/bin/phpunit \
        --configuration phpunit.xml \
        --no-coverage


# ─────────────────────────────────────────────────────────────────────────────
# Stage 7 — artifact : assemble deployment package
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.20 AS artifact

ARG APP_VERSION=dev

WORKDIR /export

# Copy the SvelteKit build output FLATTENED to the artifact root.
# adapter-static writes to build/; copying its contents (not the directory
# itself) places index.html, _app/, locales/, rules/ … at the artifact root
# so the web server can serve them directly without any sub-path rewriting.
COPY --from=node-build /app/build/           ./character-vault/

# Copy the static/ source directory (rules JSON, etc.) — needed by the PHP
# API's RulesController which reads from api/../../static/rules/.
COPY --from=node-build /app/static           ./character-vault/static/

# Copy the PHP backend only — no vendor/, no composer.json.
# The backend has zero production dependencies; Composer is used only during
# the build for PHPUnit. Including composer.json in the artifact would mislead
# server administrators into running `composer install` on the production host,
# which is explicitly not required (and not supported by this deployment model).
COPY --from=php-test  /app/api              ./character-vault/api/

# Generate the Apache .htaccess routing file.
# The SPA shell (index.html) is now at the artifact root, so the fallback
# rule points to index.html directly (not build/index.html).
RUN cat > ./character-vault/.htaccess <<'HTACCESS'
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

# Generate an example nginx configuration.
RUN cat > ./character-vault/nginx.conf.example <<'NGINX'
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

# Write version file
RUN echo "${APP_VERSION}" > ./character-vault/VERSION

# Create the tarball
RUN tar -czf "character-vault-${APP_VERSION}.tar.gz" character-vault/ \
    && echo "Package: character-vault-${APP_VERSION}.tar.gz ($(du -sh character-vault-${APP_VERSION}.tar.gz | cut -f1))"

# Default entrypoint copies the artefact to /out (mapped by docker compose)
CMD ["sh", "-c", "cp /export/character-vault-*.tar.gz /out/ && echo 'Artefact exported to /out/'"]
