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
 *   - users     (id, username, password_hash, display_name, is_game_master)
 *   - campaigns (id, title, description, poster_url, banner_url, owner_id,
 *                chapters_json, enabled_rule_sources_json, gm_global_overrides_text,
 *                homebrew_rules_json, updated_at)
 *   - characters (id, campaign_id, owner_id, name, is_npc, character_json,
 *                 gm_overrides_json, updated_at)
 *
 * WHY SEPARATE characters.character_json AND characters.gm_overrides_json?
 *   The core character state (activeFeatures, classLevels, attributes, skills, resources)
 *   is the player's data. The GM overrides are the GM's secret additions.
 *   Separating them enforces the visibility rule at the database level:
 *     - Players receive character_json (possibly with gmOverrides already merged in).
 *     - GMs receive both fields separately so they can edit overrides independently.
 *   See ARCHITECTURE.md Phase 14.4 for the full schema specification.
 *
 * NOTE (Phase 14.4):
 *   This file is a stub. The full schema will be implemented in Phase 14.4.
 *
 * @see api/Database.php for the PDO connection.
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
    // CAMPAIGNS TABLE
    // ============================================================
    //
    // homebrew_rules_json (Phase 21.1.1):
    //   Stores the campaign-scoped homebrew entity array as a JSON TEXT column.
    //   Default is an empty JSON array '[]'.
    //
    //   SCOPE: campaign (vs. global server-side files stored in storage/rules/).
    //   VISIBILITY: Readable by all authenticated users in the campaign (GM + players).
    //   WRITEABLE: GM only — PUT /api/campaigns/{id}/homebrew-rules.
    //
    //   FORMAT: A JSON-encoded array of Feature-like objects — same format as
    //   static/rules/*.json files — which DataLoader injects into the resolution
    //   chain as the virtual source named "user_homebrew" (after all file sources,
    //   before gmGlobalOverrides). See ARCHITECTURE.md §21.1 for the full chain.
    //
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS campaigns (
            id                           TEXT PRIMARY KEY,
            title                        TEXT NOT NULL,
            description                  TEXT NOT NULL DEFAULT \'\',
            poster_url                   TEXT,
            banner_url                   TEXT,
            owner_id                     TEXT NOT NULL,
            chapters_json                TEXT NOT NULL DEFAULT \'[]\',
            enabled_rule_sources_json    TEXT NOT NULL DEFAULT \'[]\',
            gm_global_overrides_text     TEXT NOT NULL DEFAULT \'[]\',
            homebrew_rules_json          TEXT NOT NULL DEFAULT \'[]\',
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
    //   message differs by database driver:
    //     SQLite: "table X already has a column named Y"
    //     MySQL:  "Duplicate column name 'Y'"
    //   Rather than matching driver-specific strings, we read the schema once
    //   via PRAGMA table_info() and only execute ALTER TABLE when the column
    //   is genuinely absent. This is truly idempotent and driver-agnostic.
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
    // Previously kept only in localStorage; this column persists them server-side
    // and syncs them across devices. Default '{}' means "use engine defaults".
    if (!in_array('campaign_settings_json', $campaignCols, true)) {
        $pdo->exec("ALTER TABLE campaigns ADD COLUMN campaign_settings_json TEXT NOT NULL DEFAULT '{}'");
        Logger::info('Migrate', 'Added column campaigns.campaign_settings_json');
    }

    // ============================================================
    // CHARACTERS TABLE
    // ============================================================
    //
    // DESIGN DECISION — character_json vs gm_overrides_json:
    //   `character_json` stores the entire ECS state (the "player-facing" data):
    //     activeFeatures, classLevels, attributes base values, skills ranks,
    //     resources (current HP, PP), linkedEntities.
    //     This is the data the player can see and edit.
    //
    //   `gm_overrides_json` stores the GM's per-character overrides:
    //     An array of ActiveFeatureInstance objects injected secretly.
    //     Players never see this field — the API merges it into the response
    //     (invisibly for players, separately for GMs).
    //
    //   WHY NOT MERGE THEM?
    //     Keeping them separate makes the visibility rule trivial to enforce
    //     at the query level, without complex JSON manipulation on every request.
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
    // INDEXES (for common query patterns)
    // ============================================================
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_characters_campaign_id ON characters(campaign_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_characters_owner_id ON characters(owner_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_campaigns_owner_id ON campaigns(owner_id)');
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
