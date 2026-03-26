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
 *   - users          (id, username, password_hash, display_name, is_game_master,
 *                     role, is_suspended, last_login_at, created_at)
 *   - campaigns      (id, title, description, poster_url, banner_url, owner_id,
 *                     chapters_json, enabled_rule_sources_json, gm_global_overrides_text,
 *                     homebrew_rules_json, campaign_settings_json, updated_at)
 *   - characters     (id, campaign_id, owner_id, name, is_npc, character_json,
 *                     gm_overrides_json, updated_at)
 *   - campaign_users (campaign_id, user_id, joined_at)
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
    //   Accounts marked suspended cannot log in. Suspension is triggered by:
    //     a) An admin explicitly suspending the account via the user management UI.
    //     b) A new account (password_hash = '') that first attempts login more than
    //        7 days after creation — auto-suspended at login time (no cron required).
    //   Admins can reinstate any suspended account.
    if (!in_array('is_suspended', $userCols, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN is_suspended INTEGER NOT NULL DEFAULT 0');
        Logger::info('Migrate', 'Added column users.is_suspended');
    }

    // Phase 22.1 — last_login_at column
    //   Unix timestamp of the user's most recent successful login.
    //   NULL means the user has never logged in (password not yet set).
    //   Used in the admin user-list view to show inactivity.
    if (!in_array('last_login_at', $userCols, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN last_login_at INTEGER');
        Logger::info('Migrate', 'Added column users.last_login_at');
    }

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
    // CAMPAIGN_USERS JOIN TABLE (Phase 22.1)
    // ============================================================
    //
    // PURPOSE:
    //   Tracks which users are members of which campaigns.
    //   Admins and GMs use this to explicitly invite/remove players.
    //   This is distinct from character ownership — a user can be a campaign
    //   member even if suspended (their characters may still be active).
    //
    // WHY A SEPARATE TABLE (not a JSON column on campaigns)?
    //   A proper join table enables efficient per-user and per-campaign queries,
    //   enforces referential integrity with foreign keys, and makes the
    //   character-count-per-campaign query (used in the admin user list) trivial.
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
    // FIRST-LOGIN FLOW:
    //   The admin must log in without a password and will be immediately
    //   redirected to the password-setup page (handled by auth.php / frontend).
    //   The 7-day no-password expiry is NOT applied to the admin bootstrap account
    //   because it has role='admin' — see handleLogin() for the exemption note.
    //   Actually, the admin IS subject to the same 7-day window; the rationale
    //   is that the installer should set the password on the first day.
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
