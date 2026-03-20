<?php
/**
 * @file api/controllers/CampaignController.php
 * @description REST controller for Campaign resources.
 *
 * ENDPOINTS:
 *   GET  /api/campaigns                   → index()
 *   POST /api/campaigns                   → create()
 *   GET  /api/campaigns/{id}              → show($id)
 *   PUT  /api/campaigns/{id}              → update($id)
 *   GET  /api/campaigns/{id}/sync-status  → syncStatus($id)
 *
 * VISIBILITY RULES:
 *   - All authenticated users can list campaigns they own or belong to.
 *   - GMs get `gmGlobalOverrides` in the show() response; players do not.
 *   - Only the campaign owner (or a GM) can update a campaign.
 *
 * @see api/auth.php for requireAuth(), requireGameMaster()
 * @see api/Database.php for Database::getInstance()
 * @see ARCHITECTURE.md Phase 14.5 for the full specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
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
            $stmt = $db->prepare('SELECT id, title, description, poster_url, banner_url, owner_id, enabled_rule_sources_json, updated_at FROM campaigns ORDER BY updated_at DESC');
            $stmt->execute();
        } else {
            $stmt = $db->prepare('SELECT id, title, description, poster_url, banner_url, owner_id, enabled_rule_sources_json, updated_at FROM campaigns WHERE owner_id = ? ORDER BY updated_at DESC');
            $stmt->execute([$user['id']]);
        }

        $campaigns = $stmt->fetchAll();

        // Decode JSON fields
        foreach ($campaigns as &$c) {
            $c['enabledRuleSources'] = json_decode($c['enabled_rule_sources_json'] ?? '[]', true);
            unset($c['enabled_rule_sources_json']);
        }

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
        $stmt->execute([$id, $title, $description, $posterUrl, $bannerUrl, $user['id'], '[]', '[]', '[]', $now]);

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
        ];

        // GMs also receive the raw global overrides text (for their editor UI)
        if ($user['is_game_master']) {
            $result['gmGlobalOverrides'] = $campaign['gm_global_overrides_text'] ?? '[]';
        }

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
}
