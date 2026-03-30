<?php
/**
 * @file api/controllers/CharacterController.php
 * @description REST controller for Character resources.
 *
 * ENDPOINTS:
 *   GET    /api/characters                → index()  (global vault — all chars for GM, own chars for player)
 *   GET    /api/characters?campaignId=X   → index()  (campaign-scoped — same visibility rules)
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
require_once __DIR__ . '/../Logger.php';
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
     *       This allows the GM to view/edit overrides independently of the character data.
     *
     *   Player: Returns ONLY characters where `owner_id = current_user_id`.
     *           GM overrides are injected into the `activeFeatures` array server-side,
     *           STRIPPED OF ANY IDENTIFYING SOURCE INFORMATION (instanceId prefix changed,
     *           no `gmOverrides` field in the response). The player cannot distinguish
     *           GM-injected features from regular active features.
     *
     * SECURITY — WHY NOT INCLUDE gmOverrides DIRECTLY FOR PLAYERS?
     *   Including a `gmOverrides` field in the player response exposes secret GM data
     *   in plain JSON that any player can read via browser DevTools. Even if the frontend
     *   does not display it in the UI, the featureIds and instanceIds are visible.
     *   ARCHITECTURE.md section 18.5: "The player never sees this field or its raw content —
     *   they only see the final result after complete chain resolution."
     *
     *   SOLUTION (server-side injection):
     *     The PHP backend merges the GM override ActiveFeatureInstances into the
     *     `activeFeatures` array of the character JSON before sending to the player.
     *     This ensures:
     *       1. The frontend GameEngine still applies the overrides in DAG Phase 0.
     *       2. The player cannot distinguish GM-injected features from normal ones.
     *       3. No `gmOverrides` field exists in the player's response payload.
     *
     *   LIMITATION:
     *     The frontend GameEngine's `phase_grantedFeatIds` and feat slot logic read
     *     `activeFeatures` + `gmOverrides` separately. Since we inject GM overrides into
     *     `activeFeatures` for players, these overrides will NOT have special GM treatment
     *     from the client's perspective (e.g., they may count as manual feats). This is
     *     an acceptable trade-off: GM secret features are functionally applied but their
     *     origin (GM vs player) is intentionally hidden from the player's client.
     */
    public static function index(): void
    {
        $user = requireAuth();
        $db = Database::getInstance();

        $campaignId = $_GET['campaignId'] ?? null;

        if ($user['is_game_master']) {
            // GMs see all characters, with raw gmOverrides as a SEPARATE field.
            // When campaignId is provided: filter to that campaign only.
            // When campaignId is absent (global vault /vault): return ALL characters
            //   across all campaigns so the GM can see every character at once.
            if ($campaignId) {
                $stmt = $db->prepare('SELECT id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at FROM characters WHERE campaign_id = ?');
                $stmt->execute([$campaignId]);
            } else {
                $stmt = $db->prepare('SELECT id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at FROM characters');
                $stmt->execute();
            }
            $characters = $stmt->fetchAll();

            $result = array_map(function ($c) {
                $char = json_decode($c['character_json'], true) ?? [];
                $char['id']          = $c['id'];
                $char['campaignId']  = $c['campaign_id'];
                $char['ownerId']     = $c['owner_id'];
                $char['name']        = $c['name'];
                $char['isNPC']       = (bool)$c['is_npc'];
                $char['updatedAt']   = (int)$c['updated_at'];
                // GMs receive raw gmOverrides as a separate field (for GM dashboard editing).
                // The frontend GameEngine processes them as the final override layer in Phase 0.
                $char['gmOverrides'] = json_decode($c['gm_overrides_json'], true) ?? [];
                return $char;
            }, $characters);
        } else {
            // Players: only their own characters.
            // When campaignId is provided: filter to that campaign only.
            // When campaignId is absent (global vault /vault): return ALL of their
            //   own characters across all campaigns.
            if ($campaignId) {
                $stmt = $db->prepare('SELECT id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at FROM characters WHERE campaign_id = ? AND owner_id = ?');
                $stmt->execute([$campaignId, $user['id']]);
            } else {
                $stmt = $db->prepare('SELECT id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at FROM characters WHERE owner_id = ?');
                $stmt->execute([$user['id']]);
            }
            $characters = $stmt->fetchAll();

            $result = array_map(function ($c) {
                $char = json_decode($c['character_json'], true) ?? [];
                $char['id']         = $c['id'];
                $char['campaignId'] = $c['campaign_id'];
                $char['ownerId']    = $c['owner_id'];
                $char['name']       = $c['name'];
                $char['isNPC']      = (bool)$c['is_npc'];
                $char['updatedAt']  = (int)$c['updated_at'];

                // SECURITY: For players, GM overrides are injected INTO activeFeatures
                // rather than exposed as a separate `gmOverrides` field.
                //
                // WHY: Sending `gmOverrides` as a separate field allows any player with
                // DevTools to see the raw feature IDs and instanceIds chosen by the GM,
                // breaking the secrecy guarantee (ARCHITECTURE.md section 18.5).
                //
                // HOW: Parse the `gm_overrides_json`, strip identifying GM prefixes from
                // instanceIds, then splice the entries into the existing `activeFeatures` array.
                // The frontend GameEngine processes `activeFeatures` in Phase 0 identically
                // regardless of origin — the overrides are applied transparently.
                //
                // The `gmOverrides` field is intentionally OMITTED from the player payload.
                $gmOverrides = json_decode($c['gm_overrides_json'], true) ?? [];

                if (!empty($gmOverrides) && is_array($gmOverrides)) {
                    // Ensure activeFeatures exists and is an array
                    if (!isset($char['activeFeatures']) || !is_array($char['activeFeatures'])) {
                        $char['activeFeatures'] = [];
                    }

                    // Inject each GM override as a regular active feature instance.
                    // The instanceId is re-prefixed to avoid collisions and hide GM origin.
                    foreach ($gmOverrides as $override) {
                        if (!is_array($override) || empty($override['featureId'])) {
                            continue; // Skip malformed entries silently
                        }

                        // Remap instanceId: replace "gm_" prefix with "afi_injected_"
                        // to make it indistinguishable from player features for the client.
                        $sanitizedOverride = $override;
                        if (isset($sanitizedOverride['instanceId'])) {
                            $sanitizedOverride['instanceId'] = 'afi_injected_' . md5($override['instanceId']);
                        }

                        $char['activeFeatures'][] = $sanitizedOverride;
                    }
                }

                // Explicitly ensure NO gmOverrides field in the player response.
                unset($char['gmOverrides']);

                return $char;
            }, $characters);
        }

        Logger::info('Char', 'List', ['campaign' => $campaignId ?? 'all', 'count' => count($result)]);
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

        $db = Database::getInstance();

        // Validate that the campaignId exists and belongs to a campaign the user has access to
        if ($campaignId) {
            $campStmt = $db->prepare('SELECT id, owner_id FROM campaigns WHERE id = ?');
            $campStmt->execute([$campaignId]);
            $camp = $campStmt->fetch();

            if (!$camp) {
                http_response_code(404);
                echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$campaignId}' not found."]);
                return;
            }

            // Non-GMs can only add characters to campaigns they own
            // (GMs can add to any campaign)
            if (!$user['is_game_master'] && $camp['owner_id'] !== $user['id']) {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden', 'message' => 'You cannot add characters to a campaign you do not own.']);
                return;
            }
        }

        // Build the initial character JSON
        $characterData = $body;
        $characterData['id']        = $id;
        $characterData['campaignId'] = $campaignId;
        $characterData['ownerId']   = $user['id'];
        $characterData['isNPC']     = $isNPC;
        unset($characterData['gmOverrides']); // never include gmOverrides in character_json

        $stmt = $db->prepare('INSERT INTO characters (id, campaign_id, owner_id, name, is_npc, character_json, gm_overrides_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $campaignId, $user['id'], $name, $isNPC ? 1 : 0, json_encode($characterData), '[]', $now]);

        Logger::info('Char', 'Created', ['id' => $id, 'name' => $name, 'npc' => $isNPC]);
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

        Logger::info('Char', 'Updated', ['id' => $id, 'name' => $name ?? '(unchanged)']);
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

        Logger::info('Char', 'GM overrides updated', ['id' => $id, 'count' => count((array)$gmOverrides)]);
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

        Logger::info('Char', 'Deleted', ['id' => $id]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'deleted' => true]);
    }
}
