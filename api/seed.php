<?php
/**
 * @file api/seed.php
 * @description Development database seeder — fully wipes and rebuilds the DB.
 *
 * PURPOSE:
 *   Seeds a CLEAN database with realistic demo data for local development:
 *     - 4 users (admin, gm, player1, player2)
 *     - 1 campaign with 5 chapters and ~30 tasks (WotC-style 1-shot adventure)
 *     - 2 fully built level-7 characters (Human Soulknife, Elf Druid)
 *
 * USAGE:
 *   CLI only: php api/seed.php
 *
 * USERS CREATED:
 *   Username : admin     Password: admin    Role: admin
 *   Username : gm        Password: gm       Role: Game Master
 *   Username : player1   Password: player1  Role: Player  (owns Kael Shadowstep)
 *   Username : player2   Password: player2  Role: Player  (owns Sylara Moonwhisper)
 *
 * APPROACH — "API calls where possible":
 *   - Users   → direct DB insert (required: no authenticated session exists yet)
 *   - Campaign → CampaignController::create() + ::update() with simulated session
 *   - Characters → direct DB insert with full ECS character JSON
 *     (CharacterController::create() limits non-GMs to their own campaigns;
 *      since the demo campaign is GM-owned and we need specific player ownership,
 *      direct insert is the pragmatic choice — documented below.)
 *
 * SAFETY:
 *   - DELETES the SQLite database file before running (clean-slate guarantee).
 *   - CLI-only execution guard (cannot be called over HTTP).
 *   - Never run on production (weak credentials).
 *
 * @see api/migrate.php for the schema.
 * @see api/auth.php    for login endpoint.
 * @see tests/TestPhpInputStream.php for the stream wrapper pattern used here.
 */

declare(strict_types=1);

// ============================================================
// CLI GUARD — Reject HTTP requests immediately
// ============================================================
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden', 'message' => 'Seed script can only be run from CLI.']);
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/migrate.php';
require_once __DIR__ . '/controllers/CampaignController.php';

// ============================================================
// STEP 1 — CLEAN SLATE: Delete the existing database file
// ============================================================
// We cannot simply call migrate() because tables already exist and INSERT OR
// IGNORE would silently skip conflicting rows. Deleting the file guarantees a
// truly clean state every time this script runs.
//
// DB_PATH is defined in config.php; it points to the project-root SQLite file
// in development mode. We only delete file-based DBs (not in-memory test DBs).

if (!APP_TESTING && DB_PATH !== 'sqlite::memory:') {
    $dbFile = DB_PATH;
    if (file_exists($dbFile)) {
        unlink($dbFile);
        echo "🗑  Deleted existing database: {$dbFile}\n";
    }
    // Reset the PDO singleton so it reconnects to the (now absent) file path.
    Database::reset();
}

// ============================================================
// STEP 2 — RUN MIGRATIONS (creates schema + admin bootstrap row)
// ============================================================
echo "Running migrations...\n";
migrate();
echo "✅ Schema ready.\n\n";

$db = Database::getInstance();

// ============================================================
// STEP 3 — USERS
// ============================================================
// WHY DIRECT INSERT (not CampaignController/CharacterController)?
//   The auth system requires at least one user to exist before any authenticated
//   API call can be made. The admin bootstrap row created by migrate() has an
//   empty password hash; we update it here and insert the remaining users.
//
// The `role` column governs all permission checks in auth.php:
//   'admin'  → can manage users + full GM capabilities
//   'gm'     → Game Master (campaigns, characters, overrides)
//   'player' → Regular player

echo "Seeding users...\n";

$usersToCreate = [
    // ── Admin ──────────────────────────────────────────────────────────────
    // The bootstrap admin row already exists from migrate(). We UPDATE it to
    // set the "admin" password hash instead of inserting a duplicate.
    [
        'id'             => 'user_admin_001',
        'username'       => 'admin',
        'password'       => 'admin',
        'display_name'   => 'Admin',
        'role'           => 'admin',
        'is_game_master' => 1,
        'mode'           => 'update', // UPDATE the bootstrap row, don't INSERT
    ],
    // ── Game Master ────────────────────────────────────────────────────────
    [
        'id'             => 'user_gm_001',
        'username'       => 'gm',
        'password'       => 'gm',
        'display_name'   => 'Game Master',
        'role'           => 'gm',
        'is_game_master' => 1,
        'mode'           => 'insert',
    ],
    // ── Players ───────────────────────────────────────────────────────────
    // player1 owns Kael Shadowstep (Human Soulknife 7)
    [
        'id'             => 'user_player1_001',
        'username'       => 'player1',
        'password'       => 'player1',
        'display_name'   => 'Player One',
        'role'           => 'player',
        'is_game_master' => 0,
        'mode'           => 'insert',
    ],
    // player2 owns Sylara Moonwhisper (Elf Druid 7)
    [
        'id'             => 'user_player2_001',
        'username'       => 'player2',
        'password'       => 'player2',
        'display_name'   => 'Player Two',
        'role'           => 'player',
        'is_game_master' => 0,
        'mode'           => 'insert',
    ],
];

