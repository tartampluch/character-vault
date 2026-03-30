<?php
/**
 * @file api/migrate.php
 * @description Database schema creation and migration script.
 *
 * PURPOSE:
 *   Creates the initial database schema (tables, indexes).
 *   Safe to run multiple times — uses `CREATE TABLE IF NOT EXISTS`.
 *
 * USAGE:
 *   CLI: php api/migrate.php
 *   PHPUnit: Database::runMigrations($pdo)
 *
 * TABLES:
 *   - users           (id, username, password_hash, display_name, is_game_master,
 *                      role, is_suspended, last_login_at, created_at)
 *   - campaigns       (id, title_json, description_json, banner_image_data, owner_id,
 *                      chapters_json, enabled_rule_sources_json,
 *                      homebrew_rules_json, campaign_settings_json, updated_at)
 *   - characters      (id, campaign_id, owner_id, name, is_npc, character_json,
 *                      gm_overrides_json, updated_at)
 *   - campaign_users  (campaign_id, user_id, joined_at)
 *   - server_settings (key, value)
 *
 * DESIGN NOTES:
 *
 *   title_json / description_json:
 *     Both columns store LocalizedString JSON objects (`{"en":"…","fr":"…"}`).
 *     Named with the `_json` suffix to make the encoding explicit and to
 *     prevent callers from treating them as plain strings.
 *
 *   banner_image_data:
 *     A base64-encoded data URI (`data:image/<subtype>;base64,…`) stored directly
 *     in the database — no separate file server required.
 *     Excluded from the GET /api/campaigns list response because 5 MiB × N campaigns
 *     would be prohibitively large.  Only the GET /api/campaigns/{id} show endpoint
 *     returns it.  The frontend caches it in sessionStorage (bannerCache.ts).
 *
 *   poster_url REMOVED:
 *     The legacy `poster_url` column (an HTTP URL to a thumbnail image) has been
 *     removed.  The banner (bannerImageData) is the sole campaign image.
 *     Campaign list cards lazy-load the banner from the show endpoint instead.
 *
 *   gm_global_overrides_text REMOVED from campaigns:
 *     GM global overrides apply to ALL campaigns server-wide — storing them on
 *     individual campaign rows was a design error.  They now live in the
 *     `server_settings` table under the key `'gm_global_overrides'`.
 *     See ServerSettingsController.php for GET/PUT endpoints.
 *
 *   server_settings:
 *     A general-purpose key-value store for server-wide configuration.
 *     Current keys:
 *       'gm_global_overrides' — JSON array of Feature/config-table objects that
 *         the GM applies as "Layer 2" of the DataLoader resolution chain
 *         (above all rule files, below per-character gmOverrides).
 *
 *   WHY SEPARATE characters.character_json AND characters.gm_overrides_json?
 *     `character_json` is the player's data; `gm_overrides_json` is the GM's
 *     secret per-character layer.  Keeping them separate makes visibility rules
 *     trivial to enforce at the query level.
 *
 * @see api/Database.php for the PDO connection.
 * @see api/controllers/ServerSettingsController.php for global GM overrides API.
 * @see ARCHITECTURE.md Phase 14.4 for the full schema specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Logger.php';

/**
 * Runs the full database migration: creates all tables if they don't exist.
 * Safe to run multiple times (idempotent).
 *
 * @param PDO|null $pdo - PDO connection to use. If null, uses Database::getInstance().
 */
