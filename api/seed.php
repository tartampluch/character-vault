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
$db->prepare('
    INSERT INTO campaigns
        (id, title, description, owner_id, chapters_json, enabled_rule_sources_json, gm_global_overrides_text, updated_at)
    VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
')->execute([
    $campaignId,
    'The Shattered Throne',
    'When the Crown of Binding is stolen from the Vault of Ages, a group of unlikely heroes must pursue its thief through labyrinthine city streets, haunted ruins, flooded ancient cities, and a storm-wracked lich fortress—before an unkillable evil reclaims its seat of power. A complete 1-shot adventure for four 7th-level characters.',
    'user_gm_001',
    '[]',
    json_encode($allRuleSources),
    '[]',
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
        'title'       => ['en' => 'Chapter 1: Blood on the Cobblestones', 'fr' => 'Chapitre 1 : Sang sur les pavés'],
        'description' => [
            'en' => 'The party is summoned to the Arcane Council Hall, where Magister Aldeth Crane reveals that the Crown of Binding has been stolen from the Vault of Ages. Evidence at the crime scene points to the Thornhaven Thieves\' Guild. The party must infiltrate the guild, defeat its ruthless captain, and recover the encoded cipher that leads to the next leg of the trail.',
            'fr' => 'Le groupe est convoqué au Conseil des Arcanes, où le Magister Aldeth Crane révèle que la Couronne du Lien a été volée de la Chambre des Âges. Les preuves sur les lieux du crime pointent vers la Guilde des Voleurs de Thornhaven.',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_01_01',
                'title'       => ['en' => 'Report to Magister Aldeth Crane at the Arcane Council Hall', 'fr' => 'Se présenter au Magister Aldeth Crane à la Salle du Conseil des Arcanes'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_02',
                'title'       => ['en' => 'Examine the crime scene inside the Vault of Ages', 'fr' => 'Examiner la scène de crime dans la Chambre des Âges'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_03',
                'title'       => ['en' => 'Question the sole surviving vault guard, Harkin One-Eye', 'fr' => 'Interroger l\'unique garde survivant de la chambre forte, Harkin l\'Œil-de-Verre'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_04',
                'title'       => ['en' => 'Track down fence Mordecai the Grey in the Underbazaar and learn the guild connection', 'fr' => 'Retrouver le receleur Mordecai le Gris à l\'Underbazaar et découvrir le lien avec la guilde'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_05',
                'title'       => ['en' => 'Infiltrate the Thornhaven Thieves\' Guild through the tannery safe house', 'fr' => 'Infiltrer la Guilde des Voleurs de Thornhaven via la planque de la tannerie'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_06',
                'title'       => ['en' => 'Defeat Guild Captain Rendak the Swift and her elite shadowblades', 'fr' => 'Vaincre la Capitaine de Guilde Rendak la Rapide et ses ombres d\'élite'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_01_07',
                'title'       => ['en' => 'Recover the stolen cipher from Rendak\'s warded strongbox', 'fr' => 'Récupérer le chiffre volé dans le coffre protégé de Rendak'],
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
        'title'       => ['en' => 'Chapter 2: Whispers in the Deepwood', 'fr' => 'Chapitre 2 : Murmures dans la Forêt Profonde'],
        'description' => [
            'en' => 'Decoding the cipher reveals a path through the Haunted Deepwood, a forest warped by ancient fey magic. At its heart lie the ruins of Elara\'s Watch, an elven outpost that fell a thousand years ago. The party must navigate fey traps, bypass undead sentinels, and claim the Shard of Resonance—a key needed to enter the Sunken City hidden beneath the wood.',
            'fr' => 'Le déchiffrement du code révèle un chemin à travers la Forêt Profonde Hantée, une forêt tordue par une ancienne magie fée. En son cœur se trouvent les ruines d\'Elara\'s Watch, un avant-poste elfique tombé il y a mille ans.',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_02_01',
                'title'       => ['en' => 'Decode the guild cipher to map the safe path through the Deepwood', 'fr' => 'Décoder le chiffre de la guilde pour tracer le chemin sûr à travers la Forêt Profonde'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_02',
                'title'       => ['en' => 'Survive the three-night journey through the Haunted Deepwood without triggering the fey wards', 'fr' => 'Survivre au voyage de trois nuits à travers la Forêt Profonde Hantée sans déclencher les protections féeriques'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_03',
                'title'       => ['en' => 'Locate the fallen elven watchtower, Elara\'s Watch, hidden beneath centuries of overgrowth', 'fr' => 'Localiser la tour de guet elfique en ruine, Elara\'s Watch, cachée sous des siècles de végétation'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_04',
                'title'       => ['en' => 'Solve the harmonic resonance puzzle to unlock the inner sanctum', 'fr' => 'Résoudre le puzzle de résonance harmonique pour débloquer le sanctuaire intérieur'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_05',
                'title'       => ['en' => 'Defeat the Bone Sentinel, guardian of the sanctum', 'fr' => 'Vaincre la Sentinelle d\'Os, gardienne du sanctuaire'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_02_06',
                'title'       => ['en' => 'Retrieve the Shard of Resonance from the sanctum altar', 'fr' => 'Récupérer l\'Éclat de Résonance sur l\'autel du sanctuaire'],
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
        'title'       => ['en' => 'Chapter 3: The Sunken City', 'fr' => 'Chapitre 3 : La Cité Engloutie'],
        'description' => [
            'en' => 'The Shard of Resonance vibrates in proximity to a hidden entrance leading down into the drowned streets of Ahnkora—a metropolis flooded two centuries ago when its mages tore open a planar rift. An aboleth claims the dark water as its domain, and somewhere in the collapsed library district, the enigmatic mind flayer Vox has mapped the Lich-King\'s fortress. The party must navigate without becoming a meal.',
            'fr' => 'L\'Éclat de Résonance vibre à proximité d\'une entrée cachée menant dans les rues noyées d\'Ahnkora, une métropole inondée il y a deux siècles lorsque ses mages ont ouvert une déchirure planaire. Un aboleth revendique les eaux sombres comme son domaine.',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_03_01',
                'title'       => ['en' => 'Use the Shard of Resonance to reveal the hidden subterranean entrance to Ahnkora', 'fr' => 'Utiliser l\'Éclat de Résonance pour révéler l\'entrée souterraine cachée menant à Ahnkora'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_02',
                'title'       => ['en' => 'Navigate the flooded outer districts while avoiding aboleth patrol tentacles', 'fr' => 'Naviguer dans les districts extérieurs inondés en évitant les tentacules de patrouille de l\'aboleth'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_03',
                'title'       => ['en' => 'Survive the sahuagin ambush in the drowned market district', 'fr' => 'Survivre à l\'embuscade sahuagin dans le quartier commerçant noyé'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_04',
                'title'       => ['en' => 'Locate the mind flayer Vox in the collapsed archive and open negotiations', 'fr' => 'Localiser l\'illithide Vox dans les archives effondrées et entamer des négociations'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_05',
                'title'       => ['en' => 'Obtain the Map of the Storm Fortress from Vox in exchange for a psionic service', 'fr' => 'Obtenir la Carte de la Forteresse Tempête auprès de Vox en échange d\'un service psionic'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_03_06',
                'title'       => ['en' => 'Escape Ahnkora through the sea caves before the aboleth collapses the remaining support columns', 'fr' => 'Fuir Ahnkora par les grottes marines avant que l\'aboleth ne détruise les colonnes de soutien restantes'],
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
        'title'       => ['en' => 'Chapter 4: The Storm Fortress', 'fr' => 'Chapitre 4 : La Forteresse Tempête'],
        'description' => [
            'en' => 'Vox\'s map leads to a storm-wracked promontory where the Lich-King Morveth the Pale has carved his fortress into the living rock above a churning sea. The party must scale the howling cliffs, bypass animated golem sentinels, locate and free the captured Magister Aldeth Crane, and fight floor-by-floor through the inner keep to reach the throne room—without alerting Morveth until the very last moment.',
            'fr' => 'La carte de Vox mène à un promontoire balayé par les tempêtes où le Liche-Roi Morveth le Pâle a taillé sa forteresse dans la roche vive au-dessus d\'une mer agitée.',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_04_01',
                'title'       => ['en' => 'Scale the Cliffs of the Howling Wind using the routes marked on Vox\'s map', 'fr' => 'Escalader les Falaises du Vent Hurlant en utilisant les routes marquées sur la carte de Vox'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_02',
                'title'       => ['en' => 'Disable or bypass the outer gatehouse and its pair of iron golem sentinels', 'fr' => 'Désactiver ou contourner la guérite extérieure et ses deux sentinelles de golem de fer'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_03',
                'title'       => ['en' => 'Find the imprisonment cells in the tower undercroft and free Magister Aldeth Crane', 'fr' => 'Trouver les cellules d\'emprisonnement dans le sous-sol de la tour et libérer le Magister Aldeth Crane'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_04',
                'title'       => ['en' => 'Fight through three floors of Morveth\'s elite undead honor guard to reach the great hall', 'fr' => 'Combattre à travers trois étages de la garde d\'honneur morte-vivante d\'élite de Morveth pour atteindre la grande salle'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_05',
                'title'       => ['en' => 'Defeat the Deathknight Commander Serath and claim the Sigil Key to the throne room', 'fr' => 'Vaincre le Commandant Chevalier de la Mort Serath et s\'emparer de la Clé Sigillaire de la salle du trône'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_04_06',
                'title'       => ['en' => 'Study the Magister\'s recovered research notes to learn the Crown\'s true weakness', 'fr' => 'Étudier les notes de recherche récupérées du Magister pour connaître la véritable faiblesse de la Couronne'],
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
        'title'       => ['en' => 'Chapter 5: The Shattered Throne', 'fr' => 'Chapitre 5 : Le Trône Brisé'],
        'description' => [
            'en' => 'The Sigil Key opens the wardstone-sealed throne room where the Lich-King Morveth the Pale waits, the Crown of Binding already placed upon his skull. Every moment he wears it extends his dominion over the undead armies massing in the valley below. The party must shatter his phylactery trap, defeat an ancient lich at the height of his power, and destroy the Crown in the Forge of Unmaking deep within the fortress—all before the structure crumbles into the sea.',
            'fr' => 'La Clé Sigillaire ouvre la salle du trône scellée par une pierre de garde où le Liche-Roi Morveth le Pâle attend, la Couronne du Lien déjà posée sur son crâne.',
        ],
        'isCompleted' => false,
        'tasks'       => [
            [
                'id'          => 'task_05_01',
                'title'       => ['en' => 'Use the Sigil Key to breach the wardstone barrier sealing the throne room entrance', 'fr' => 'Utiliser la Clé Sigillaire pour percer la barrière de la pierre de garde scellant l\'entrée de la salle du trône'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_02',
                'title'       => ['en' => 'Survive and dismantle the Lich-King\'s phylactery guardian trap in the antechamber', 'fr' => 'Survivre et démanteler le piège de gardien de phylactère du Liche-Roi dans l\'antichambre'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_03',
                'title'       => ['en' => 'Defeat the Lich-King Morveth the Pale before he can complete the Crown\'s binding ritual', 'fr' => 'Vaincre le Liche-Roi Morveth le Pâle avant qu\'il ne puisse compléter le rituel de liaison de la Couronne'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_04',
                'title'       => ['en' => 'Descend to the Forge of Unmaking in the fortress depths and destroy the Crown of Binding', 'fr' => 'Descendre à la Forge du Démantèlement dans les profondeurs de la forteresse et détruire la Couronne du Lien'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_05',
                'title'       => ['en' => 'Locate the fortress\' emergency exit—a sea-cave tunnel mapped by the Magister—before structural collapse', 'fr' => 'Localiser la sortie de secours de la forteresse—un tunnel de grotte marine cartographié par le Magister—avant l\'effondrement structurel'],
                'isCompleted' => false,
            ],
            [
                'id'          => 'task_05_06',
                'title'       => ['en' => 'Escape the collapsing Storm Fortress and reach the rendezvous ship before dawn', 'fr' => 'Fuir la Forteresse Tempête qui s\'effondre et atteindre le navire de rendez-vous avant l\'aube'],
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
//   Race : Human (SRD core)
//   Class: Soulknife 7 (SRD psionics)
//   Role : Melee striker / psionic ambusher
//
// BUILD NOTES (D&D 3.5 SRD):
//   STR 16 / DEX 14 (→16 w/ Gloves of Dexterity +2) / CON 14 / INT 10 / WIS 12 / CHA 8
//   HP: 7d10+14(CON) = 55(dice) + 14 = 69 total  — using good but not max rolls
//   BAB: +5 (¾ progression, level 7)
//   Saves: Fort +4(base)+2(CON)=+6 | Ref +5(base)+2(DEX*)+5=+7 | Will +5(base)+1(WIS)=+6
//     (* DEX total = 16, mod = +3 — but without Gloves active the base is +2)
//   AC: 10 + 4(mithral_shirt) + 2(DEX) + 1(amulet_natural) + 1(ring_protection) = 18
//
//   CLASS FEATURES (auto-granted by engine from class_soulknife levelProgression):
//     Lv1: Mind Blade, Weapon Focus (Mind Blade), Wild Talent
//     Lv2: Throw Mind Blade
//     Lv3: Psychic Strike +1d8
//     Lv4: +1 Mind Blade, Shape Mind Blade
//     Lv5: Free Draw, Speed of Thought (bonus psionic feat)
//     Lv6: Psychic Strike +2d8
//     Lv7: +2 Mind Blade, Knife to the Soul
//
//   MANUALLY CHOSEN FEATS (stored in activeFeatures):
//     Lv1         : Two-Weapon Fighting (DEX 15 req ✓ — total DEX 16)
//     Lv1 (Human) : Improved Initiative (+4 init)
//     Lv3         : Psionic Body (+2 HP per psionic feat; stacks with Wild Talent)
//     Lv6         : Weapon Finesse (use DEX for light-weapon attack rolls)
//
//   SKILL POINTS: (4 base + 0 INT + 1 Human) × 4(1st lvl bonus) + (5 × 6) = 50
//     skill_autohypnosis  10 ranks → total +11 (WIS 12, mod +1)
//     skill_concentration 10 ranks → total +12 (CON 14, mod +2)
//     skill_tumble        10 ranks → total +12 (DEX 16, mod +3; cross-class if not SK)
//     skill_hide           7 ranks → total +9  (DEX 16, mod +3)
//     skill_move_silently  7 ranks → total +9  (DEX 16, mod +3)
//     skill_spot           6 ranks → total +7  (WIS 12, mod +1)
//     Total spent: 50 ✓
// ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

$kaelData = [
    'id'         => 'char_kael_001',
    'name'       => 'Kael Shadowstep',
    'campaignId' => $campaignId,
    'ownerId'    => 'user_player1_001',
    'isNPC'      => false,
    'playerName' => 'Player One',
    'customSubtitle' => 'Human Soulknife 7',

    // ── Advancement ──────────────────────────────────────────────────────
    // classLevels is the authoritative multiclass map (DAG Phase 0 reads this).
    'classLevels'     => ['class_soulknife' => 7],
    // Humans can choose any favored class; Soulknife is this character's choice.
    'favoredClass'    => 'class_soulknife',
    'levelAdjustment' => 0,
    'xp'              => 21000, // mid-range level 7 (threshold is 21,000 for lvl 8)

    // ── Hit Die Results (stored, not recomputed) ─────────────────────────
    // Soulknife uses d10. Level 1 result is the maximum by house-rule convenience.
    // Levels 2-7 are realistic rolls. Max HP = sum + (CON_mod × characterLevel).
    'hitDieResults' => [1 => 10, 2 => 8, 3 => 7, 4 => 9, 5 => 8, 6 => 7, 7 => 6],
    // Max HP = 55 + (2 × 7) = 69

    // ── Ability Scores (baseValue only; racial/item modifiers applied by engine) ──
    // Human has no racial stat adjustments, so base = total.
    // Gloves of Dexterity +2 grant +2 enhancement (applied via item feature modifier).
    'attributes' => [
        'stat_strength'     => ['baseValue' => 16],
        'stat_dexterity'    => ['baseValue' => 14], // +2 from Gloves = 16 effective
        'stat_constitution' => ['baseValue' => 14],
        'stat_intelligence' => ['baseValue' => 10],
        'stat_wisdom'       => ['baseValue' => 12],
        'stat_charisma'     => ['baseValue' =>  8],
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
        ['instanceId' => 'afi_class_kael', 'featureId' => 'class_soulknife', 'isActive' => true],

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
        // Gloves of Dexterity +2: +2 enhancement to DEX (raises effective DEX to 16).
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
//   Race : Elf (SRD core)
//   Class: Druid 7 (SRD core)
//   Role : Divine caster / nature controller / healer
//
// BUILD NOTES (D&D 3.5 SRD):
//   STR 10 / DEX 16 (+2 racial) / CON 12 (-2 racial, base 14) / INT 12 / WIS 18 (+2 Periapt) / CHA 10
//   HP: 7d8+7(CON) = 47(dice) + 7 = 54 total  — average rolls
//   BAB: +5 (¾ progression, level 7)
//   Saves: Fort +5(base)+1(CON)=+6 | Ref +2(base)+3(DEX)=+5 | Will +5(base)+4(WIS)=+9
//   AC: 10 + 4(rhino_hide) + 2(darkwood_shield) + 1(amulet_natural) + 1(ring_prot) + 3(DEX) = 21
//
//   CLASS FEATURES (auto-granted by engine from class_druid levelProgression):
//     Lv1: Animal Companion, Nature Sense, Wild Empathy, Druid Bonus Languages
//     Lv2: Woodland Stride
//     Lv3: Trackless Step
//     Lv4: Resist Nature's Lure, Wild Shape (Small/Medium, 1/day)
//     Lv5: Wild Shape (Large, 2/day)
//     Lv6: Wild Shape (3/day)
//     Lv7: Wild Shape (4/day)
//
//   MANUALLY CHOSEN FEATS (stored in activeFeatures):
//     Lv1: Natural Spell  (cast spells in Wild Shape — essential for a druid)
//     Lv3: Spell Focus (Conjuration)  (prerequisite for Augment Summoning)
//     Lv6: Augment Summoning  (+4 STR/CON to summoned creatures)
//
//   SPELL SLOTS (Druid 7, WIS 18 = +4 bonus spells):
//     0th: 6 (no bonus for 0th) = 6/day
//     1st: 5 + 1(domain) + 1(WIS) = 6+1 = prepared from full druid list
//     2nd: 4 + 1(domain) + 1(WIS) = 5+1
//     3rd: 3 + 1(domain) + 1(WIS) = 4+1
//     4th: 1 + 1(domain) + 1(WIS) = 2+1
//     (Domain spells computed separately by engine from chosen domain)
//
//   SKILL POINTS: (4 base + 1 INT + 0 Elf bonus) × 4(1st) + (5 × 6) = 50
//     skill_concentration   10 ranks → total +11 (CON 12, mod +1)
//     skill_knowledge_nature 10 ranks → total +11 (INT 12, mod +1) — class skill
//     skill_spellcraft       10 ranks → total +11 (INT 12, mod +1) — class skill
//     skill_survival         10 ranks → total +14 (WIS 18, mod +4) — class skill
//     skill_spot              5 ranks → total +9  (WIS 18, mod +4; +2 Elf racial = +11)
//     skill_listen            5 ranks → total +9  (WIS 18, mod +4; +2 Elf racial = +11)
//     Total spent: 50 ✓
// ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

$sylaraData = [
    'id'         => 'char_sylara_001',
    'name'       => 'Sylara Moonwhisper',
    'campaignId' => $campaignId,
    'ownerId'    => 'user_player2_001',
    'isNPC'      => false,
    'playerName' => 'Player Two',
    'customSubtitle' => 'Elf Druid 7',

    // ── Advancement ──────────────────────────────────────────────────────
    'classLevels'     => ['class_druid' => 7],
    // Elf favored class in D&D 3.5 is Wizard, but this character ignores that
    // (single-classed, so no XP penalty regardless).
    'favoredClass'    => 'class_druid',
    'levelAdjustment' => 0,
    'xp'              => 21000,

    // ── Hit Die Results ───────────────────────────────────────────────────
    // Druid uses d8. Average to good rolls across levels.
    'hitDieResults' => [1 => 8, 2 => 6, 3 => 7, 4 => 5, 5 => 8, 6 => 6, 7 => 7],
    // Max HP = 47 + (1 × 7) = 54  (CON 14 base - 2 racial = 12, mod = +1)

    // ── Ability Scores (baseValue before racial adjustments) ──────────────
    // Elf racial: +2 DEX, -2 CON.
    // Periapt of Wisdom +2 provides +2 enhancement to WIS (via item modifier).
    'attributes' => [
        'stat_strength'     => ['baseValue' => 10],
        'stat_dexterity'    => ['baseValue' => 14], // +2 racial → effective 16
        'stat_constitution' => ['baseValue' => 14], // -2 racial → effective 12
        'stat_intelligence' => ['baseValue' => 12],
        'stat_wisdom'       => ['baseValue' => 16], // +2 Periapt → effective 18
        'stat_charisma'     => ['baseValue' => 10],
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
        // race_elf grants: +2 DEX, -2 CON, low-light vision, immunity to magic
        // sleep, +2 saves vs. enchantments, Spot/Listen/Search bonuses,
        // Elven weapon proficiency.
        ['instanceId' => 'afi_race_sylara',  'featureId' => 'race_elf',   'isActive' => true],

        // ── Class ─────────────────────────────────────────────────────────
        // class_druid levelProgression (up to level 7) is resolved by the engine.
        // Auto-grants: Animal Companion, Woodland Stride, Wild Shape, etc.
        ['instanceId' => 'afi_class_sylara', 'featureId' => 'class_druid', 'isActive' => true],

        // ── Manually Chosen Feats ─────────────────────────────────────────
        // Natural Spell: allows spellcasting in Wild Shape form — core druid feat.
        ['instanceId' => 'afi_ns_sylara',   'featureId' => 'feat_natural_spell',     'isActive' => true],
        // Spell Focus (Conjuration): +1 DC to Conjuration spells; prerequisite for
        // Augment Summoning. The school selection will be prompted by the engine UI.
        ['instanceId' => 'afi_sf_sylara',   'featureId' => 'feat_spell_focus',       'isActive' => true],
        // Augment Summoning: summoned creatures gain +4 STR and +4 CON.
        // Requires Spell Focus (Conjuration). Dramatically improves summons.
        ['instanceId' => 'afi_as_sylara',   'featureId' => 'feat_augment_summoning', 'isActive' => true],

        // ── Equipped Magic Items ───────────────────────────────────────────
        // Rhino Hide: unique named item — non-metal medium armor (druid-legal).
        //   AC +5, max DEX +2 (limits DEX to +2), ACP -2. Price: 5,165 gp.
        //   Grants the wearer the ability to make a powerful charge attack 1/day.
        ['instanceId' => 'afi_armor_sylara',   'featureId' => 'item_armor_specific_rhino_hide',   'isActive' => true],
        // Darkwood Shield: wooden heavy shield (druid-legal, no metal).
        //   AC +2 shield bonus, ACP 0 (masterwork darkwood reduces to 0).
        ['instanceId' => 'afi_shield_sylara',  'featureId' => 'item_shield_specific_darkwood_shield', 'isActive' => true],
        // Amulet of Natural Armor +1: +1 natural armor bonus to AC.
        ['instanceId' => 'afi_amulet_sylara',  'featureId' => 'item_amulet_of_natural_armor_1',   'isActive' => true],
        // Ring of Protection +1: +1 deflection bonus to AC.
        ['instanceId' => 'afi_ring_sylara',    'featureId' => 'item_ring_protection_1',            'isActive' => true],
        // Cloak of Resistance +2: +2 resistance bonus to all saves.
        ['instanceId' => 'afi_cloak_sylara',   'featureId' => 'item_cloak_of_resistance_2',        'isActive' => true],
        // Periapt of Wisdom +2: +2 enhancement to WIS (raises WIS to 18, DC+1 for spells).
        ['instanceId' => 'afi_periapt_sylara', 'featureId' => 'item_periapt_of_wisdom_2',          'isActive' => true],

        // ── Readied Items ─────────────────────────────────────────────────
        // Wand of Cure Light Wounds: 50 charges remaining.
        //   Used out of combat to conserve prepared spell slots.
        //   itemResourcePools tracks per-instance charges (see ARCHITECTURE.md §5.7).
        [
            'instanceId'       => 'afi_wand_sylara',
            'featureId'        => 'item_wand_cure_light_wounds',
            'isActive'         => false,
            'itemResourcePools'=> ['charges' => 50],
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
    // WBL ~19,000 gp. Most spent on Rhino Hide, Periapt of Wisdom, Cloak +2.
    'wealth' => ['cp' => 0, 'sp' => 0, 'gp' => 420, 'pp' => 0],
];

// ── Insert characters into the DB ──────────────────────────────────────────
$stmtChar = $db->prepare('
    INSERT INTO characters
        (id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at)
    VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
');

$characters = [
    ['data' => $kaelData,   'label' => 'Human Soulknife 7'],
    ['data' => $sylaraData, 'label' => 'Elf Druid 7'],
];

foreach ($characters as $entry) {
    $d = $entry['data'];
    $stmtChar->execute([
        $d['id'],
        $d['campaignId'],
        $d['ownerId'],
        $d['name'],
        0, // is_npc = false
        json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        '[]', // gm_overrides_json — GM can add overrides via the dashboard later
        $now,
    ]);
    echo "  ✅ Created [{$entry['label']}] {$d['name']} (owner: {$d['ownerId']})\n";
}

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
echo "  Char 1    →  Kael Shadowstep    — Human Soulknife 7 (player1)\n";
echo "  Char 2    →  Sylara Moonwhisper — Elf Druid 7      (player2)\n";
echo "─────────────────────────────────────────────────────\n\n";
