<?php
/**
 * @file api/controllers/CampaignController.php
 * @description REST controller for Campaign resources.
 *
 * ENDPOINTS:
 *   GET    /api/campaigns                              → index()
 *   POST   /api/campaigns                              → create()
 *   GET    /api/campaigns/{id}                         → show($id)
 *   PUT    /api/campaigns/{id}                         → update($id)
 *   GET    /api/campaigns/{id}/sync-status             → syncStatus($id)
 *   GET    /api/campaigns/{id}/homebrew-rules          → getHomebrewRules($id)
 *   PUT    /api/campaigns/{id}/homebrew-rules          → setHomebrewRules($id)
 *   GET    /api/campaigns/{id}/users                   → getUsers($id)
 *   POST   /api/campaigns/{id}/users                   → addUser($id)
 *   DELETE /api/campaigns/{id}/users/{userId}          → removeUser($id, $userId)
 *
 * VISIBILITY RULES:
 *   - All authenticated users can list campaigns they own or belong to.
 *   - GMs get `gmGlobalOverrides` in the show() response; players do not.
 *   - Only the campaign owner (or a GM) can update a campaign.
 *   - Homebrew rules (GET) are readable by all authenticated users in the campaign.
 *   - Homebrew rules (PUT) are writable by GMs only.
 *   - Campaign membership (GET/POST/DELETE /users) is GM+Admin only.
 *
 * @see api/auth.php for requireAuth(), requireGameMaster()
 * @see api/Database.php for Database::getInstance()
 * @see ARCHITECTURE.md Phase 14.5 for the full specification.
 * @see ARCHITECTURE.md §21.1 for the homebrew rule source design.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../Logger.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../auth.php';

class CampaignController
{
    // ============================================================
    // GET /api/campaigns
    // ============================================================

    /**
     * Returns all campaigns visible to the current user.
     * For now: all campaigns in the DB (visibility filtering can be added later).
     */
    public static function index(): void
    {
        $user = requireAuth();
        $db = Database::getInstance();

        // GMs see all campaigns; players see campaigns they own
        if ($user['is_game_master']) {
            $stmt = $db->prepare('SELECT id, title, description, poster_url, banner_url, owner_id, chapters_json, enabled_rule_sources_json, campaign_settings_json, updated_at FROM campaigns ORDER BY updated_at DESC');
            $stmt->execute();
        } else {
            $stmt = $db->prepare('SELECT id, title, description, poster_url, banner_url, owner_id, chapters_json, enabled_rule_sources_json, campaign_settings_json, updated_at FROM campaigns WHERE owner_id = ? ORDER BY updated_at DESC');
            $stmt->execute([$user['id']]);
        }

        $campaigns = $stmt->fetchAll();

        // Decode JSON fields
        foreach ($campaigns as &$c) {
            $c['chapters']           = json_decode($c['chapters_json'] ?? '[]', true);
            $c['enabledRuleSources'] = json_decode($c['enabled_rule_sources_json'] ?? '[]', true);
            // Decode campaignSettings; return null when empty so the frontend can
            // distinguish "never configured" from an actual settings object.
            $cs = json_decode($c['campaign_settings_json'] ?? 'null', true);
            $c['campaignSettings'] = (is_array($cs) && !array_is_list($cs)) ? $cs : null;
            unset($c['chapters_json'], $c['enabled_rule_sources_json'], $c['campaign_settings_json']);
        }

        Logger::info('Campaign', 'List', ['count' => count($campaigns)]);
        http_response_code(200);
        echo json_encode($campaigns);
    }

    // ============================================================
    // POST /api/campaigns
    // ============================================================

    /**
     * Creates a new campaign.
     * Only GMs can create campaigns (enforced by requireGameMaster()).
     */
    public static function create(): void
    {
        $user = requireGameMaster();

        $body = json_decode(file_get_contents('php://input'), true);
        $id    = 'camp_' . bin2hex(random_bytes(8));
        $now   = time();

        $title       = $body['title']       ?? 'New Campaign';
        $description = $body['description'] ?? '';
        $posterUrl   = $body['posterUrl']   ?? null;
        $bannerUrl   = $body['bannerUrl']   ?? null;

        $db = Database::getInstance();
        $stmt = $db->prepare('
            INSERT INTO campaigns (id, title, description, poster_url, banner_url, owner_id, chapters_json, enabled_rule_sources_json, gm_global_overrides_text, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        // Default: enable all SRD Core files (file-path based, not source-ID based)
        $defaultSources = json_encode([
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
        ]);
        $stmt->execute([$id, $title, $description, $posterUrl, $bannerUrl, $user['id'], '[]', $defaultSources, '[]', $now]);

        Logger::info('Campaign', 'Created', ['id' => $id, 'title' => $title]);
        http_response_code(201);
        echo json_encode(['id' => $id, 'title' => $title, 'ownerId' => $user['id']]);
    }

    // ============================================================
    // GET /api/campaigns/{id}
    // ============================================================

    /**
     * Returns a single campaign's details.
     *
     * VISIBILITY:
     *   - Players receive the campaign without `gmGlobalOverrides`.
     *   - GMs receive `gmGlobalOverrides` (the raw JSON text for their editor).
     */
    public static function show(string $id): void
    {
        $user = requireAuth();
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT * FROM campaigns WHERE id = ?');
        $stmt->execute([$id]);
        $campaign = $stmt->fetch();

        if (!$campaign) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$id}' not found."]);
            return;
        }

        // Decode JSON fields
        $result = [
            'id'                  => $campaign['id'],
            'title'               => $campaign['title'],
            'description'         => $campaign['description'],
            'posterUrl'           => $campaign['poster_url'],
            'bannerUrl'           => $campaign['banner_url'],
            'ownerId'             => $campaign['owner_id'],
            'chapters'            => json_decode($campaign['chapters_json'] ?? '[]', true),
            'enabledRuleSources'  => json_decode($campaign['enabled_rule_sources_json'] ?? '[]', true),
            'updatedAt'           => (int)$campaign['updated_at'],
            // Per-campaign rule settings (diceRules, statGeneration, variantRules).
            // All players receive this field so their engines apply the same rules.
            // Return null when empty so the frontend treats it as "no settings saved".
            'campaignSettings'    => (function() use ($campaign) {
                $cs = json_decode($campaign['campaign_settings_json'] ?? 'null', true);
                return (is_array($cs) && !array_is_list($cs)) ? $cs : null;
            })(),
        ];

        // GMs also receive the raw global overrides text (for their editor UI)
        if ($user['is_game_master']) {
            $result['gmGlobalOverrides'] = $campaign['gm_global_overrides_text'] ?? '[]';
        }

        Logger::info('Campaign', 'Show', ['id' => $id]);
        http_response_code(200);
        echo json_encode($result);
    }

    // ============================================================
    // PUT /api/campaigns/{id}
    // ============================================================

    /**
     * Updates campaign settings: title, description, chapters, rule sources, GM overrides.
     * Only the campaign owner or a GM can update.
     */
    public static function update(string $id): void
    {
        $user = requireAuth();
        $db = Database::getInstance();

        // Verify ownership or GM status
        $stmt = $db->prepare('SELECT owner_id FROM campaigns WHERE id = ?');
        $stmt->execute([$id]);
        $campaign = $stmt->fetch();

        if (!$campaign) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$id}' not found."]);
            return;
        }

        if ($campaign['owner_id'] !== $user['id'] && !$user['is_game_master']) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden', 'message' => 'You do not own this campaign.']);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $now  = time();

        $fields = [];
        $params = [];

        if (isset($body['title'])) {
            $fields[] = 'title = ?';
            $params[] = $body['title'];
        }
        if (isset($body['description'])) {
            $fields[] = 'description = ?';
            $params[] = $body['description'];
        }
        if (isset($body['chapters'])) {
            $fields[] = 'chapters_json = ?';
            $params[] = json_encode($body['chapters']);
        }
        if (isset($body['enabledRuleSources'])) {
            $fields[] = 'enabled_rule_sources_json = ?';
            $params[] = json_encode($body['enabledRuleSources']);
        }
        if (isset($body['gmGlobalOverrides']) && $user['is_game_master']) {
            $fields[] = 'gm_global_overrides_text = ?';
            $params[] = $body['gmGlobalOverrides'];
        }

        // Merge incoming rule-settings fields (diceRules, statGeneration, variantRules)
        // into the stored campaign_settings_json blob.
        // We READ the existing blob, merge only the provided keys, then WRITE it back.
        // This is safe and forward-compatible: unknown keys are preserved.
        $settingsKeys = ['diceRules', 'statGeneration', 'variantRules'];
        $hasSettingsUpdate = false;
        foreach ($settingsKeys as $key) {
            if (isset($body[$key])) { $hasSettingsUpdate = true; break; }
        }
        if ($hasSettingsUpdate && $user['is_game_master']) {
            // Load existing settings blob
            $stmt = $db->prepare('SELECT campaign_settings_json FROM campaigns WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            $existing = json_decode($row['campaign_settings_json'] ?? '{}', true) ?? [];

            // Merge provided keys
            foreach ($settingsKeys as $key) {
                if (isset($body[$key])) {
                    $existing[$key] = $body[$key];
                }
            }

            $fields[] = 'campaign_settings_json = ?';
            $params[] = json_encode($existing, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'BadRequest', 'message' => 'No updatable fields provided.']);
            return;
        }

        $fields[] = 'updated_at = ?';
        $params[] = $now;
        $params[] = $id;

        $sql = 'UPDATE campaigns SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $db->prepare($sql)->execute($params);

        // Build a human-readable list of what actually changed for the log.
        $changedFields = array_filter([
            isset($body['title'])               ? 'title'               : null,
            isset($body['description'])         ? 'description'         : null,
            isset($body['chapters'])            ? 'chapters'            : null,
            isset($body['enabledRuleSources'])  ? 'enabledRuleSources'  : null,
            isset($body['gmGlobalOverrides'])   ? 'gmGlobalOverrides'   : null,
            $hasSettingsUpdate                  ? 'campaignSettings'    : null,
        ]);
        Logger::info('Campaign', 'Updated', ['id' => $id, 'fields' => implode(' ', $changedFields)]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'updatedAt' => $now]);
    }

    // ============================================================
    // GET /api/campaigns/{id}/sync-status
    // ============================================================

    /**
     * Returns lightweight sync timestamps for polling.
     *
     * POLLING MECHANISM (ARCHITECTURE.md section 19):
     *   The SvelteKit frontend polls this endpoint every 5-10 seconds.
     *   It compares returned timestamps with its locally cached ones.
     *   Only data with a changed timestamp is re-fetched.
     *
     * RESPONSE:
     *   {
     *     "campaignUpdatedAt": 1710754823,
     *     "characterTimestamps": {
     *       "char_001": 1710754800,
     *       "char_002": 1710754810
     *     }
     *   }
     */
    public static function syncStatus(string $id): void
    {
        $user = requireAuth();
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT updated_at FROM campaigns WHERE id = ?');
        $stmt->execute([$id]);
        $campaign = $stmt->fetch();

        if (!$campaign) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$id}' not found."]);
            return;
        }

        // Fetch character timestamps with visibility filter
        if ($user['is_game_master']) {
            $stmt = $db->prepare('SELECT id, updated_at FROM characters WHERE campaign_id = ?');
            $stmt->execute([$id]);
        } else {
            $stmt = $db->prepare('SELECT id, updated_at FROM characters WHERE campaign_id = ? AND owner_id = ?');
            $stmt->execute([$id, $user['id']]);
        }

        $chars = $stmt->fetchAll();
        $charTimestamps = [];
        foreach ($chars as $c) {
            $charTimestamps[$c['id']] = (int)$c['updated_at'];
        }

        http_response_code(200);
        echo json_encode([
            'campaignUpdatedAt'    => (int)$campaign['updated_at'],
            'characterTimestamps'  => $charTimestamps,
        ]);
    }

    // ============================================================
    // GET /api/campaigns/{id}/homebrew-rules
    // ============================================================

    /**
     * Returns the campaign-scoped homebrew rule entities as a JSON array.
     *
     * VISIBILITY:
     *   Accessible to any authenticated user (GM and players alike).
     *   The homebrew entities are needed by the DataLoader on the frontend so
     *   all players can see newly-authored races, feats, spells, etc.
     *
     * RESPONSE (200):
     *   A JSON array of Feature-like objects — the raw parsed value of
     *   `campaigns.homebrew_rules_json`. An empty array `[]` is returned when
     *   no homebrew content has been authored yet.
     */
    public static function getHomebrewRules(string $id): void
    {
        // Any authenticated user can read homebrew rules for their campaign.
        requireAuth();
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT homebrew_rules_json FROM campaigns WHERE id = ?');
        $stmt->execute([$id]);
        $campaign = $stmt->fetch();

        if (!$campaign) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$id}' not found."]);
            return;
        }

        // Return the stored JSON array directly, parsing it so the response is
        // a proper JSON array rather than a double-encoded string.
        $rules = json_decode($campaign['homebrew_rules_json'] ?? '[]', true) ?? [];

        Logger::info('Campaign', 'Homebrew GET', ['id' => $id, 'count' => count($rules)]);
        http_response_code(200);
        echo json_encode($rules);
    }

    // ============================================================
    // PUT /api/campaigns/{id}/homebrew-rules
    // ============================================================

    /**
     * Replaces the entire campaign-scoped homebrew rule array.
     *
     * AUTHORISATION:
     *   GM only. Returns 403 for non-GM authenticated users.
     *
     * VALIDATION:
     *   - Body must be valid JSON.                          → 422 on failure
     *   - Root value must be a JSON array.                  → 422 on failure
     *   - Raw request body must not exceed 2 MB.            → 413 on failure
     *
     * WHY REPLACE-ALL SEMANTICS?
     *   The homebrew store is the canonical source: the frontend sends the
     *   entire (potentially reordered or pruned) entity list on each save.
     *   Partial-patch semantics would require entity-level diffing on the server,
     *   adding complexity without benefit since the payload is always the
     *   authoritative, already-edited state from HomebrewStore.
     *
     * SIDE EFFECT:
     *   Updates `campaigns.updated_at` so that the sync-status polling endpoint
     *   picks up the change and connected clients re-fetch campaign data.
     *
     * RESPONSE (200):
     *   { "id": "<campaignId>", "updatedAt": <unix_timestamp> }
     */
    public static function setHomebrewRules(string $id): void
    {
        // Only GMs may write homebrew rules.
        requireGameMaster();
        $db = Database::getInstance();

        // ---- 413 Request Entity Too Large ----------------------------------------
        // Limit raw body size to 2 MB (2 097 152 bytes) before attempting to read it.
        // file_get_contents('php://input') buffers the entire body in memory, so we
        // check Content-Length first as a fast gate. Note: Content-Length may be
        // absent (e.g., chunked transfer); we also enforce the limit after reading.
        $maxBytes = 2 * 1024 * 1024; // 2 MB
        $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;

        if ($contentLength > $maxBytes) {
            http_response_code(413);
            echo json_encode([
                'error'   => 'RequestTooLarge',
                'message' => 'Homebrew rules payload must not exceed 2 MB.',
            ]);
            return;
        }

        $rawBody = file_get_contents('php://input');

        if (strlen($rawBody) > $maxBytes) {
            http_response_code(413);
            echo json_encode([
                'error'   => 'RequestTooLarge',
                'message' => 'Homebrew rules payload must not exceed 2 MB.',
            ]);
            return;
        }

        // ---- 422 Unprocessable Entity — JSON validity ----------------------------
        // json_decode returns null for invalid JSON AND for a literal JSON null.
        // We handle both cases explicitly below.
        $decoded = json_decode($rawBody, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => 'Request body is not valid JSON: ' . json_last_error_msg(),
            ]);
            return;
        }

        // ---- 422 Unprocessable Entity — must be a JSON array ---------------------
        // DataLoader expects an array of Feature objects. Reject objects, primitives, etc.
        if (!is_array($decoded) || array_is_list($decoded) === false) {
            http_response_code(422);
            echo json_encode([
                'error'   => 'UnprocessableEntity',
                'message' => 'Request body must be a JSON array of Feature objects.',
            ]);
            return;
        }

        // ---- Verify the campaign exists (404) ------------------------------------
        $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$id}' not found."]);
            return;
        }

        // ---- Persist & update timestamp ------------------------------------------
        // Re-encode to guarantee consistent JSON formatting (no extra whitespace or
        // potentially malicious unicode escapes from the raw body are stored verbatim).
        $normalizedJson = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $now = time();

        $stmt = $db->prepare('UPDATE campaigns SET homebrew_rules_json = ?, updated_at = ? WHERE id = ?');
        $stmt->execute([$normalizedJson, $now, $id]);

        Logger::info('Campaign', 'Homebrew PUT', ['id' => $id, 'entities' => count($decoded)]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'updatedAt' => $now]);
    }

    // ============================================================
    // GET /api/campaigns/{id}/users  (Phase 22.4)
    // ============================================================

    /**
     * Lists all members of a campaign with their user details and join date.
     *
     * ACCESS: GM or Admin (requireGameMaster covers both roles).
     *
     * WHY INCLUDE SUSPENDED USERS?
     *   Suspended users may still have active characters in the campaign. The GM
     *   needs to see them in the member list (marked as suspended) so they can
     *   manage those characters or reinstate the player.
     *
     * RESPONSE (200):
     *   Array of member objects:
     *   { user_id, username, player_name, role, is_suspended, joined_at }
     */
    public static function getUsers(string $id): void
    {
        requireGameMaster();
        $db = Database::getInstance();

        // Verify campaign exists.
        $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$id}' not found."]);
            return;
        }

        $stmt = $db->prepare('
            SELECT
                u.id           AS user_id,
                u.username,
                u.display_name AS player_name,
                u.role,
                u.is_suspended,
                cu.joined_at
            FROM campaign_users cu
            JOIN users u ON u.id = cu.user_id
            WHERE cu.campaign_id = ?
            ORDER BY u.username ASC
        ');
        $stmt->execute([$id]);
        $members = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Normalise types.
        foreach ($members as &$m) {
            $m['is_suspended'] = (bool)$m['is_suspended'];
            $m['joined_at']    = (int)$m['joined_at'];
        }
        unset($m);

        Logger::info('Campaign', 'Users list', ['campaign' => $id, 'count' => count($members)]);
        http_response_code(200);
        echo json_encode($members);
    }

    // ============================================================
    // POST /api/campaigns/{id}/users  (Phase 22.4)
    // ============================================================

    /**
     * Adds a user to a campaign.
     *
     * ACCESS: GM or Admin.
     *
     * Suspended users CAN be added — they may have existing characters in the
     * campaign that the GM wants to keep active even while the player is blocked
     * from logging in.
     *
     * REQUEST BODY (JSON):
     *   { "user_id": "string" }
     *
     * RESPONSE 201 Created:  { campaign_id, user_id, joined_at }
     * RESPONSE 400 BadRequest: user_id missing
     * RESPONSE 404 NotFound:   campaign or user not found
     * RESPONSE 409 Conflict:   user is already a member
     */
    public static function addUser(string $id): void
    {
        requireGameMaster();
        $db = Database::getInstance();

        // Verify campaign exists.
        $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$id}' not found."]);
            return;
        }

        $body   = json_decode(file_get_contents('php://input'), true) ?? [];
        $userId = trim($body['user_id'] ?? '');

        if ($userId === '') {
            http_response_code(400);
            echo json_encode(['error' => 'BadRequest', 'message' => 'user_id is required.']);
            return;
        }

        // Verify user exists (suspended users are allowed — no is_suspended filter).
        $stmt = $db->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "User '{$userId}' not found."]);
            return;
        }

        $now = time();

        try {
            $db->prepare('INSERT INTO campaign_users (campaign_id, user_id, joined_at) VALUES (?, ?, ?)')
               ->execute([$id, $userId, $now]);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE constraint failed')) {
                http_response_code(409);
                echo json_encode([
                    'error'   => 'Conflict',
                    'message' => 'User is already a member of this campaign.',
                ]);
                return;
            }
            throw $e;
        }

        Logger::info('Campaign', 'User added', ['campaign' => $id, 'user' => $userId]);
        http_response_code(201);
        echo json_encode(['campaign_id' => $id, 'user_id' => $userId, 'joined_at' => $now]);
    }

    // ============================================================
    // DELETE /api/campaigns/{id}/users/{userId}  (Phase 22.4)
    // ============================================================

    /**
     * Removes a user from a campaign.
     *
     * ACCESS: GM or Admin.
     *
     * This does NOT delete the user's characters — it only removes the
     * campaign_users membership row. The user's characters remain in the
     * campaign, owned by that user. The GM can still manage those characters.
     *
     * RESPONSE 200: { campaign_id, user_id, removed: true }
     * RESPONSE 404: campaign or membership not found
     */
    public static function removeUser(string $campaignId, string $userId): void
    {
        requireGameMaster();
        $db = Database::getInstance();

        // Verify campaign exists.
        $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
        $stmt->execute([$campaignId]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$campaignId}' not found."]);
            return;
        }

        // Verify the membership row exists before attempting deletion.
        $stmt = $db->prepare('SELECT campaign_id FROM campaign_users WHERE campaign_id = ? AND user_id = ?');
        $stmt->execute([$campaignId, $userId]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode([
                'error'   => 'NotFound',
                'message' => "User '{$userId}' is not a member of campaign '{$campaignId}'.",
            ]);
            return;
        }

        $db->prepare('DELETE FROM campaign_users WHERE campaign_id = ? AND user_id = ?')
           ->execute([$campaignId, $userId]);

        Logger::info('Campaign', 'User removed', ['campaign' => $campaignId, 'user' => $userId]);
        http_response_code(200);
        echo json_encode(['campaign_id' => $campaignId, 'user_id' => $userId, 'removed' => true]);
    }
}