function migrate(?PDO $pdo = null): void
{
    if ($pdo === null) {
        require_once __DIR__ . '/Database.php';
        $pdo = Database::getInstance();
    }

    // ============================================================
    // USERS TABLE
    // ============================================================
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS users (
            id             TEXT PRIMARY KEY,
            username       TEXT NOT NULL UNIQUE,
            password_hash  TEXT NOT NULL,
            display_name   TEXT NOT NULL,
            is_game_master INTEGER NOT NULL DEFAULT 0,
            created_at     INTEGER NOT NULL DEFAULT (strftime(\'%s\', \'now\'))
        )
    ');

    // ============================================================
    // ADDITIVE MIGRATIONS — users table
    // ============================================================
    //
    // WHY ADDITIVE MIGRATIONS?
    //   Production databases already have the users table with only
    //   the original columns. ALTER TABLE adds missing columns without
    //   losing existing data. Each block is guarded by PRAGMA table_info
    //   to remain fully idempotent (safe to run multiple times).
    //
    $userCols = array_column(
        $pdo->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_ASSOC),
        'name'
    );

    // Phase 22.1 — role column
    //   Replaces `is_game_master` as the canonical source of truth for permissions.
    //   Values:
    //     'admin'  — can manage all users AND has full GM capabilities.
    //     'gm'     — Game Master; can manage campaigns, characters, overrides.
    //     'player' — Regular player; can only access their own characters.
    //
    //   BACKFILL: existing rows with is_game_master = 1 are promoted to 'gm'
    //   (not 'admin' — the admin role requires an explicit promotion).
    //   The `is_game_master` column is kept for backward compatibility; all new
    //   code derives GM status from `role IN ('gm', 'admin')` instead.
    if (!in_array('role', $userCols, true)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
        // Backfill: rows with is_game_master=1 had GM privileges before roles existed.
        // Map them to 'gm' (not 'admin' — admin is a new, more privileged role).
        $pdo->exec("UPDATE users SET role = 'gm' WHERE is_game_master = 1");
        Logger::info('Migrate', 'Added column users.role (backfilled from is_game_master)');
    }

    // Phase 22.1 — is_suspended column
    //   Accounts marked suspended cannot log in.
    if (!in_array('is_suspended', $userCols, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN is_suspended INTEGER NOT NULL DEFAULT 0');
        Logger::info('Migrate', 'Added column users.is_suspended');
    }

    // Phase 22.1 — last_login_at column
    //   Unix timestamp of the user's most recent successful login.
    //   NULL means the user has never logged in (password not yet set).
    if (!in_array('last_login_at', $userCols, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN last_login_at INTEGER');
        Logger::info('Migrate', 'Added column users.last_login_at');
    }

    // ============================================================
    // CAMPAIGNS TABLE
    // ============================================================
    //
    // COLUMN NAMING CONVENTION:
    //   title_json       — LocalizedString JSON object (`{"en":"…","fr":"…"}`).
    //                      Named `_json` to make the encoding unambiguous.
    //   description_json — Same as title_json.
    //   banner_image_data — Base64 data URI. Excluded from list responses.
    //
    // REMOVED COLUMNS (compared to original Phase 14.4 spec):
    //   poster_url           — Replaced by banner_image_data. Campaign cards lazy-load
    //                          the banner from the show endpoint instead.
    //   gm_global_overrides_text — Moved to server_settings table (key = 'gm_global_overrides').
    //                              GM overrides are server-wide, not per-campaign.
    //
    // homebrew_rules_json (Phase 21.1.1):
    //   Stores the campaign-scoped homebrew entity array as a JSON TEXT column.
    //   Default is an empty JSON array '[]'.
    //   SCOPE: per-campaign (vs. global overrides in server_settings).
    //   VISIBILITY: Readable by all authenticated users in the campaign (GM + players).
    //   WRITEABLE: GM only — PUT /api/campaigns/{id}/homebrew-rules.
    //
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS campaigns (
            id                           TEXT PRIMARY KEY,
            title_json                   TEXT NOT NULL DEFAULT \'{"en":""}\',
            description_json             TEXT NOT NULL DEFAULT \'\',
            banner_image_data            TEXT,
            owner_id                     TEXT NOT NULL,
            chapters_json                TEXT NOT NULL DEFAULT \'[]\',
            enabled_rule_sources_json    TEXT NOT NULL DEFAULT \'[]\',
            homebrew_rules_json          TEXT NOT NULL DEFAULT \'[]\',
            campaign_settings_json       TEXT NOT NULL DEFAULT \'{}\',
            updated_at                   INTEGER NOT NULL DEFAULT (strftime(\'%s\', \'now\')),
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ');

    // ============================================================
    // ADDITIVE MIGRATIONS — campaigns table
    // ============================================================
    //
    // WHY PRAGMA table_info() INSTEAD OF try/catch?
    //   ALTER TABLE ADD COLUMN fails if the column already exists. The error
    //   message differs by database driver. Checking PRAGMA table_info() first
    //   is truly idempotent and driver-agnostic.
    //
    $campaignCols = array_column(
        $pdo->query('PRAGMA table_info(campaigns)')->fetchAll(PDO::FETCH_ASSOC),
        'name'
    );

    // Phase 21.1.1 — homebrew_rules_json
    // Stores campaign-scoped homebrew entity array as JSON.
    if (!in_array('homebrew_rules_json', $campaignCols, true)) {
        $pdo->exec("ALTER TABLE campaigns ADD COLUMN homebrew_rules_json TEXT NOT NULL DEFAULT '[]'");
        Logger::info('Migrate', 'Added column campaigns.homebrew_rules_json');
    }

    // campaign_settings_json — per-campaign rule settings (diceRules, statGeneration, variantRules).
    // Previously kept only in localStorage; this column persists them server-side.
    if (!in_array('campaign_settings_json', $campaignCols, true)) {
        $pdo->exec("ALTER TABLE campaigns ADD COLUMN campaign_settings_json TEXT NOT NULL DEFAULT '{}'");
        Logger::info('Migrate', 'Added column campaigns.campaign_settings_json');
    }

    // banner_image_data — base64 data URI for the campaign banner image.
    // Added as a migration for existing databases that only had poster_url.
    if (!in_array('banner_image_data', $campaignCols, true)) {
        $pdo->exec('ALTER TABLE campaigns ADD COLUMN banner_image_data TEXT');
        Logger::info('Migrate', 'Added column campaigns.banner_image_data');
    }

    // ============================================================
    // CHARACTERS TABLE
    // ============================================================
    //
    // DESIGN DECISION — character_json vs gm_overrides_json:
    //   `character_json` stores the entire ECS state (the "player-facing" data).
    //   `gm_overrides_json` stores the GM's per-character overrides (secret layer).
    //   Keeping them separate makes the visibility rule trivial to enforce
    //   at the query level, without complex JSON manipulation on every request.
    //
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS characters (
            id               TEXT PRIMARY KEY,
            campaign_id      TEXT,
            owner_id         TEXT NOT NULL,
            name             TEXT NOT NULL,
            is_npc           INTEGER NOT NULL DEFAULT 0,
            character_json   TEXT NOT NULL DEFAULT \'{}\',
            gm_overrides_json TEXT NOT NULL DEFAULT \'[]\',
            updated_at       INTEGER NOT NULL DEFAULT (strftime(\'%s\', \'now\')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ');

    // ============================================================
    // TEMPLATES TABLE
    // ============================================================
    //
    // PURPOSE:
    //   Stores reusable NPC and Monster templates that GMs can "spawn" into
    //   campaigns as character instances.  Templates are NOT tied to any campaign;
    //   they are server-wide resources owned by the GM who created them.
    //
    // DESIGN:
    //   - `type`: 'npc' | 'monster' — distinguishes NPC from Monster templates.
    //   - `template_json`: full Character-compatible ECS JSON blob (same schema as
    //     characters.character_json) — the engine processes templates identically
    //     to regular characters when the template is opened for editing.
    //   - No `campaign_id` column — templates are explicitly campaign-agnostic.
    //     Spawning copies template data into the `characters` table with a campaignId.
    //
    // VISIBILITY:
    //   Readable by GMs only. Players never interact with templates directly.
    //   When a GM spawns a template, the resulting character is visible to players
    //   (name only, no level, no sheet access).
    //
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS templates (
            id              TEXT PRIMARY KEY,
            type            TEXT NOT NULL,
            owner_id        TEXT NOT NULL,
            name            TEXT NOT NULL,
            template_json   TEXT NOT NULL DEFAULT \'{}\',
            updated_at      INTEGER NOT NULL DEFAULT (strftime(\'%s\', \'now\')),
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ');

    // ============================================================
    // ADDITIVE MIGRATIONS — characters table
    // ============================================================
    //
    // npc_type column: distinguishes NPC instances from Monster instances.
    //   Both have is_npc = 1, but npc_type clarifies the subtype:
    //     'npc'     — spawned from an NPC template; name = NPC name, playerName = GM name
    //     'monster' — spawned from a Monster template; name = instance name, playerName = species
    //   NULL       — regular player characters (is_npc = 0)
    //
    $charCols = array_column(
        $pdo->query('PRAGMA table_info(characters)')->fetchAll(PDO::FETCH_ASSOC),
        'name'
    );

    if (!in_array('npc_type', $charCols, true)) {
        $pdo->exec('ALTER TABLE characters ADD COLUMN npc_type TEXT');
        Logger::info('Migrate', 'Added column characters.npc_type');
    }

    // ============================================================
    // CAMPAIGN_USERS JOIN TABLE (Phase 22.1)
    // ============================================================
    //
    // PURPOSE:
    //   Tracks which users are members of which campaigns.
    //   Distinct from character ownership — a user can be a campaign member
    //   even if suspended (their characters may still be active).
    //
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS campaign_users (
            campaign_id TEXT    NOT NULL,
            user_id     TEXT    NOT NULL,
            joined_at   INTEGER NOT NULL DEFAULT (strftime(\'%s\', \'now\')),
            PRIMARY KEY (campaign_id, user_id),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE
        )
    ');

    // ============================================================
    // SERVER_SETTINGS TABLE
    // ============================================================
    //
    // PURPOSE:
    //   A general-purpose key-value store for server-wide configuration that
    //   does not belong to any specific campaign.
    //
    // CURRENT KEYS:
    //   'gm_global_overrides'
    //     A JSON array of Feature/config-table objects that the GM applies as
    //     "Layer 2" of the DataLoader resolution chain — above all rule source
    //     files, below per-character gmOverrides. Writable by GMs only via
    //     PUT /api/server-settings/gm-overrides.  Readable by all authenticated
    //     users so every client's DataLoader can include the overrides.
    //
    // WHY NOT IN campaigns TABLE?
    //   GM global overrides apply to ALL campaigns equally — there is a single
    //   server-wide set. Storing them per-campaign was a design error:
    //   each campaign would have needed its own copy, and changing the "global"
    //   overrides would have required updating every campaign row individually.
    //
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS server_settings (
            key    TEXT PRIMARY KEY,
            value  TEXT NOT NULL DEFAULT \'\'
        )
    ');

    // ============================================================
    // INDEXES (for common query patterns)
    // ============================================================
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_characters_campaign_id ON characters(campaign_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_characters_owner_id ON characters(owner_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_campaigns_owner_id ON campaigns(owner_id)');
    // Phase 22.1 — campaign_users lookup by user (to find all campaigns a user belongs to)
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_campaign_users_user_id ON campaign_users(user_id)');

    // ============================================================
    // ADMIN BOOTSTRAP (Phase 22.1)
    // ============================================================
    //
    // On the very first run of a fresh installation the `users` table will be
    // empty after all migrations complete. We seed a default `admin` account so
    // the application is immediately usable without manual DB intervention.
    //
    // CREDENTIALS:
    //   username     : admin
    //   password     : (none — password_hash = '')
    //   role         : admin
    //
    // IDEMPOTENT:
    //   The COUNT check ensures this block only fires once; subsequent migrate
    //   runs skip it because the table already has rows.
    //
    $userCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($userCount === 0) {
        $pdo->exec("
            INSERT INTO users
                (id, username, password_hash, display_name, role, is_game_master, is_suspended)
            VALUES
                ('user_admin_001', 'admin', '', 'Admin', 'admin', 1, 0)
        ");
        Logger::info('Migrate', 'Admin bootstrap: created default admin user (no password set — set on first login)');
    }

    // ============================================================
    // SERVER_SETTINGS BOOTSTRAP
    // ============================================================
    //
    // Seed the 'gm_global_overrides' key with an empty array if it doesn't exist.
    // INSERT OR IGNORE ensures this is idempotent: existing values are preserved.
    //
    $pdo->exec("INSERT OR IGNORE INTO server_settings (key, value) VALUES ('gm_global_overrides', '[]')");
}

// ============================================================
// CLI ENTRY POINT
// ============================================================
// When run directly from the command line, execute the migration.
// When included by Database::runMigrations(), only the function is loaded.

if (PHP_SAPI === 'cli' && basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'])) {
    echo "Running migrations...\n";

    try {
        require_once __DIR__ . '/Database.php';
        migrate(Database::getInstance());
        echo "✅ Migrations complete.\n";
    } catch (\Exception $e) {
        echo "❌ Migration failed: " . $e->getMessage() . "\n";
        exit(1);
    }
}
