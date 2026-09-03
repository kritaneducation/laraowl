#!/bin/bash
# ============================================================================
# Production deploy — receive the CI build, wire it up, go live.
#
# This mirrors the step order of `php artisan laraowl:update`, minus the three
# compile steps. vendor/ and public/build/ are pre-shipped from CI, so the
# `composer install` below only re-dumps the autoloader and runs
# package:discover — no downloads, no npm, no Vite on this machine.
#
# Usage: ./deploy.sh [--ci] [--skip-git] [--skip-migrations] [--skip-backfill]
# ============================================================================

set -euo pipefail

SKIP_GIT=false
SKIP_MIGRATIONS=false
SKIP_BACKFILL=false
for arg in "$@"; do
    case $arg in
        --skip-git)        SKIP_GIT=true ;;
        --skip-migrations) SKIP_MIGRATIONS=true ;;
        --skip-backfill)   SKIP_BACKFILL=true ;;
        --ci)              ;;
        *)                 echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$APP_ROOT"

if [ ! -f artisan ] || [ ! -f .env ]; then
    echo "Deployment aborted: artisan or the production .env file is missing." >&2
    exit 1
fi

if [ ! -f public/build/manifest.json ]; then
    echo "Deployment aborted: public/build/manifest.json is missing, so the CI assets did not arrive." >&2
    exit 1
fi

if [ ! -d vendor ]; then
    echo "Deployment aborted: vendor/ is missing, so the CI dependencies did not arrive." >&2
    exit 1
fi

restore_application() {
    php artisan up >/dev/null 2>&1 || true
}

trap restore_application EXIT

echo "━━━ Preparing ━━━"
mkdir -p storage/framework/{cache,sessions,views,testing} storage/logs bootstrap/cache
rm -f bootstrap/cache/*.php
chmod -R 775 storage bootstrap/cache || true

echo "━━━ Maintenance mode ━━━"
php artisan down --retry=15 || true

echo "━━━ Draining queued work ━━━"
php artisan queue:restart || true
php artisan queue:work --stop-when-empty --max-time=300 --tries=3 --timeout=120 || true

if [ "$SKIP_GIT" = false ]; then
    echo "━━━ Pulling ━━━"
    git pull --ff-only
fi

echo "━━━ Installing PHP deps ━━━"
composer install --no-dev --optimize-autoloader --no-interaction --no-progress

if [ "$SKIP_MIGRATIONS" = false ]; then
    echo "━━━ Migrating ━━━"
    php artisan migrate --force
fi

if [ "$SKIP_BACKFILL" = false ]; then
    echo "━━━ Backfilling dashboard rollups ━━━"
    php artisan laraowl:rollups:backfill --missing --no-interaction
fi

echo "━━━ Caching ━━━"
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

echo "━━━ Finishing ━━━"
php artisan storage:link || true
php artisan queue:restart || true
# Reverb holds the old code in memory until its workers are cycled.
php artisan reverb:restart || true
php artisan up
trap - EXIT

# Laravel's health endpoint, registered as `health: '/up'` in bootstrap/app.php.
if [ -n "${DEPLOY_HEALTHCHECK_URL:-}" ]; then
    echo "━━━ Probing $DEPLOY_HEALTHCHECK_URL ━━━"
    curl --fail --silent --show-error --max-time 15 "$DEPLOY_HEALTHCHECK_URL" >/dev/null
fi

echo "✓ Deployed"
