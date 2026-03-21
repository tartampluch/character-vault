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

# Copy the SvelteKit build output from the node-build stage
# adapter-auto → build/ when deploying to Node; or .svelte-kit/output for SSR
COPY --from=node-build /app/build            ./character-vault/build/
COPY --from=node-build /app/static           ./character-vault/static/

# Copy the PHP backend only — no vendor/, no composer.json.
# The backend has zero production dependencies; Composer is used only during
# the build for PHPUnit. Including composer.json in the artifact would mislead
# server administrators into running `composer install` on the production host,
# which is explicitly not required (and not supported by this deployment model).
COPY --from=php-test  /app/api              ./character-vault/api/

# Generate the Apache .htaccess routing file
RUN cat > ./character-vault/.htaccess <<'HTACCESS'
# Character Vault — Apache routing
Options -Indexes

<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^api/(.*)$ api/index.php [QSA,L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ build/index.html [QSA,L]
</IfModule>
HTACCESS

# Write version file
RUN echo "${APP_VERSION}" > ./character-vault/VERSION

# Create the tarball
RUN tar -czf "character-vault-${APP_VERSION}.tar.gz" character-vault/ \
    && echo "Package: character-vault-${APP_VERSION}.tar.gz ($(du -sh character-vault-${APP_VERSION}.tar.gz | cut -f1))"

# Default entrypoint copies the artefact to /out (mapped by docker compose)
CMD ["sh", "-c", "cp /export/character-vault-*.tar.gz /out/ && echo 'Artefact exported to /out/'"]
