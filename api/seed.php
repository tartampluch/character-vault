<?php
/**
 * @file api/seed.php
 * @description Development database seeder — creates default users for local dev.
 *
 * PURPOSE:
 *   Seeds the database with two development users so you can log in immediately
 *   without setting up accounts manually.
 *
 * USAGE:
 *   CLI: php api/seed.php
 *
 * USERS CREATED:
 *   Username : gm          Password: gm          Role: Game Master
 *   Username : player      Password: player      Role: Player
 *
 * SAFETY:
 *   - Uses INSERT OR IGNORE — safe to run multiple times (idempotent).
 *   - Only creates users if they don't already exist.
 *   - Never run on production (these are weak dev credentials).
 *
 * @see api/migrate.php for the schema.
 * @see api/auth.php    for login endpoint.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/migrate.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden', 'message' => 'Seed script can only be run from CLI.']);
    exit;
}

echo "Running migrations...\n";
migrate();
echo "✅ Schema ready.\n\n";

$db = Database::getInstance();

$users = [
    [
        'id'             => 'user_gm_001',
        'username'       => 'gm',
        'password'       => 'gm',
        'display_name'   => 'Game Master',
        'is_game_master' => 1,
    ],
    [
        'id'             => 'user_player_001',
        'username'       => 'player',
        'password'       => 'player',
        'display_name'   => 'Test Player',
        'is_game_master' => 0,
    ],
];

$stmt = $db->prepare('
    INSERT OR IGNORE INTO users (id, username, password_hash, display_name, is_game_master)
    VALUES (:id, :username, :password_hash, :display_name, :is_game_master)
');

echo "Seeding users...\n";

foreach ($users as $user) {
    $hash   = hashPassword($user['password']);
    $result = $stmt->execute([
        ':id'             => $user['id'],
        ':username'       => $user['username'],
        ':password_hash'  => $hash,
        ':display_name'   => $user['display_name'],
        ':is_game_master' => $user['is_game_master'],
    ]);

    $role = $user['is_game_master'] ? 'GM' : 'Player';
    if ($result && $stmt->rowCount() > 0) {
        echo "  ✅ Created [{$role}] {$user['username']} / {$user['password']}\n";
    } else {
        echo "  ℹ  [{$role}] {$user['username']} already exists — skipped.\n";
    }
}

echo "\n";

// ============================================================
// CAMPAIGNS
// ============================================================

// File-path based rule sources (matches DataLoader's new path-based filtering)
$srdCorePaths = [
    'config_tables.json',
    '00_d20srd_core/00_d20srd_core_races.json',
    '00_d20srd_core/01_d20srd_core_classes.json',
    '00_d20srd_core/02_d20srd_core_class_features.json',
    '00_d20srd_core/03_d20srd_core_feats.json',
    '00_d20srd_core/04_d20srd_core_skills_config.json',
    '00_d20srd_core/05_d20srd_core_spells.json',
    '00_d20srd_core/06_d20srd_core_equipment_weapons.json',
    '00_d20srd_core/07_d20srd_core_equipment_armor.json',
    '00_d20srd_core/08_d20srd_core_equipment_goods.json',
    '00_d20srd_core/09_d20srd_core_config.json',
    '00_d20srd_core/10_d20srd_core_prestige_classes.json',
    '00_d20srd_core/11_d20srd_core_prestige_class_features.json',
    '00_d20srd_core/12_d20srd_core_magic_items.json',
    '00_d20srd_core/13_d20srd_core_cleric_domains.json',
    '00_d20srd_core/14_d20srd_core_npc_classes.json',
    '00_d20srd_core/15_d20srd_core_special_materials.json',
    '00_d20srd_core/16_d20srd_core_racial_features.json',
    '00_d20srd_core/17_d20srd_core_proficiency_features.json',
];

$campaigns = [
    [
        'id'                        => 'campaign_001',
        'title'                     => 'Reign of Winter',
        'description'               => 'A campaign of intrigue, ancient evils, and frozen wilderness.',
        'owner_id'                  => 'user_gm_001',
        'enabled_rule_sources_json' => json_encode($srdCorePaths),
        'gm_global_overrides_text'  => '[]',
    ],
    [
        'id'                        => 'campaign_002',
        'title'                     => 'The Darklands',
        'description'               => 'A homebrew campaign set in a world of perpetual twilight.',
        'owner_id'                  => 'user_gm_001',
        'enabled_rule_sources_json' => json_encode($srdCorePaths),
        'gm_global_overrides_text'  => '[]',
    ],
];

$stmtC = $db->prepare('
    INSERT OR IGNORE INTO campaigns
        (id, title, description, owner_id, enabled_rule_sources_json, gm_global_overrides_text, updated_at)
    VALUES
        (:id, :title, :description, :owner_id, :enabled_rule_sources_json, :gm_global_overrides_text, :updated_at)
');

echo "Seeding campaigns...\n";

foreach ($campaigns as $c) {
    $stmtC->execute([
        ':id'                        => $c['id'],
        ':title'                     => $c['title'],
        ':description'               => $c['description'],
        ':owner_id'                  => $c['owner_id'],
        ':enabled_rule_sources_json' => $c['enabled_rule_sources_json'],
        ':gm_global_overrides_text'  => $c['gm_global_overrides_text'],
        ':updated_at'                => time(),
    ]);

    if ($stmtC->rowCount() > 0) {
        echo "  ✅ Created campaign: {$c['title']} ({$c['id']})\n";
    } else {
        echo "  ℹ  Campaign {$c['id']} already exists — skipped.\n";
    }
}

echo "\n✅ Seed complete.\n";
echo "   Login at http://localhost:5173/login\n";
echo "   GM      → username: gm      / password: gm\n";
echo "   Player  → username: player  / password: player\n";
