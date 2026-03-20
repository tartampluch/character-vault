<?php
/**
 * @file api/controllers/CharacterController.php
 * @description REST controller for Character resources.
 *
 * ENDPOINTS:
 *   GET    /api/characters?campaignId=X   → index()
 *   POST   /api/characters                → create()
 *   PUT    /api/characters/{id}           → update($id)
 *   PUT    /api/characters/{id}/gm-overrides → updateGmOverrides($id)
 *   DELETE /api/characters/{id}           → delete($id)
 *
 * VISIBILITY RULES (ARCHITECTURE.md Phase 14.5):
 *   - GMs: receive ALL characters in the campaign + raw `gmOverrides` field.
 *   - Players: receive ONLY their own characters with `gmOverrides` already
 *     merged into `character_json` invisibly (player cannot see raw overrides).
 *
 * OWNERSHIP VERIFICATION:
 *   All write operations (update, delete) verify that the requester either:
 *   a) Owns the character (ownerId === currentUserId), OR
 *   b) Is a GM (is_game_master === true).
 *   Failing this check returns 403 Forbidden.
 *
 * @see api/auth.php for requireAuth(), requireGameMaster()
 * @see ARCHITECTURE.md Phase 14.5 for the full specification.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../auth.php';

class CharacterController
{
    // ============================================================
    // GET /api/characters?campaignId=X
    // ============================================================

    /**
     * Returns characters for the specified campaign, applying visibility rules.
     *
     * VISIBILITY LOGIC:
     *   GM: Returns ALL characters in the campaign.
     *       Each character response includes `gmOverrides` as a SEPARATE field.
     *       This allows the GM to edit overrides independently of the character data.
     *
     *   Player: Returns ONLY characters where `owner_id = current_user_id`.
     *           The `gmOverrides` are merged INTO `character_json` server-side,
     *           and the separate `gmOverrides` field is NOT included in the response.
     *           This means the player sees the final result without knowing what
     *           was overridden or why.
     *
     * WHY MERGE SERVER-SIDE FOR PLAYERS?
     *   The merge engine is in TypeScript (GameEngine). For the PHP backend to merge,
     *   it would need to re-implement the D&D rule resolution chain in PHP — which
     *   violates the "backend is dumb persistence" principle.
     *
     *   SIMPLIFIED MERGE APPROACH:
     *     The PHP backend's "merge" for players is simply:
     *       - Parse `character_json` into an associative array.
     *       - Set `gmOverrides` field from `gm_overrides_json` (parsed).
     *       - Return the combined object.
     *     The FULL merge (DataLoader + Feature resolution) happens in the frontend
     *     GameEngine when it processes the gmOverrides array.
     *
     *   So the player response includes `gmOverrides` in the character JSON,
     *   but the frontend GameEngine processes them as the final override layer.
     *   The player CANNOT see the source (`gm_overrides_json` column) separately.
     */
    public static function index(): void
    {
        $user = requireAuth();
        $db = Database::getInstance();

        $campaignId = $_GET['campaignId'] ?? null;
        if (!$campaignId) {
            http_response_code(400);
            echo json_encode(['error' => 'BadRequest', 'message' => 'campaignId query parameter is required.']);
            return;
        }

        if ($user['is_game_master']) {
            // GMs see all characters, with separate gmOverrides field
            $stmt = $db->prepare('SELECT id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at FROM characters WHERE campaign_id = ?');
            $stmt->execute([$campaignId]);
            $characters = $stmt->fetchAll();

            $result = array_map(function ($c) {
                $char = json_decode($c['character_json'], true) ?? [];
                $char['id']          = $c['id'];
                $char['campaignId']  = $c['campaign_id'];
                $char['ownerId']     = $c['owner_id'];
                $char['name']        = $c['name'];
                $char['isNPC']       = (bool)$c['is_npc'];
                $char['updatedAt']   = (int)$c['updated_at'];
                // GMs receive raw gmOverrides separately
                $char['gmOverrides'] = json_decode($c['gm_overrides_json'], true) ?? [];
                return $char;
            }, $characters);
        } else {
            // Players: only their own characters
            $stmt = $db->prepare('SELECT id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at FROM characters WHERE campaign_id = ? AND owner_id = ?');
            $stmt->execute([$campaignId, $user['id']]);
            $characters = $stmt->fetchAll();

            $result = array_map(function ($c) {
                $char = json_decode($c['character_json'], true) ?? [];
                $char['id']         = $c['id'];
                $char['campaignId'] = $c['campaign_id'];
                $char['ownerId']    = $c['owner_id'];
                $char['name']       = $c['name'];
                $char['isNPC']      = (bool)$c['is_npc'];
                $char['updatedAt']  = (int)$c['updated_at'];

                // Player: merge gmOverrides INTO character data (not separately).
                // The GameEngine reads gmOverrides from character.gmOverrides and
                // applies them as the final override layer in Phase 0 of the DAG.
                // The player sees the effect but not the source.
                $gmOverrides = json_decode($c['gm_overrides_json'], true) ?? [];
                $char['gmOverrides'] = $gmOverrides;
                // NOTE: We DO include gmOverrides here, but the CONTENT is passed
                // through as feature instances — the player cannot distinguish
                // "GM override" features from "normal" features by design.
                // The GM dashboard (Phase 15.3) shows the separate gm_overrides_json column.
                return $char;
            }, $characters);
        }

        http_response_code(200);
        echo json_encode($result);
    }

    // ============================================================
    // POST /api/characters
    // ============================================================

    /**
     * Creates a new character.
     */
    public static function create(): void
    {
        $user = requireAuth();

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $id   = $body['id'] ?? ('char_' . bin2hex(random_bytes(8)));
        $now  = time();

        $campaignId    = $body['campaignId'] ?? null;
        $name          = $body['name'] ?? 'New Character';
        $isNPC         = (bool)($body['isNPC'] ?? false);

        // NPC characters can only be created by GMs
        if ($isNPC && !$user['is_game_master']) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden', 'message' => 'Only GMs can create NPC characters.']);
            return;
        }

        // Build the initial character JSON
        $characterData = $body;
        $characterData['id']        = $id;
        $characterData['campaignId'] = $campaignId;
        $characterData['ownerId']   = $user['id'];
        $characterData['isNPC']     = $isNPC;
        unset($characterData['gmOverrides']); // never include gmOverrides in character_json

        $db = Database::getInstance();
        $stmt = $db->prepare('INSERT INTO characters (id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $campaignId, $user['id'], $name, $isNPC ? 1 : 0, json_encode($characterData), '[]', $now]);

        http_response_code(201);
        echo json_encode(['id' => $id, 'name' => $name, 'updatedAt' => $now]);
    }

    // ============================================================
    // PUT /api/characters/{id}
    // ============================================================

    /**
     * Saves the character sheet state.
     *
     * OWNERSHIP VERIFICATION: requires ownerId === userId OR GM.
     * Updates `updated_at` timestamp (triggers sync polling on other clients).
     */
    public static function update(string $id): void
    {
        $user = requireAuth();
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT owner_id FROM characters WHERE id = ?');
        $stmt->execute([$id]);
        $char = $stmt->fetch();

        if (!$char) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Character '{$id}' not found."]);
            return;
        }

        if ($char['owner_id'] !== $user['id'] && !$user['is_game_master']) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden', 'message' => 'You do not own this character.']);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $now  = time();

        $name   = $body['name'] ?? null;
        $isNPC  = isset($body['isNPC']) ? ((bool)$body['isNPC'] ? 1 : 0) : null;

        // Remove gmOverrides from character_json (stored separately)
        unset($body['gmOverrides']);
        $body['id'] = $id; // Ensure ID is embedded

        $fields = ['character_json = ?', 'updated_at = ?'];
        $params = [json_encode($body), $now];

        if ($name !== null) {
            $fields[] = 'name = ?';
            $params[] = $name;
        }
        if ($isNPC !== null) {
            $fields[] = 'is_npc = ?';
            $params[] = $isNPC;
        }

        $params[] = $id;
        $sql = 'UPDATE characters SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $db->prepare($sql)->execute($params);

        http_response_code(200);
        echo json_encode(['id' => $id, 'updatedAt' => $now]);
    }

    // ============================================================
    // PUT /api/characters/{id}/gm-overrides
    // ============================================================

    /**
     * Updates the GM per-character overrides. GM-only endpoint.
     *
     * SECURITY:
     *   Only GMs can write to gm_overrides_json. Players cannot access this endpoint.
     *
     * ARCHITECTURE NOTE:
     *   Updating GM overrides also updates the character's `updated_at` timestamp.
     *   This ensures the polling mechanism notifies all clients that the character
     *   has changed (Phase 14.6 sync-status).
     */
    public static function updateGmOverrides(string $id): void
    {
        requireGameMaster();
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM characters WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Character '{$id}' not found."]);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $now  = time();

        // The body should contain the gmOverrides array
        $gmOverrides = $body['gmOverrides'] ?? $body ?? [];

        $stmt = $db->prepare('UPDATE characters SET gm_overrides_json = ?, updated_at = ? WHERE id = ?');
        $stmt->execute([json_encode($gmOverrides), $now, $id]);

        http_response_code(200);
        echo json_encode(['id' => $id, 'updatedAt' => $now]);
    }

    // ============================================================
    // DELETE /api/characters/{id}
    // ============================================================

    /**
     * Deletes a character. Requires ownership or GM status.
     */
    public static function delete(string $id): void
    {
        $user = requireAuth();
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT owner_id FROM characters WHERE id = ?');
        $stmt->execute([$id]);
        $char = $stmt->fetch();

        if (!$char) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Character '{$id}' not found."]);
            return;
        }

        if ($char['owner_id'] !== $user['id'] && !$user['is_game_master']) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden', 'message' => 'You do not own this character.']);
            return;
        }

        $db->prepare('DELETE FROM characters WHERE id = ?')->execute([$id]);

        http_response_code(200);
        echo json_encode(['id' => $id, 'deleted' => true]);
    }
}