$stmtInsertUser = $db->prepare('
    INSERT INTO users (id, username, password_hash, display_name, role, is_game_master)
    VALUES (:id, :username, :password_hash, :display_name, :role, :is_game_master)
');
$stmtUpdateAdmin = $db->prepare('
    UPDATE users SET password_hash = :password_hash WHERE id = :id
');

foreach ($usersToCreate as $u) {
    $hash = hashPassword($u['password']);
    if ($u['mode'] === 'update') {
        $stmtUpdateAdmin->execute([':password_hash' => $hash, ':id' => $u['id']]);
        echo "  ✅ Updated [{$u['role']}] {$u['username']} / {$u['password']}\n";
    } else {
        $stmtInsertUser->execute([
            ':id'             => $u['id'],
            ':username'       => $u['username'],
            ':password_hash'  => $hash,
            ':display_name'   => $u['display_name'],
            ':role'           => $u['role'],
            ':is_game_master' => $u['is_game_master'],
        ]);
        echo "  ✅ Created [{$u['role']}] {$u['username']} / {$u['password']}\n";
    }
}
echo "\n";

// ============================================================
// API SIMULATION HELPERS
// ============================================================
// WHY NOT REAL HTTP CALLS?
//   The seed script runs before any web server is started. Spawning a background
//   PHP server, making curl calls, and killing it would be fragile and slow.
//   Instead we replicate what tests/TestCase.php does:
//     1. Set $_SESSION directly (simulates requireAuth() returning a user).
//     2. Register a stream wrapper that intercepts file_get_contents('php://input').
//     3. Capture controller output with ob_start().
//     4. Restore the original PHP stream wrapper in a finally block.
//
// This reuses every line of business logic in the controller — the only thing
// bypassed is the actual HTTP transport layer.

/**
 * Minimal stream wrapper that mocks php://input for CLI controller calls.
 * Copied from tests/TestPhpInputStream.php — same pattern, inline for portability.
 */
class SeedInputStream
{
    /** @var string The JSON body to inject. */
    public static string $inputData = '';

    /** @var int Current read position. */
    private int $position = 0;

    /** @var mixed Required by PHP stream wrapper interface. */
    public mixed $context;

    public function stream_open(string $path, string $mode, int $options, ?string &$opened_path): bool
    {
        $this->position = 0;
        return true;
    }

    public function stream_read(int $count): string
    {
        $result = substr(self::$inputData, $this->position, $count);
        $this->position += strlen($result);
        return $result;
    }

    public function stream_eof(): bool
    {
        return $this->position >= strlen(self::$inputData);
    }

    /** @return array<string, int> */
    public function stream_stat(): array
    {
        return [];
    }

    /** @return array<string, int> */
    public function url_stat(string $path, int $flags): array
    {
        return [];
    }
}

/**
 * Simulate an authenticated session as the given user.
 *
 * @param string $userId       User ID (must exist in the DB).
 * @param string $role         'admin' | 'gm' | 'player'
 * @param string $username     For logging/display.
 * @param string $displayName  Display name.
 */
function simulateLogin(string $userId, string $role, string $username, string $displayName = ''): void
{
    $isGameMaster = in_array($role, ['gm', 'admin'], true);
    $_SESSION = [
        'user_id'        => $userId,
        'username'       => $username,
        'display_name'   => $displayName ?: ucfirst($username),
        'role'           => $role,
        'is_game_master' => $isGameMaster,
    ];
}

/**
 * Call a controller action with a JSON request body, capturing the response.
 *
 * Uses SeedInputStream to mock php://input (same pattern as TestCase::callControllerWithInput).
 * Always restores the original php stream wrapper in a finally block.
 *
 * WHY SUPPRESS display_errors?
 *   In development mode (APP_ENV=development), config.php sets display_errors=1.
 *   This means PHP warning messages (e.g. from http_response_code() after output)
 *   are written to stdout — which pollutes the captured JSON output buffer.
 *   We temporarily disable display_errors so the ob_start() buffer contains only
 *   the controller's echo'd JSON, not interleaved PHP warning text.
 *   The setting is restored immediately after ob_get_clean().
 *
 * WHY @ ON http_response_code()?
 *   In CLI mode, once ANY output has occurred (even before ob_start()), PHP
 *   considers "headers already sent". Calling http_response_code() to read or
 *   set the status code triggers E_WARNING in that state. Since the status code
 *   is not reliable in this context anyway, we suppress the warning and fall back
 *   to parsing the JSON output body to determine success/failure.
 *
 * @param callable $action   The controller method to call.
 * @param array    $body     The PHP array to encode as the request body.
 * @return array{status:int, body:array<string,mixed>}
 */
function callApi(callable $action, array $body = []): array
{
    // Register our mock wrapper to intercept file_get_contents('php://input').
    stream_wrapper_unregister('php');
    stream_register_wrapper('php', SeedInputStream::class);
    SeedInputStream::$inputData = json_encode($body);

    // Suppress display_errors AND E_WARNING during the capture window.
    //
    // In PHP CLI with display_errors=1, warnings are written to stdout — polluting
    // the ob_start() buffer with text that breaks JSON parsing.
    // In PHP CLI, warnings also go to stderr via the error handler regardless of
    // display_errors; suppressing E_WARNING here prevents both channels.
    //
    // Specifically: controllers call http_response_code() after "output" has been
    // sent (seed script already printed lines before this call). PHP considers this
    // a "headers already sent" condition in CLI and emits E_WARNING. That warning
    // is benign — no real HTTP headers exist in CLI mode — so we suppress it here
    // and restore both settings immediately after ob_get_clean().
    $prevDisplayErrors  = ini_get('display_errors');
    $prevErrorReporting = error_reporting(E_ALL & ~E_WARNING);
    ini_set('display_errors', '0');

    ob_start();
    try {
        $action();
    } catch (HttpExitException) {
        // Controller sent a response and called httpExit() — expected in CLI mode.
    } finally {
        // CRITICAL: always restore the real PHP stream wrapper.
        stream_wrapper_restore('php');
    }

    $output = ob_get_clean();

    // Restore display_errors and error_reporting to their original settings.
    ini_set('display_errors', $prevDisplayErrors);
    error_reporting($prevErrorReporting);

    // http_response_code() returns false in CLI after output; use @ to suppress warning.
    // Fall back to 200 (success) if the code is unreadable — the JSON body indicates
    // the true outcome.
    $code = @http_response_code();
    $status = ($code !== false && $code > 0) ? (int)$code : 200;
    @http_response_code(200); // Reset for the next call

    $parsed = json_decode($output ?: '{}', true);

    return [
        'status' => $status,
        // If JSON parsing fails (e.g. mixed output), return empty array so callers
        // can detect failure via the absence of expected keys.
        'body'   => is_array($parsed) ? $parsed : [],
    ];
}

// ============================================================
// STEP 4 — CAMPAIGN (via API)
// ============================================================
// All campaign operations are performed as the GM. The CampaignController
// enforces requireGameMaster() for POST /api/campaigns.

echo "Seeding campaign...\n";
simulateLogin('user_gm_001', 'gm', 'gm', 'Game Master');

// ── 4a. Create the campaign shell ──────────────────────────────────────────
$campaignId = 'camp_shattered_throne_001';

// Rule sources: SRD Core + Psionic (both needed for a Soulknife character)
$allRuleSources = [
    // SRD Core
    '00_d20srd_core/00_d20srd_core_config_tables.json',
    '00_d20srd_core/01_d20srd_core_races.json',
    '00_d20srd_core/02_d20srd_core_classes.json',
    '00_d20srd_core/03_d20srd_core_class_features.json',
    '00_d20srd_core/04_d20srd_core_feats.json',
    '00_d20srd_core/05_d20srd_core_skills_config.json',
    '00_d20srd_core/06_d20srd_core_spells.json',
    '00_d20srd_core/07_d20srd_core_equipment_weapons.json',
    '00_d20srd_core/08_d20srd_core_equipment_armor.json',
    '00_d20srd_core/09_d20srd_core_equipment_goods.json',
    '00_d20srd_core/10_d20srd_core_config.json',
    '00_d20srd_core/11_d20srd_core_prestige_classes.json',
    '00_d20srd_core/12_d20srd_core_prestige_class_features.json',
    '00_d20srd_core/13_d20srd_core_magic_items.json',
    '00_d20srd_core/14_d20srd_core_cleric_domains.json',
    '00_d20srd_core/15_d20srd_core_npc_classes.json',
    '00_d20srd_core/16_d20srd_core_special_materials.json',
    '00_d20srd_core/17_d20srd_core_racial_features.json',
    '00_d20srd_core/18_d20srd_core_proficiency_features.json',
    // SRD Psionics (needed for Soulknife class, psionic feats, powers)
    '01_d20srd_psionics/00_d20srd_psionics_classes.json',
    '01_d20srd_psionics/01_d20srd_psionics_class_features.json',
    '01_d20srd_psionics/02_d20srd_psionics_powers.json',
    '01_d20srd_psionics/03_d20srd_psionics_feats.json',
    '01_d20srd_psionics/04_d20srd_psionics_races.json',
    '01_d20srd_psionics/05_d20srd_psionics_prestige_classes.json',
    '01_d20srd_psionics/06_d20srd_psionics_prestige_class_features.json',
    '01_d20srd_psionics/07_d20srd_psionics_items.json',
    '01_d20srd_psionics/08_d20srd_psionics_racial_features.json',
];

// The controller generates its own ID; we'll override after creation.
// To pass a known ID, we insert directly after the API creates the shell,
// since the create() endpoint auto-generates the ID via bin2hex(random_bytes(8)).
// Instead: use a direct DB insert for the shell so we control the ID.
//
// WHY DIRECT INSERT FOR CREATION HERE?
//   CampaignController::create() generates its own random ID — we need a known,
//   stable ID so we can reference it in characters' campaignId and the update call.
//   The controller is still used for the chapter/settings update below.
// Insert using the updated schema:
//   title_json       — JSON-encoded LocalizedString (replaces plain `title` column).
//   description_json — JSON-encoded LocalizedString (replaces plain `description` column).
//   NO poster_url    — Removed; banner_image_data is the sole campaign image.
//   NO gm_global_overrides_text — Moved to server_settings table.
$db->prepare('
    INSERT INTO campaigns
        (id, title_json, description_json, owner_id, chapters_json, enabled_rule_sources_json, updated_at)
    VALUES
        (?, ?, ?, ?, ?, ?, ?)
')->execute([
    $campaignId,
    // title_json: JSON-encoded LocalizedString so the frontend resolves the active
    // language via engine.t() and the settings page can add translations.
    json_encode([
        'en' => 'The Shattered Throne',
        'fr' => 'Le Trône Brisé',
        'ja' => '砕けた玉座',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    // description_json: same LocalizedString encoding as title_json.
    json_encode([
        'en' => 'When the Crown of Binding is stolen from the Vault of Ages, a group of unlikely heroes must pursue its thief through labyrinthine city streets, haunted ruins, flooded ancient cities, and a storm-wracked lich fortress—before an unkillable evil reclaims its seat of power. A complete 1-shot adventure for four 7th-level characters.',
        'fr' => 'Lorsque la Couronne du Lien est dérobée de la Chambre des Âges, un groupe de héros improbables doit pourchasser le voleur à travers les rues labyrinthiques d\'une ville, des ruines hantées, des cités antiques inondées et une forteresse de liche balayée par les tempêtes — avant qu\'un mal indestructible ne reprenne son trône. Une aventure complète en une session pour quatre personnages de niveau 7.',
        'ja' => '縛りの王冠が時代の金庫から盗まれたとき、ありそうにない英雄たちの一団は、迷宮のような市街地、呪われた廃墟、水没した古代都市、嵐に打たれたリッチの要塞を通り抜けながら盗人を追跡しなければならない――不死の悪が再び権力の座を奪い返す前に。4人の第7レベルキャラクターのための完結型1回限りの冒険。',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    'user_gm_001',
    '[]',
    json_encode($allRuleSources),
    time(),
]);
echo "  ✅ Created campaign: The Shattered Throne ({$campaignId})\n";

// ── 4b. Update campaign with chapters (via API) ────────────────────────────
// CampaignController::update() accepts a `chapters` array and stores it as JSON.
// This is the "API call" portion for the campaign content.

// ── Chapter/task data ──────────────────────────────────────────────────────
// 5 chapters, ~6 tasks each — totals ~30 tasks.
// Style: WotC adventure module (numbered chapter titles, concrete task verbs).
$chapters = [

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER 1: Blood on the Cobblestones
    // ─────────────────────────────────────────────────────────────────────
    // The party is hired by the Arcane Council, investigates the Vault robbery,
    // clashes with the local thieves' guild, and recovers the first clue.
    [
        'id'          => 'chapter_01_blood_cobblestones',
        'title'       => ['en' => 'Chapter 1: Blood on the Cobblestones', 'fr' => 'Chapitre 1 : Sang sur les pavés', 'ja' => '第1章：石畳の血'],
        'description' => [
            'en' => 'The party is summoned to the Arcane Council Hall, where Magister Aldeth Crane reveals that the Crown of Binding has been stolen from the Vault of Ages. Evidence at the crime scene points to the Thornhaven Thieves\' Guild. The party must infiltrate the guild, defeat its ruthless captain, and recover the encoded cipher that leads to the next leg of the trail.',
            'fr' => 'Le groupe est convoqué au Conseil des Arcanes, où le Magister Aldeth Crane révèle que la Couronne du Lien a été volée de la Chambre des Âges. Les preuves sur les lieux du crime pointent vers la Guilde des Voleurs de Thornhaven.',
            'ja' => '一行は秘術評議会の館に召集される。マジスター・アルデス・クレインは、縛りの王冠が時代の金庫から盗まれたことを明かす。犯行現場の証拠はソーンヘイヴン盗賊ギルドを指し示していた。一行はギルドに潜入し、冷酷な頭目を倒し、次の手がかりへと続く暗号文書を回収しなければならない。',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_01_01',
                'title'       => ['en' => 'Report to Magister Aldeth Crane at the Arcane Council Hall', 'fr' => 'Se présenter au Magister Aldeth Crane à la Salle du Conseil des Arcanes', 'ja' => '秘術評議会の館でマジスター・アルデス・クレインに報告する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_02',
                'title'       => ['en' => 'Examine the crime scene inside the Vault of Ages', 'fr' => 'Examiner la scène de crime dans la Chambre des Âges', 'ja' => '時代の金庫内の犯行現場を調べる'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_03',
                'title'       => ['en' => 'Question the sole surviving vault guard, Harkin One-Eye', 'fr' => 'Interroger l\'unique garde survivant de la chambre forte, Harkin l\'Œil-de-Verre', 'ja' => '金庫の唯一の生き残り番人、片目のハーキンを尋問する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_04',
                'title'       => ['en' => 'Track down fence Mordecai the Grey in the Underbazaar and learn the guild connection', 'fr' => 'Retrouver le receleur Mordecai le Gris à l\'Underbazaar et découvrir le lien avec la guilde', 'ja' => '地下市場で情報屋グレイのモルデカイを追い詰め、ギルドとのつながりを探る'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_05',
                'title'       => ['en' => 'Infiltrate the Thornhaven Thieves\' Guild through the tannery safe house', 'fr' => 'Infiltrer la Guilde des Voleurs de Thornhaven via la planque de la tannerie', 'ja' => 'なめし革工場のアジト経由でソーンヘイヴン盗賊ギルドに潜入する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_06',
                'title'       => ['en' => 'Defeat Guild Captain Rendak the Swift and her elite shadowblades', 'fr' => 'Vaincre la Capitaine de Guilde Rendak la Rapide et ses ombres d\'élite', 'ja' => 'ギルドの頭目レンダック・ザ・スウィフトと彼女の精鋭シャドウブレイドを倒す'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_07',
                'title'       => ['en' => 'Recover the stolen cipher from Rendak\'s warded strongbox', 'fr' => 'Récupérer le chiffre volé dans le coffre protégé de Rendak', 'ja' => 'レンダックの守護された金庫から盗まれた暗号文書を回収する'],
                'isCompleted' => false,
            ],
        ],
    ],

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER 2: Whispers in the Deepwood
    // ─────────────────────────────────────────────────────────────────────
    // The cipher leads into a cursed forest. Ancient elven ruins hide a
    // resonance artifact needed to access the Sunken City.
    [
        'id'          => 'chapter_02_deepwood',
        'title'       => ['en' => 'Chapter 2: Whispers in the Deepwood', 'fr' => 'Chapitre 2 : Murmures dans la Forêt Profonde', 'ja' => '第2章：深い森のささやき'],
        'description' => [
            'en' => 'Decoding the cipher reveals a path through the Haunted Deepwood, a forest warped by ancient fey magic. At its heart lie the ruins of Elara\'s Watch, an elven outpost that fell a thousand years ago. The party must navigate fey traps, bypass undead sentinels, and claim the Shard of Resonance—a key needed to enter the Sunken City hidden beneath the wood.',
            'fr' => 'Le déchiffrement du code révèle un chemin à travers la Forêt Profonde Hantée, une forêt tordue par une ancienne magie fée. En son cœur se trouvent les ruines d\'Elara\'s Watch, un avant-poste elfique tombé il y a mille ans.',
            'ja' => '暗号を解読すると、古代の妖精魔法に歪められた幽霊の深い森への道が明かされる。その中心には千年前に滅びたエルフの前哨地、エラーラの見張り台の廃墟がある。一行は妖精の罠をくぐり抜け、アンデッドの番兵を迂回し、森の下に隠された沈んだ都市への入口となる共鳴の欠片を手に入れなければならない。',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_02_01',
                'title'       => ['en' => 'Decode the guild cipher to map the safe path through the Deepwood', 'fr' => 'Décoder le chiffre de la guilde pour tracer le chemin sûr à travers la Forêt Profonde', 'ja' => 'ギルドの暗号を解読し、深い森の安全な経路を地図に記す'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_02',
                'title'       => ['en' => 'Survive the three-night journey through the Haunted Deepwood without triggering the fey wards', 'fr' => 'Survivre au voyage de trois nuits à travers la Forêt Profonde Hantée sans déclencher les protections féeriques', 'ja' => '妖精の結界を発動させずに幽霊の深い森での三夜の旅を生き延びる'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_03',
                'title'       => ['en' => 'Locate the fallen elven watchtower, Elara\'s Watch, hidden beneath centuries of overgrowth', 'fr' => 'Localiser la tour de guet elfique en ruine, Elara\'s Watch, cachée sous des siècles de végétation', 'ja' => '数百年の植物に覆われた廃墟のエルフ見張り塔、エラーラの見張り台を見つける'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_04',
                'title'       => ['en' => 'Solve the harmonic resonance puzzle to unlock the inner sanctum', 'fr' => 'Résoudre le puzzle de résonance harmonique pour débloquer le sanctuaire intérieur', 'ja' => '内部の聖域を開く調和共鳴のパズルを解く'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_05',
                'title'       => ['en' => 'Defeat the Bone Sentinel, guardian of the sanctum', 'fr' => 'Vaincre la Sentinelle d\'Os, gardienne du sanctuaire', 'ja' => '聖域の番人、骨の番兵を倒す'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_06',
                'title'       => ['en' => 'Retrieve the Shard of Resonance from the sanctum altar', 'fr' => 'Récupérer l\'Éclat de Résonance sur l\'autel du sanctuaire', 'ja' => '聖域の祭壇から共鳴の欠片を回収する'],
                'isCompleted' => false,
            ],
        ],
    ],

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER 3: The Sunken City
    // ─────────────────────────────────────────────────────────────────────
    // An ancient city flooded and forgotten beneath the Deepwood hides a
    // mind flayer who knows where the Crown was taken.
    [
        'id'          => 'chapter_03_sunken_city',
        'title'       => ['en' => 'Chapter 3: The Sunken City', 'fr' => 'Chapitre 3 : La Cité Engloutie', 'ja' => '第3章：沈んだ都市'],
        'description' => [
            'en' => 'The Shard of Resonance vibrates in proximity to a hidden entrance leading down into the drowned streets of Ahnkora—a metropolis flooded two centuries ago when its mages tore open a planar rift. An aboleth claims the dark water as its domain, and somewhere in the collapsed library district, the enigmatic mind flayer Vox has mapped the Lich-King\'s fortress. The party must navigate without becoming a meal.',
            'fr' => 'L\'Éclat de Résonance vibre à proximité d\'une entrée cachée menant dans les rues noyées d\'Ahnkora, une métropole inondée il y a deux siècles lorsque ses mages ont ouvert une déchirure planaire. Un aboleth revendique les eaux sombres comme son domaine.',
            'ja' => '共鳴の欠片は、二世紀前に魔術師たちが次元の裂け目を開いたとき水没した大都市アンコーラへと続く隠された入口の近くで振動する。アボレスが暗い水域を縄張りとし、崩壊した図書館地区のどこかで謎めいたマインド・フレイヤーのヴォクスがリッチ王の要塞を地図に記している。一行は食料にされずに切り抜けなければならない。',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_03_01',
                'title'       => ['en' => 'Use the Shard of Resonance to reveal the hidden subterranean entrance to Ahnkora', 'fr' => 'Utiliser l\'Éclat de Résonance pour révéler l\'entrée souterraine cachée menant à Ahnkora', 'ja' => '共鳴の欠片を使ってアンコーラへの隠された地下入口を明らかにする'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_02',
                'title'       => ['en' => 'Navigate the flooded outer districts while avoiding aboleth patrol tentacles', 'fr' => 'Naviguer dans les districts extérieurs inondés en évitant les tentacules de patrouille de l\'aboleth', 'ja' => 'アボレスの触手の巡回を避けながら水没した外郭地区を進む'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_03',
                'title'       => ['en' => 'Survive the sahuagin ambush in the drowned market district', 'fr' => 'Survivre à l\'embuscade sahuagin dans le quartier commerçant noyé', 'ja' => '水没した市場地区でのサフアギンの待ち伏せを生き延びる'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_04',
                'title'       => ['en' => 'Locate the mind flayer Vox in the collapsed archive and open negotiations', 'fr' => 'Localiser l\'illithide Vox dans les archives effondrées et entamer des négociations', 'ja' => '崩壊した文書庫でマインド・フレイヤーのヴォクスを見つけ、交渉を開始する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_05',
                'title'       => ['en' => 'Obtain the Map of the Storm Fortress from Vox in exchange for a psionic service', 'fr' => 'Obtenir la Carte de la Forteresse Tempête auprès de Vox en échange d\'un service psionic', 'ja' => '超念術的な奉仕と引き換えにヴォクスから嵐の要塞の地図を入手する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_06',
                'title'       => ['en' => 'Escape Ahnkora through the sea caves before the aboleth collapses the remaining support columns', 'fr' => 'Fuir Ahnkora par les grottes marines avant que l\'aboleth ne détruise les colonnes de soutien restantes', 'ja' => 'アボレスが残りの支柱を崩壊させる前に海の洞窟を通ってアンコーラから脱出する'],
                'isCompleted' => false,
            ],
        ],
    ],

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER 4: The Storm Fortress
    // ─────────────────────────────────────────────────────────────────────
    // Scaling the sea-cliff fortress of Morveth the Pale, freeing the
    // captured Magister, and fighting through to the throne room antechamber.
    [
        'id'          => 'chapter_04_storm_fortress',
        'title'       => ['en' => 'Chapter 4: The Storm Fortress', 'fr' => 'Chapitre 4 : La Forteresse Tempête', 'ja' => '第4章：嵐の要塞'],
        'description' => [
            'en' => 'Vox\'s map leads to a storm-wracked promontory where the Lich-King Morveth the Pale has carved his fortress into the living rock above a churning sea. The party must scale the howling cliffs, bypass animated golem sentinels, locate and free the captured Magister Aldeth Crane, and fight floor-by-floor through the inner keep to reach the throne room—without alerting Morveth until the very last moment.',
            'fr' => 'La carte de Vox mène à un promontoire balayé par les tempêtes où le Liche-Roi Morveth le Pâle a taillé sa forteresse dans la roche vive au-dessus d\'une mer agitée.',
            'ja' => 'ヴォクスの地図は、荒れ狂う海の上の岩盤に要塞を刻んだリッチ王モルヴェス・ザ・ペイルが待つ嵐吹きすさぶ岬へと導く。一行は叫ぶ崖を登り、動くゴーレム番兵を迂回し、捕らえられたマジスター・アルデス・クレインを見つけて解放し、玉座の間に辿り着くまで内部の砦を階ごとに戦い抜かなければならない――最後の瞬間までモルヴェスに気づかれずに。',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_04_01',
                'title'       => ['en' => 'Scale the Cliffs of the Howling Wind using the routes marked on Vox\'s map', 'fr' => 'Escalader les Falaises du Vent Hurlant en utilisant les routes marquées sur la carte de Vox', 'ja' => 'ヴォクスの地図に記された経路を使って叫ぶ風の崖を登る'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_02',
                'title'       => ['en' => 'Disable or bypass the outer gatehouse and its pair of iron golem sentinels', 'fr' => 'Désactiver ou contourner la guérite extérieure et ses deux sentinelles de golem de fer', 'ja' => '外部の門番所と一対の鉄のゴーレム番兵を無力化するか迂回する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_03',
                'title'       => ['en' => 'Find the imprisonment cells in the tower undercroft and free Magister Aldeth Crane', 'fr' => 'Trouver les cellules d\'emprisonnement dans le sous-sol de la tour et libérer le Magister Aldeth Crane', 'ja' => '塔の地下室にある囚獄を見つけ、マジスター・アルデス・クレインを解放する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_04',
                'title'       => ['en' => 'Fight through three floors of Morveth\'s elite undead honor guard to reach the great hall', 'fr' => 'Combattre à travers trois étages de la garde d\'honneur morte-vivante d\'élite de Morveth pour atteindre la grande salle', 'ja' => '大広間に到達するためにモルヴェスの精鋭アンデッド親衛隊3フロアを戦い抜く'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_05',
                'title'       => ['en' => 'Defeat the Deathknight Commander Serath and claim the Sigil Key to the throne room', 'fr' => 'Vaincre le Commandant Chevalier de la Mort Serath et s\'emparer de la Clé Sigillaire de la salle du trône', 'ja' => 'デスナイトの指揮官セラスを倒し、玉座の間への符紋の鍵を奪う'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_06',
                'title'       => ['en' => 'Study the Magister\'s recovered research notes to learn the Crown\'s true weakness', 'fr' => 'Étudier les notes de recherche récupérées du Magister pour connaître la véritable faiblesse de la Couronne', 'ja' => 'マジスターが回収した研究ノートを調べ、王冠の真の弱点を学ぶ'],
                'isCompleted' => false,
            ],
        ],
    ],

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER 5: The Shattered Throne
    // ─────────────────────────────────────────────────────────────────────
    // The final confrontation: breach the throne room, destroy the Crown,
    // and escape the collapsing fortress before dawn.
    [
        'id'          => 'chapter_05_shattered_throne',
        'title'       => ['en' => 'Chapter 5: The Shattered Throne', 'fr' => 'Chapitre 5 : Le Trône Brisé', 'ja' => '第5章：砕けた玉座'],
        'description' => [
            'en' => 'The Sigil Key opens the wardstone-sealed throne room where the Lich-King Morveth the Pale waits, the Crown of Binding already placed upon his skull. Every moment he wears it extends his dominion over the undead armies massing in the valley below. The party must shatter his phylactery trap, defeat an ancient lich at the height of his power, and destroy the Crown in the Forge of Unmaking deep within the fortress—all before the structure crumbles into the sea.',
            'fr' => 'La Clé Sigillaire ouvre la salle du trône scellée par une pierre de garde où le Liche-Roi Morveth le Pâle attend, la Couronne du Lien déjà posée sur son crâne.',
            'ja' => '符紋の鍵は守護石で封印された玉座の間を開く。リッチ王モルヴェス・ザ・ペイルが待ち構え、縛りの王冠はすでに彼の頭蓋骨に載せられている。彼がそれを装着するたびに谷の下に集結するアンデッドの軍勢への支配が広がる。一行は霊棺の罠を打ち砕き、最盛期の古代リッチを倒し、要塞深くの消却の炉で王冠を破壊しなければならない――構造物が海に崩れ落ちる前に。',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_05_01',
                'title'       => ['en' => 'Use the Sigil Key to breach the wardstone barrier sealing the throne room entrance', 'fr' => 'Utiliser la Clé Sigillaire pour percer la barrière de la pierre de garde scellant l\'entrée de la salle du trône', 'ja' => '符紋の鍵を使って玉座の間の入口を封印する守護石の障壁を破る'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_02',
                'title'       => ['en' => 'Survive and dismantle the Lich-King\'s phylactery guardian trap in the antechamber', 'fr' => 'Survivre et démanteler le piège de gardien de phylactère du Liche-Roi dans l\'antichambre', 'ja' => '前室でリッチ王の霊棺番人の罠を生き延び解体する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_03',
                'title'       => ['en' => 'Defeat the Lich-King Morveth the Pale before he can complete the Crown\'s binding ritual', 'fr' => 'Vaincre le Liche-Roi Morveth le Pâle avant qu\'il ne puisse compléter le rituel de liaison de la Couronne', 'ja' => '縛りの儀式が完成する前にリッチ王モルヴェス・ザ・ペイルを倒す'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_04',
                'title'       => ['en' => 'Descend to the Forge of Unmaking in the fortress depths and destroy the Crown of Binding', 'fr' => 'Descendre à la Forge du Démantèlement dans les profondeurs de la forteresse et détruire la Couronne du Lien', 'ja' => '要塞の深部にある消却の炉まで降りて縛りの王冠を破壊する'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_05',
                'title'       => ['en' => 'Locate the fortress\' emergency exit—a sea-cave tunnel mapped by the Magister—before structural collapse', 'fr' => 'Localiser la sortie de secours de la forteresse—un tunnel de grotte marine cartographié par le Magister—avant l\'effondrement structurel', 'ja' => '構造崩壊の前に要塞の緊急出口――マジスターが記した海の洞窟トンネル――を見つける'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_06',
                'title'       => ['en' => 'Escape the collapsing Storm Fortress and reach the rendezvous ship before dawn', 'fr' => 'Fuir la Forteresse Tempête qui s\'effondre et atteindre le navire de rendez-vous avant l\'aube', 'ja' => '崩壊する嵐の要塞から脱出し、夜明け前に待ち合わせの船に乗る'],
                'isCompleted' => false,
            ],
        ],
    ],
];

// Use the controller to update the campaign with chapters and settings.
// This exercises CampaignController::update() — the API path for chapter management.
$updateResp = callApi(
    fn() => CampaignController::update($campaignId),
    [
        'chapters'           => $chapters,
        'enabledRuleSources' => $allRuleSources,
        // Campaign-level rule settings (persisted server-side by Phase 14.5)
        'diceRules'          => ['explodingTwenties' => false, 'rerollOnes' => false],
        'statGeneration'     => ['method' => 'standard_array'],
        'variantRules'       => ['vitalityWoundPoints' => false, 'gestalt' => false],
    ]
);

// Success: body contains 'id' (update returned the campaign ID).
// Failure: body contains 'error' key.
$updateOk = isset($updateResp['body']['id']) || (!isset($updateResp['body']['error']) && $updateResp['status'] === 200);
$totalTasks = array_sum(array_map(fn($ch) => count($ch['tasks'] ?? []), $chapters));
if ($updateOk) {
    echo "  ✅ Updated campaign with 5 chapters and {$totalTasks} tasks.\n";
} else {
    echo "  ❌ Campaign update failed (status {$updateResp['status']}): " . json_encode($updateResp['body']) . "\n";
}

// ── 4c. Add players to campaign_users ─────────────────────────────────────
// This makes both player accounts members of the campaign so they can
// see it in the Campaign Hub and access their characters.
$stmtJoin = $db->prepare('INSERT OR IGNORE INTO campaign_users (campaign_id, user_id) VALUES (?, ?)');
$stmtJoin->execute([$campaignId, 'user_player1_001']);
$stmtJoin->execute([$campaignId, 'user_player2_001']);
echo "  ✅ Added player1 and player2 to campaign membership.\n";
echo "\n";

// ============================================================
// STEP 5 — CHARACTERS (direct DB insert with full ECS JSON)
// ============================================================
// WHY DIRECT INSERT FOR CHARACTERS?
//   CharacterController::create() enforces: "Non-GMs can only add characters to
//   campaigns they own." Since the demo campaign is GM-owned and we need Kael
//   owned by player1 and Sylara owned by player2, using the API would require
//   either making them own the campaign (wrong) or creating as GM (wrong ownerId).
//   Direct insert lets us set every field correctly while still populating the
//   exact same character_json schema the frontend GameEngine expects.

echo "Seeding characters...\n";

$now = time();

// ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
// CHARACTER 1: Kael Shadowstep
//   Race      : Human (SRD core)
//   Class     : Soulknife 7 (SRD psionics)
//   Alignment : Chaotic Neutral
//   Role      : Melee striker / psionic ambusher
//   Player    : Matthieu "Shadow" Renard
//
// BUILD NOTES (D&D 3.5 SRD):
//   Base: STR 16 / DEX 14 / CON 14 / INT 10 / WIS 12 / CHA 8
//   With Gloves of Dexterity +2 → effective DEX 16 (mod +3)
//   With Cloak of Resistance +1 → +1 to all saves
//
//   HP: 7d10 = 10+8+7+9+8+7+6 = 55 dice + CON 14(mod+2)×7 = 55+14 = 69 total
//   BAB: +5 (¾ progression, Soulknife 7)
//   AC: 10 + 4(mithral_shirt) + 3(DEX w/gloves) + 1(amulet_natural) + 1(ring_prot) = 19
//   Saves:
//     Fort  +2(base) + 2(CON) + 1(cloak) = +5  ← Soulknife Fort is Poor save; base +2 at level 7
//     Ref   +5(base) + 3(DEX) + 1(cloak) = +9
//     Will  +5(base) + 1(WIS) + 1(cloak) = +7
//   Initiative: +3(DEX) + 4(Improved Initiative) = +7
//
//   SOULKNIFE SPECIAL MECHANICS:
//   The Soulknife forges a Mind Blade from pure psionic energy — this is NOT a
//   psi-pool power. It requires no power points to manifest. It is always available
//   as a free action. The blade scales with Soulknife level:
//     +2 Mind Blade (Lv7 enhancement), Psychic Strike +2d8, Knife to the Soul.
//   Attacks with Weapon Finesse (DEX-to-hit for light blades), Two-Weapon Fighting.
//   Main hand: +2 Mind Blade (light blade, Finesse)
//   Off hand:  +2 Mind Blade (light blade, Finesse)
//
//   CLASS FEATURES (auto-granted by engine from class_soulknife levelProgression):
//     Lv1: Mind Blade, Weapon Focus (Mind Blade), Wild Talent
//     Lv2: Throw Mind Blade
//     Lv3: Psychic Strike +1d8
//     Lv4: +1 Mind Blade
//     Lv5: Free Draw, Shape Mind Blade
//     Lv6: Mind Blade Enhancement +1, Speed of Thought (bonus psionic feat)
//     Lv7: Psychic Strike +2d8
//
//   MANUALLY CHOSEN FEATS (stored in activeFeatures):
//     Lv1         : Two-Weapon Fighting (DEX 15 req ✓ — DEX 14 base + Gloves +2 = 16)
//     Lv1 (Human) : Improved Initiative (+4 init)
//     Lv3         : Psionic Body (+2 HP per psionic feat owned: Wild Talent, this feat = +4 HP)
//     Lv6         : Weapon Finesse (use DEX mod for Mind Blade attack rolls)
//
//   LANGUAGES: Common only (INT 10 = no bonus language slots)
//
//   SKILL POINTS: (4 base + 0 INT + 1 Human) × 4(1st lvl bonus) + (5 × 6) = 50 total
//     skill_autohypnosis  10 ranks → total +11 (WIS +1)
//     skill_concentration 10 ranks → total +12 (CON +2)
//     skill_tumble        10 ranks → total +13 (DEX +3 w/gloves; cross-class penalty
//                                               NOT applied if Tumble is a SK class skill)
//     skill_hide           7 ranks → total +10 (DEX +3 w/gloves)
//     skill_move_silently  7 ranks → total +10 (DEX +3 w/gloves)
//     skill_spot           6 ranks → total  +7 (WIS +1)
//     Total spent: 50 ✓
//
//   PERSONAL STORY:
//   Born in the slums of Thornhaven, Kael discovered his psionic gift at age 14
//   when he manifested a shimmering blade during a street brawl. Trained by a
//   wandering Soulknife mentor, he has spent years honing his craft as a blade-for-hire,
//   never staying anywhere long. He took the name "Shadowstep" after vanishing
//   from the Thieves' Guild he once served — the same guild that now hunts him.
//   Chaotic and self-reliant, Kael trusts no one completely, but the Arcane Council's
//   gold is good and the Crown of Binding won't retrieve itself.
//
//   PHYSICAL DESCRIPTION:
//   Height: 5'11" (180 cm) — lean, wiry build
//   Weight: 165 lb. (75 kg)
//   Age: 27
//   Eyes: Cold grey, constantly scanning
//   Hair: Short black, always slightly disheveled
//   Skin: Olive-tanned from years of outdoor work
// ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

$kaelData = [
    'id'         => 'char_kael_001',
    'name'       => 'Kael Shadowstep',
    'campaignId' => $campaignId,
    'ownerId'    => 'user_player1_001',
    'isNPC'      => false,
    'playerName' => 'Matthieu Renard',    // Real player name
    'customSubtitle' => 'Chaotic Neutral · Human Soulknife 7',

    // ── Notes / Personal Story ────────────────────────────────────────────
    'notes' => 'Born in the slums of Thornhaven, Kael discovered his psionic gift at age 14 '
              . 'when he manifested a shimmering blade of pure mental energy during a street brawl. '
              . 'Trained by a wandering Soulknife master who vanished one morning without explanation, '
              . 'he spent years as a blade-for-hire — never staying anywhere long enough to form '
              . 'attachments. He took the name "Shadowstep" after disappearing from the Thornhaven '
              . 'Thieves\' Guild he once served; the same guild whose captain now wants his head. '
              . "Chaotic and deeply self-reliant, Kael's loyalty is to the next paycheck and the "
              . "thrill of a clean vanish. The Arcane Council's gold is good, the mission is "
              . "interesting, and — if the Crown of Binding truly holds the undead armies in check — "
              . "maybe this one is worth seeing through to the end.",

    // ── Physical Traits ───────────────────────────────────────────────────
    'physicalTraits' => [
        'height' => "5'11\" (180 cm)",
        'weight' => '165 lb. (75 kg)',
        'age'    => '27',
        'eyes'   => 'Cold grey, always scanning',
        'hair'   => 'Short black, slightly disheveled',
        'skin'   => 'Olive-tanned',
    ],

    // ── Advancement ──────────────────────────────────────────────────────
    // classLevels is the authoritative multiclass map (DAG Phase 0 reads this).
    'classLevels'     => ['class_soulknife' => 7],
    // Humans can choose any favored class; Soulknife is this character's choice.
    'favoredClass'    => 'class_soulknife',
    'levelAdjustment' => 0,
    'xp'              => 21000, // mid-range level 7 (threshold is 21,000 for lvl 8)

    // ── Hit Die Results (stored, not recomputed) ─────────────────────────
    // Soulknife uses d10. Level 1 result is the maximum by house-rule convenience.
    // Levels 2-7 are realistic-ish rolls. Max HP = sum + (CON_mod × characterLevel).
    'hitDieResults' => [1 => 10, 2 => 8, 3 => 7, 4 => 9, 5 => 8, 6 => 7, 7 => 6],
    // Max HP = 55 dice + CON_mod(+2) × 7 levels = 55 + 14 = 69

    // ── Ability Scores (baseValue only; racial/item modifiers applied by engine) ──
    // Human has no racial stat adjustments, so base = effective total (before items).
    // Gloves of Dexterity +2 grant +2 enhancement (applied via item feature modifier).
    'attributes' => [
        'stat_strength'     => ['baseValue' => 16],  // Melee damage
        'stat_dexterity'    => ['baseValue' => 14],  // +2 from Gloves = 16 effective (mod +3)
        'stat_constitution' => ['baseValue' => 14],  // mod +2 → HP and Fort
        'stat_intelligence' => ['baseValue' => 10],  // mod 0  → no bonus languages
        'stat_wisdom'       => ['baseValue' => 12],  // mod +1 → Will save, Autohypnosis
        'stat_charisma'     => ['baseValue' =>  8],  // mod -1 → dump stat
    ],

    // ── Skill Ranks (stored; engine adds ability mod + class-skill bonuses) ─
    'skills' => [
        'skill_autohypnosis'  => ['ranks' => 10],
        'skill_concentration' => ['ranks' => 10],
        'skill_tumble'        => ['ranks' => 10],
        'skill_hide'          => ['ranks' =>  7],
        'skill_move_silently' => ['ranks' =>  7],
        'skill_spot'          => ['ranks' =>  6],
    ],

    // Rank floors (committed level-up decisions — cannot be lowered).
    'minimumSkillRanks' => [
        'skill_autohypnosis'  => 10,
        'skill_concentration' => 10,
        'skill_tumble'        => 10,
        'skill_hide'          =>  7,
        'skill_move_silently' =>  7,
        'skill_spot'          =>  6,
    ],

    // ── Resources (current play-state) ───────────────────────────────────
    // res_hp currentValue = max HP at session start (fully healed).
    'resources' => [
        'res_hp' => ['currentValue' => 69, 'temporaryValue' => 0],
    ],

    // ── Active Feature Instances ──────────────────────────────────────────
    // Convention for instanceId: "afi_<shortName>_<characterSlug>"
    // isActive: true  = feature contributes its modifiers to the DAG pipeline
    // isActive: false = item carried but not worn/wielded (weight counts, bonuses don't)
    'activeFeatures' => [
        // ── Race ──────────────────────────────────────────────────────────
        // race_human grants: +1 skill point/lvl, +1 bonus feat slot, +4 bonus SP at 1st.
        ['instanceId' => 'afi_race_kael',  'featureId' => 'race_human',    'isActive' => true],

        // ── Class ─────────────────────────────────────────────────────────
        // class_soulknife levelProgression (up to level 7) is resolved by the
        // GameEngine, which auto-grants class features listed in grantedFeatures
        // arrays (Mind Blade, Wild Talent, Speed of Thought, etc.).
        // NOTE: Soulknife does NOT use psi-pool — the Mind Blade is a class feature,
        // not a psionic power. All Soulknife abilities are at-will or per-encounter.
        ['instanceId' => 'afi_class_kael', 'featureId' => 'class_soulknife', 'isActive' => true],

        // ── Alignment ─────────────────────────────────────────────────────
        // Chaotic Neutral: freedom over law, neither good nor evil.
        // Relevant for spell interactions (e.g. Holy Avenger, Detect Evil/Good).
        ['instanceId' => 'afi_alignment_kael', 'featureId' => 'alignment_chaotic_neutral', 'isActive' => true],

        // ── Language ──────────────────────────────────────────────────────
        // Human automatically speaks Common. INT 10 = 0 bonus language slots.
        ['instanceId' => 'afi_lang_common_kael', 'featureId' => 'language_common', 'isActive' => true],

        // ── Manually Chosen Feats ─────────────────────────────────────────
        // These are player-selected general feat slots + human bonus feat slot.
        // Class bonus feats (Wild Talent, Speed of Thought) are auto-granted above.
        ['instanceId' => 'afi_twf_kael',   'featureId' => 'feat_two_weapon_fighting',  'isActive' => true],
        ['instanceId' => 'afi_ii_kael',    'featureId' => 'feat_improved_initiative',   'isActive' => true],
        ['instanceId' => 'afi_pb_kael',    'featureId' => 'feat_psionic_body',          'isActive' => true],
        ['instanceId' => 'afi_wfin_kael',  'featureId' => 'feat_weapon_finesse',        'isActive' => true],

        // ── Equipped Magic Items (isActive: true = stat bonuses applied) ───
        // Mithral Shirt: AC +4 (Light armor), max DEX bonus +6, ACP 0, arcane failure 10%.
        //   Chosen over heavier armors because the Soulknife benefits from full DEX.
        ['instanceId' => 'afi_armor_kael',  'featureId' => 'item_armor_specific_mithral_shirt', 'isActive' => true],
        // Amulet of Natural Armor +1: +1 natural armor to AC.
        ['instanceId' => 'afi_amulet_kael', 'featureId' => 'item_amulet_of_natural_armor_1',    'isActive' => true],
        // Ring of Protection +1: +1 deflection bonus to AC.
        ['instanceId' => 'afi_ring_kael',   'featureId' => 'item_ring_protection_1',             'isActive' => true],
        // Cloak of Resistance +1: +1 resistance bonus to all saves.
        ['instanceId' => 'afi_cloak_kael',  'featureId' => 'item_cloak_of_resistance_1',         'isActive' => true],
        // Gloves of Dexterity +2: +2 enhancement to DEX (raises effective DEX to 16, mod +3).
        ['instanceId' => 'afi_gloves_kael', 'featureId' => 'item_gloves_of_dexterity_2',         'isActive' => true],

        // ── Backpack / Carried Gear (isActive: false = weight counts, no bonuses) ──
        // Standard adventurer loadout for a level 7 character on a dungeon crawl.
        ['instanceId' => 'afi_dagger_kael',   'featureId' => 'item_dagger',         'isActive' => false], // backup sidearm
        ['instanceId' => 'afi_bp_kael',       'featureId' => 'item_backpack',       'isActive' => false],
        ['instanceId' => 'afi_rope_kael',     'featureId' => 'item_rope_hempen',    'isActive' => false], // 50 ft
        ['instanceId' => 'afi_bedroll_kael',  'featureId' => 'item_bedroll',        'isActive' => false],
        ['instanceId' => 'afi_rations_kael',  'featureId' => 'item_rations_trail',  'isActive' => false], // 7 days
        ['instanceId' => 'afi_torch_kael',    'featureId' => 'item_torch',          'isActive' => false], // ×3
        ['instanceId' => 'afi_water_kael',    'featureId' => 'item_waterskin',      'isActive' => false],
        ['instanceId' => 'afi_flint_kael',    'featureId' => 'item_flint_and_steel','isActive' => false],
        ['instanceId' => 'afi_healer_kael',   'featureId' => 'item_healers_kit',    'isActive' => false], // 10 uses
        ['instanceId' => 'afi_grapple_kael',  'featureId' => 'item_grappling_hook', 'isActive' => false],
    ],

    // ── Linked Entities ───────────────────────────────────────────────────
    // No animal companion or familiar for this character.
    'linkedEntities' => [],

    // ── Wealth (coin purse after purchasing equipment) ────────────────────
    // WBL for level 7 = ~19,000 gp. Remaining after gear purchases (~11,300 gp spent).
    'wealth' => ['cp' => 0, 'sp' => 0, 'gp' => 1850, 'pp' => 0],
];

// ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
// CHARACTER 2: Sylara Moonwhisper
//   Race      : Elf (SRD core)
//   Class     : Druid 7 (SRD core)
//   Alignment : Neutral Good
//   Role      : Divine caster / nature controller / healer
//   Player    : Sophie Delacourt
//
// BUILD NOTES (D&D 3.5 SRD):
//   Base: STR 10 / DEX 14 / CON 14 / INT 12 / WIS 16 / CHA 10
//   Elf racial: +2 DEX → effective DEX 16 (mod +3)
//   Elf racial: -2 CON → effective CON 12 (mod +1)
//   Periapt of Wisdom +2 → effective WIS 18 (mod +4)
//   Cloak of Resistance +2 → +2 to all saves
//
//   HP: 7d8 = 8+6+7+5+8+6+7 = 47 dice + CON_mod(+1) × 7 = 47 + 7 = 54 total
//   BAB: +5 (¾ progression, Druid 7)
//   AC: 10 + 5(rhino_hide) + 2(darkwood_shield) + 3(DEX — Rhino Hide maxDex +4, no cap)
//       + 1(amulet_natural) + 1(ring_prot) = 22
//   Saves (with Cloak of Resistance +2):
//     Fort  +5(base) + 1(CON) + 2(cloak) = +8
//     Ref   +2(base) + 3(DEX) + 2(cloak) = +7
//     Will  +5(base) + 4(WIS) + 2(cloak) = +11
//
//   CLASS FEATURES (auto-granted by engine from class_druid levelProgression):
//     Lv1: Animal Companion, Nature Sense, Wild Empathy, Druid Spellcasting
//     Lv2: Woodland Stride
//     Lv3: Trackless Step
//     Lv4: Resist Nature's Lure
//     Lv5: Wild Shape (Small/Medium, 1/day)
//     Lv6: Wild Shape (2/day)
//     Lv7: Wild Shape (3/day)
//
//   MANUALLY CHOSEN FEATS (stored in activeFeatures):
//     Lv1: Natural Spell  (cast spells in Wild Shape — essential for a druid)
//     Lv3: Spell Focus (Conjuration)  (prerequisite for Augment Summoning)
//     Lv6: Augment Summoning  (+4 STR/CON to summoned creatures)
//
//   SPELL SLOTS (Druid 7, WIS 18 = mod +4 → +1 bonus spell per level 1-4):
//     0th: 6/day (cantrips; no WIS bonus on 0-level slots)
//     1st: 4 + 1(WIS bonus) = 5/day
//     2nd: 3 + 1(WIS bonus) = 4/day
//     3rd: 2 + 1(WIS bonus) = 3/day
//     4th: 1 + 1(WIS bonus) = 2/day
//
//   LANGUAGES:
//     Elven racial automatic: Common, Elvish, Sylvan, Druidic (class)
//     INT 12 = mod +1 → 1 bonus language slot → Draconic (for ancient ruins)
//
//   SKILL POINTS: (4 base + 1 INT + 0 Elf) × 4(1st) + (5 × 6) = 50 total
//     skill_concentration    10 ranks → total +11 (CON 12, mod +1)
//     skill_knowledge_nature 10 ranks → total +11 (INT 12, mod +1) — class skill
//     skill_spellcraft       10 ranks → total +11 (INT 12, mod +1) — class skill
//     skill_survival         10 ranks → total +14 (WIS 18, mod +4) — class skill
//     skill_spot              5 ranks → total  +9 (WIS +4; Elf racial +2 = +11 total)
//     skill_listen            5 ranks → total  +9 (WIS +4; Elf racial +2 = +11 total)
//     Total spent: 50 ✓
//
//   PERSONAL STORY:
//   Sylara grew up among the ancient elven forest enclaves of the Deepwood — the same
//   forest now corrupted in Chapter 2. She left her people after a fire elemental
//   summoned by a young apprentice (her mistake, her fire) destroyed a sacred grove.
//   Carrying that guilt, she joined the Arcane Council's naturalists to learn how to
//   prevent such disasters. Her druidic vow of atonement — Neutral Good, serving the
//   greater good through nature — drives her every action. The corruption spreading
//   through the Deepwood is personal. The Crown of Binding must be stopped before
//   the undead armies reach the last living forests.
//
//   PHYSICAL DESCRIPTION:
//   Height: 5'6" (168 cm) — graceful, slightly taller than average for elves
//   Weight: 110 lb. (50 kg)
//   Age: 142 (appears mid-20s by human standards)
//   Eyes: Silver-violet, shifting slightly in moonlight
//   Hair: Silver-white, long and braided with tiny silver oak-leaf charms
//   Skin: Pale silver-grey, bears a burn scar on her left forearm
// ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

$sylaraData = [
    'id'         => 'char_sylara_001',
    'name'       => 'Sylara Moonwhisper',
    'campaignId' => $campaignId,
    'ownerId'    => 'user_player2_001',
    'isNPC'      => false,
    'playerName' => 'Sophie Delacourt',   // Real player name
    'customSubtitle' => 'Neutral Good · Elf Druid 7',

    // ── Notes / Personal Story ────────────────────────────────────────────
    'notes' => 'Sylara grew up among the ancient elven enclaves deep within the Deepwood — '
              . 'the same forest now slowly dying under psionic and undead corruption. She left '
              . 'her people after a summoning accident during her apprenticeship burned a sacred grove. '
              . 'The fire elemental was her mistake; the devastation her burden. '
              . "Driven by guilt, she joined the Arcane Council's naturalists to master protective "
              . 'druidic techniques, earning her place among the adventuring party sent to recover '
              . 'the Crown of Binding. The corrupted Deepwood is personal — its suffering is her '
              . 'fault by proxy. Her vow is simple: restore what was broken, protect what remains, '
              . "and ensure no one else's mistake becomes the world's ruin.",

    // ── Physical Traits ───────────────────────────────────────────────────
    'physicalTraits' => [
        'height' => "5'6\" (168 cm)",
        'weight' => '110 lb. (50 kg)',
        'age'    => '142 (appears mid-20s)',
        'eyes'   => 'Silver-violet, moonlight-shifting',
        'hair'   => 'Silver-white, braided with oak-leaf charms',
        'skin'   => 'Pale silver-grey, burn scar on left forearm',
    ],

    // ── Advancement ──────────────────────────────────────────────────────
    'classLevels'     => ['class_druid' => 7],
    // Elf favored class in D&D 3.5 is Wizard, but this character ignores that
    // (single-classed Druid 7, so no XP penalty regardless of favored class).
    'favoredClass'    => 'class_druid',
    'levelAdjustment' => 0,
    'xp'              => 21000,

    // ── Hit Die Results ───────────────────────────────────────────────────
    // Druid uses d8. Average to good rolls across levels.
    'hitDieResults' => [1 => 8, 2 => 6, 3 => 7, 4 => 5, 5 => 8, 6 => 6, 7 => 7],
    // Max HP = 47 dice + CON_mod(+1) × 7 levels = 47 + 7 = 54

    // ── Ability Scores (baseValue before racial adjustments) ──────────────
    // Elf racial: +2 DEX, -2 CON (applied by race_elf feature modifiers in engine).
    // Periapt of Wisdom +2: +2 enhancement to WIS (applied by item feature).
    'attributes' => [
        'stat_strength'     => ['baseValue' => 10],  // mod  0  → average melee
        'stat_dexterity'    => ['baseValue' => 14],  // +2 racial = 16 effective (mod +3)
        'stat_constitution' => ['baseValue' => 14],  // -2 racial = 12 effective (mod +1) → HP/Fort
        'stat_intelligence' => ['baseValue' => 12],  // mod +1 → 1 bonus language slot
        'stat_wisdom'       => ['baseValue' => 16],  // +2 Periapt = 18 effective (mod +4) → spells/Will
        'stat_charisma'     => ['baseValue' => 10],  // mod  0  → Wild Empathy baseline
    ],

    // ── Skill Ranks ───────────────────────────────────────────────────────
    'skills' => [
        'skill_concentration'   => ['ranks' => 10],
        'skill_knowledge_nature'=> ['ranks' => 10],
        'skill_spellcraft'      => ['ranks' => 10],
        'skill_survival'        => ['ranks' => 10],
        'skill_spot'            => ['ranks' =>  5],
        'skill_listen'          => ['ranks' =>  5],
    ],

    'minimumSkillRanks' => [
        'skill_concentration'   => 10,
        'skill_knowledge_nature'=> 10,
        'skill_spellcraft'      => 10,
        'skill_survival'        => 10,
        'skill_spot'            =>  5,
        'skill_listen'          =>  5,
    ],

    // ── Resources ─────────────────────────────────────────────────────────
    'resources' => [
        'res_hp' => ['currentValue' => 54, 'temporaryValue' => 0],
    ],

    // ── Active Feature Instances ──────────────────────────────────────────
    'activeFeatures' => [
        // ── Race ──────────────────────────────────────────────────────────
        // race_elf grants: +2 DEX, -2 CON, low-light vision, immunity to magic sleep,
        // +2 saves vs. enchantments, Spot/Listen/Search racial bonuses,
        // Elven weapon proficiency (longsword, rapier, elven composite shortbow).
        ['instanceId' => 'afi_race_sylara',  'featureId' => 'race_elf',   'isActive' => true],

        // ── Class ─────────────────────────────────────────────────────────
        // class_druid levelProgression (up to level 7) is resolved by the engine.
        // Auto-grants: Animal Companion, Woodland Stride, Wild Shape, etc.
        ['instanceId' => 'afi_class_sylara', 'featureId' => 'class_druid', 'isActive' => true],

        // ── Alignment ─────────────────────────────────────────────────────
        // Neutral Good: protects nature and the innocent without rigid codes.
        // Relevant for spell interactions (alignment-dependent features).
        // Druids must be neutral on at least one axis — NG qualifies (Neutral on law/chaos).
        ['instanceId' => 'afi_alignment_sylara', 'featureId' => 'alignment_neutral_good', 'isActive' => true],

        // ── Languages ─────────────────────────────────────────────────────
        // Elves automatically know Common and Elvish (via race_elf grantedFeatures).
        // Druids automatically know Druidic (via class_druid grantedFeatures).
        // Elves also know Sylvan as a bonus language (auto-granted by race).
        // INT 12 = mod +1 → 1 bonus language slot → Draconic (useful for ancient ruins).
        ['instanceId' => 'afi_lang_common_sylara',  'featureId' => 'language_common',  'isActive' => true],
        ['instanceId' => 'afi_lang_elven_sylara',   'featureId' => 'language_elven',   'isActive' => true],
        ['instanceId' => 'afi_lang_sylvan_sylara',  'featureId' => 'language_sylvan',  'isActive' => true],
        ['instanceId' => 'afi_lang_draconic_sylara','featureId' => 'language_draconic','isActive' => true], // INT bonus slot

        // ── Manually Chosen Feats ─────────────────────────────────────────
        // Natural Spell: allows spellcasting in Wild Shape form — core druid feat.
        ['instanceId' => 'afi_ns_sylara',   'featureId' => 'feat_natural_spell',     'isActive' => true],
        // Spell Focus (Conjuration): +1 DC to Conjuration spells; prerequisite for
        // Augment Summoning.
        ['instanceId' => 'afi_sf_sylara',   'featureId' => 'feat_spell_focus',       'isActive' => true],
        // Augment Summoning: summoned creatures gain +4 STR and +4 CON.
        // Requires Spell Focus (Conjuration). Dramatically improves summon nature's ally.
        ['instanceId' => 'afi_as_sylara',   'featureId' => 'feat_augment_summoning', 'isActive' => true],

        // ── Equipped Magic Items ───────────────────────────────────────────
        // Rhino Hide: unique named non-metal medium armor (druid-legal, no arcane failure).
        //   AC +5 (armor type; base hide +3 + enhancement +2), max DEX +4, ACP -1. Price: 5,165 gp.
        //   Deals +2d6 on any successful charge attack made by the wearer (SRD).
        ['instanceId' => 'afi_armor_sylara',   'featureId' => 'item_armor_specific_rhino_hide',       'isActive' => true],
        // Darkwood Shield: wooden heavy shield (druid-legal, no metal).
        //   AC +2 shield bonus. Darkwood is masterwork; ACP reduced to 0.
        ['instanceId' => 'afi_shield_sylara',  'featureId' => 'item_shield_specific_darkwood_shield', 'isActive' => true],
        // Amulet of Natural Armor +1: +1 natural armor bonus to AC.
        ['instanceId' => 'afi_amulet_sylara',  'featureId' => 'item_amulet_of_natural_armor_1',       'isActive' => true],
        // Ring of Protection +1: +1 deflection bonus to AC.
        ['instanceId' => 'afi_ring_sylara',    'featureId' => 'item_ring_protection_1',                'isActive' => true],
        // Cloak of Resistance +2: +2 resistance bonus to all saves.
        ['instanceId' => 'afi_cloak_sylara',   'featureId' => 'item_cloak_of_resistance_2',           'isActive' => true],
        // Periapt of Wisdom +2: +2 enhancement to WIS (raises WIS to 18, mod +4;
        //   +1 DC to all druid spells, +1 bonus spell per level 1-4).
        ['instanceId' => 'afi_periapt_sylara', 'featureId' => 'item_periapt_of_wisdom_2',             'isActive' => true],

        // ── Readied Items ─────────────────────────────────────────────────
        // Wand of Cure Light Wounds: 50 charges remaining.
        //   Used out of combat to conserve prepared spell slots.
        //   itemResourcePools tracks per-instance charges (see ARCHITECTURE.md §5.7).
        [
            'instanceId'        => 'afi_wand_sylara',
            'featureId'         => 'item_wand_cure_light_wounds',
            'isActive'          => false,
            'itemResourcePools' => ['charges' => 50],
        ],

        // ── Backpack / Carried Gear ───────────────────────────────────────
        // Scimitar (backup weapon when not wild-shaped — druids are proficient).
        ['instanceId' => 'afi_scimitar_sylara', 'featureId' => 'item_scimitar',        'isActive' => false],
        ['instanceId' => 'afi_bp_sylara',       'featureId' => 'item_backpack',        'isActive' => false],
        ['instanceId' => 'afi_rope_sylara',     'featureId' => 'item_rope_hempen',     'isActive' => false],
        ['instanceId' => 'afi_bedroll_sylara',  'featureId' => 'item_bedroll',         'isActive' => false],
        ['instanceId' => 'afi_rations_sylara',  'featureId' => 'item_rations_trail',   'isActive' => false], // 7 days
        ['instanceId' => 'afi_torch_sylara',    'featureId' => 'item_torch',           'isActive' => false], // ×3
        ['instanceId' => 'afi_water_sylara',    'featureId' => 'item_waterskin',       'isActive' => false],
        ['instanceId' => 'afi_flint_sylara',    'featureId' => 'item_flint_and_steel', 'isActive' => false],
        ['instanceId' => 'afi_healer_sylara',   'featureId' => 'item_healers_kit',     'isActive' => false], // 10 uses
    ],

    // ── Linked Entities ───────────────────────────────────────────────────
    // Druid's animal companion would be modeled as a LinkedEntity with its own
    // character data. Omitted here for simplicity; the GM can add it later.
    'linkedEntities' => [],

    // ── Wealth ───────────────────────────────────────────────────────────
    // WBL ~19,000 gp. Most spent on Rhino Hide (5,165 gp), Periapt of Wisdom +2 (4,000 gp),
    // Cloak of Resistance +2 (4,000 gp), darkwood shield, amulet, ring.
    // Remaining: ~420 gp for consumables and travel expenses.
    'wealth' => ['cp' => 0, 'sp' => 0, 'gp' => 420, 'pp' => 0],
];

// ── Insert characters into the DB ──────────────────────────────────────────
$stmtChar = $db->prepare('
    INSERT INTO characters
        (id, campaign_id, owner_id, name, is_npc, npc_type, character_json, gm_overrides_json, updated_at)
    VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
');

$characters = [
    ['data' => $kaelData,   'label' => 'Human Soulknife 7 (Chaotic Neutral)'],
    ['data' => $sylaraData, 'label' => 'Elf Druid 7 (Neutral Good)'],
];

foreach ($characters as $entry) {
    $d = $entry['data'];
    $stmtChar->execute([
        $d['id'],
        $d['campaignId'],
        $d['ownerId'],
        $d['name'],
        0,    // is_npc = false
        null, // npc_type = null for player characters
        json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        '[]', // gm_overrides_json — GM can add overrides via the dashboard later
        $now,
    ]);
    echo "  ✅ Created [{$entry['label']}] {$d['name']} (owner: {$d['ownerId']})\n";
}

// ============================================================
// STEP 6 — TEMPLATES (NPC + Monster blueprints for the GM)
// ============================================================
// Seed two demo NPC templates and one Monster template so the GM can
// immediately test the "Spawn NPC" / "Spawn Monster" vault buttons.
//
// WHY DIRECT INSERT (not TemplateController)?
//   TemplateController::create() expects the request body via php://input,
//   which would require the SeedInputStream stream wrapper.  Direct DB insert
//   is cleaner for seed data since we control the full JSON blob.

echo "Seeding templates...\n";

$stmtTemplate = $db->prepare('
    INSERT INTO templates
        (id, type, owner_id, name, template_json, updated_at)
    VALUES
        (?, ?, ?, ?, ?, ?)
');

// ── Template 1: Tavern Keeper (NPC) ─────────────────────────────────────────
// A friendly civilian NPC with no combat stats — useful for roleplay encounters.
$tavernKeeperId = 'tmpl_tavern_keeper_001';
$tavernKeeperData = [
    'id'           => $tavernKeeperId,
    'name'         => 'Tavern Keeper',
    'isNPC'        => true,
    'npcType'      => 'npc',
    'isTemplate'   => true,
    'ownerId'      => 'user_gm_001',
    'classLevels'  => [],
    'activeFeatures' => [],
    'attributes'   => [],
    'skills'       => [],
    'resources'    => [],
    'combatStats'  => [],
    'saves'        => [],
    'linkedEntities' => [],
    'levelAdjustment' => 0,
    'xp'           => 0,
    'notes'        => 'Friendly innkeeper. Knows local gossip. Has a soft spot for adventurers.',
];
$stmtTemplate->execute([
    $tavernKeeperId,
    'npc',
    'user_gm_001',
    'Tavern Keeper',
    json_encode($tavernKeeperData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    $now,
]);
echo "  ✅ Created [NPC Template] Tavern Keeper\n";

// ── Template 2: Guild Informant (NPC) ────────────────────────────────────────
// An NPC contact who can sell information to the party.
$informantId = 'tmpl_guild_informant_001';
$informantData = [
    'id'           => $informantId,
    'name'         => 'Guild Informant',
    'isNPC'        => true,
    'npcType'      => 'npc',
    'isTemplate'   => true,
    'ownerId'      => 'user_gm_001',
    'classLevels'  => [],
    'activeFeatures' => [],
    'attributes'   => [],
    'skills'       => [],
    'resources'    => [],
    'combatStats'  => [],
    'saves'        => [],
    'linkedEntities' => [],
    'levelAdjustment' => 0,
    'xp'           => 0,
    'notes'        => 'Shady contact inside the Thornhaven Thieves Guild. Will sell secrets for the right price.',
];
$stmtTemplate->execute([
    $informantId,
    'npc',
    'user_gm_001',
    'Guild Informant',
    json_encode($informantData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    $now,
]);
echo "  ✅ Created [NPC Template] Guild Informant\n";

// ── Template 3: Wolf (Monster) ───────────────────────────────────────────────
// A standard D&D 3.5 SRD wolf: HD 2d8+4, AC 14, Bite +3 (1d6+1), Trip.
// The GM can spawn multiple instances with custom names (e.g., "Wolfie", "Alpha").
$wolfId = 'tmpl_wolf_001';
$wolfData = [
    'id'           => $wolfId,
    'name'         => 'Wolf',
    'isNPC'        => true,
    'npcType'      => 'monster',
    'isTemplate'   => true,
    'ownerId'      => 'user_gm_001',
    'classLevels'  => [],
    'activeFeatures' => [],
    'attributes'   => [],
    'skills'       => [],
    'resources'    => [],
    'combatStats'  => [],
    'saves'        => [],
    'linkedEntities' => [],
    'levelAdjustment' => 0,
    'xp'           => 0,
    'notes'        => 'SRD Wolf. HD 2d8+4 (13 hp). AC 14. Bite +3 (1d6+1). Trip attack. Speed 50 ft.',
];
$stmtTemplate->execute([
    $wolfId,
    'monster',
    'user_gm_001',
    'Wolf',
    json_encode($wolfData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    $now,
]);
echo "  ✅ Created [Monster Template] Wolf\n\n";

// ============================================================
// SEED COMPLETE
// ============================================================
echo "\n✅ Seed complete. Database is ready for development.\n\n";
echo "─────────────────────────────────────────────────────\n";
echo "  Login at  http://localhost:5173/login\n";
echo "─────────────────────────────────────────────────────\n";
echo "  admin     →  username: admin    /  password: admin\n";
echo "  GM        →  username: gm       /  password: gm\n";
echo "  Player 1  →  username: player1  /  password: player1\n";
echo "  Player 2  →  username: player2  /  password: player2\n";
echo "─────────────────────────────────────────────────────\n";
echo "  Campaign  →  The Shattered Throne (5 chapters, 31 tasks)\n";
echo "  Char 1    →  Kael Shadowstep    — Human Soulknife 7  (player: Matthieu) — Chaotic Neutral\n";
echo "  Char 2    →  Sylara Moonwhisper — Elf Druid 7      (player: Sophie)   — Neutral Good\n";
echo "  Template  →  [NPC]     Tavern Keeper\n";
echo "  Template  →  [NPC]     Guild Informant\n";
echo "  Template  →  [Monster] Wolf\n";
echo "─────────────────────────────────────────────────────\n\n";
