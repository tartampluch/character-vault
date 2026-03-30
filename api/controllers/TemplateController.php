<?php
/**
 * @file api/controllers/TemplateController.php
 * @description REST controller for Character Template resources.
 *
 * WHAT IS A TEMPLATE?
 *   A template is a reusable NPC or Monster blueprint stored in the `templates`
 *   table.  It shares the same JSON data structure as a regular Character, but
 *   lives independently of any campaign.  GMs "spawn" templates into specific
 *   campaigns, creating a Character instance in the `characters` table.
 *
 * ENDPOINTS:
 *   GET    /api/templates              → index()              (GM only)
 *   GET    /api/templates?type=npc     → index()              (GM only, filtered)
 *   GET    /api/templates/{id}         → show($id)            (GM only)
 *   POST   /api/templates              → create()             (GM only)
 *   PUT    /api/templates/{id}         → update($id)          (GM only)
 *   DELETE /api/templates/{id}         → delete($id)          (GM only)
 *   POST   /api/templates/{id}/spawn   → spawn($id)           (GM only)
 *
 * TEMPLATE TYPES:
 *   'npc'     — Non-player character managed by the GM.
 *               When spawned: character.name = template.name
 *                              character.playerName = spawner's display name
 *   'monster' — Creature with a species name separate from its instance name.
 *               When spawned: character.name = instanceName (editable, defaults to template name)
 *                              character.playerName = template.name (the species, e.g. "Wolf")
 *
 * SPAWN BEHAVIOUR:
 *   Spawning copies the template_json into a new row in the `characters` table,
 *   overriding name/playerName/campaignId/ownerId/isNPC/npcType fields.
 *   The template itself is never modified by spawning.
 *
 * VISIBILITY:
 *   All template operations require GM or Admin role.
 *   Players never see template data directly — only the spawned character instances.
 *
 * @see api/migrate.php for the `templates` table schema.
 * @see api/controllers/CharacterController.php for the character instances.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../Logger.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../auth.php';

class TemplateController
{
    // ============================================================
    // GET /api/templates  (or ?type=npc|monster)
    // ============================================================

    /**
     * Lists all templates visible to the requester (GM or Admin only).
     * Optional `?type=npc` or `?type=monster` query parameter filters by type.
     */
    public static function index(): void
    {
        $user = requireGameMaster();
        $db   = Database::getInstance();

        $type = $_GET['type'] ?? null;

        if ($type !== null) {
            // Validate the type value to prevent SQL injection via the param.
            if (!in_array($type, ['npc', 'monster'], true)) {
                http_response_code(422);
                echo json_encode(['error' => 'InvalidType', 'message' => 'type must be "npc" or "monster"']);
                return;
            }
            $stmt = $db->prepare('SELECT id, type, owner_id, name, template_json, updated_at FROM templates WHERE type = ? ORDER BY name ASC');
            $stmt->execute([$type]);
        } else {
            $stmt = $db->prepare('SELECT id, type, owner_id, name, template_json, updated_at FROM templates ORDER BY type ASC, name ASC');
            $stmt->execute();
        }

        $templates = $stmt->fetchAll();

        $result = array_map(function ($t) {
            $data = json_decode($t['template_json'], true) ?? [];
            // Always embed these top-level fields so the frontend has them without
            // parsing the nested JSON separately.
            $data['id']         = $t['id'];
            $data['name']       = $t['name'];
            $data['npcType']    = $t['type'];   // 'npc' | 'monster'
            $data['ownerId']    = $t['owner_id'];
            $data['isNPC']      = true;          // All templates are NPC/Monster
            $data['isTemplate'] = true;          // Flag for the frontend StorageManager
            $data['updatedAt']  = (int)$t['updated_at'];
            return $data;
        }, $templates);

        Logger::info('Template', 'List', ['count' => count($result), 'type' => $type ?? 'all']);
        http_response_code(200);
        echo json_encode($result);
    }

    // ============================================================
    // GET /api/templates/{id}
    // ============================================================

    /**
     * Returns a single template by ID (GM or Admin only).
     */
    public static function show(string $id): void
    {
        requireGameMaster();
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id, type, owner_id, name, template_json, updated_at FROM templates WHERE id = ?');
        $stmt->execute([$id]);
        $t = $stmt->fetch();

        if (!$t) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Template '{$id}' not found."]);
            return;
        }

        $data = json_decode($t['template_json'], true) ?? [];
        $data['id']         = $t['id'];
        $data['name']       = $t['name'];
        $data['npcType']    = $t['type'];
        $data['ownerId']    = $t['owner_id'];
        $data['isNPC']      = true;
        $data['isTemplate'] = true;
        $data['updatedAt']  = (int)$t['updated_at'];

        http_response_code(200);
        echo json_encode($data);
    }

    // ============================================================
    // POST /api/templates
    // ============================================================

    /**
     * Creates a new template (GM or Admin only).
     *
     * REQUEST BODY:
     *   {
     *     "id":      string  — caller-generated ID (optional; generated if absent)
     *     "npcType": "npc"|"monster"  — required
     *     "name":    string  — required
     *     ... (any additional Character-compatible fields)
     *   }
     */
    public static function create(): void
    {
        $user = requireGameMaster();

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $id   = $body['id'] ?? ('tmpl_' . bin2hex(random_bytes(8)));
        $now  = time();

        $type = $body['npcType'] ?? null;
        if (!in_array($type, ['npc', 'monster'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'InvalidType', 'message' => 'npcType must be "npc" or "monster"']);
            return;
        }

        $name = trim($body['name'] ?? '');
        if ($name === '') {
            $name = $type === 'monster' ? 'New Monster' : 'New NPC';
        }

        // Build the stored JSON blob.  We embed id/name/npcType/isNPC/isTemplate
        // directly in the blob so the character editor can read them without
        // a separate API call.
        $templateData = $body;
        $templateData['id']         = $id;
        $templateData['name']       = $name;
        $templateData['npcType']    = $type;
        $templateData['isNPC']      = true;
        $templateData['isTemplate'] = true;
        $templateData['ownerId']    = $user['id'];
        // Templates are not linked to any campaign.
        unset($templateData['campaignId']);
        // Sanitise: templates should never carry GM override data.
        unset($templateData['gmOverrides']);

        $db = Database::getInstance();
        $stmt = $db->prepare('INSERT INTO templates (id, type, owner_id, name, template_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $type, $user['id'], $name, json_encode($templateData), $now]);

        Logger::info('Template', 'Created', ['id' => $id, 'name' => $name, 'type' => $type]);
        http_response_code(201);
        echo json_encode(['id' => $id, 'name' => $name, 'npcType' => $type, 'updatedAt' => $now]);
    }

    // ============================================================
    // PUT /api/templates/{id}
    // ============================================================

    /**
     * Updates an existing template (GM or Admin only).
     * The `type` (npc/monster) is immutable once set — changing it would
     * invalidate existing spawned instances' npcType metadata.
     */
    public static function update(string $id): void
    {
        $user = requireGameMaster();
        $db   = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM templates WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Template '{$id}' not found."]);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $now  = time();

        // Extract mutable top-level fields.
        $name = trim($body['name'] ?? '');

        // Sanitise: strip fields that should never be stored in template_json.
        $body['id']         = $id;
        $body['isTemplate'] = true;
        $body['isNPC']      = true;
        unset($body['gmOverrides'], $body['campaignId']);

        if ($name === '') {
            // Fetch current name if the caller omitted it.
            $ns = $db->prepare('SELECT name FROM templates WHERE id = ?');
            $ns->execute([$id]);
            $row = $ns->fetch();
            $name = $row ? $row['name'] : 'Template';
        }
        $body['name'] = $name;

        $params = [json_encode($body), $now, $name, $id];
        $db->prepare('UPDATE templates SET template_json = ?, updated_at = ?, name = ? WHERE id = ?')->execute($params);

        Logger::info('Template', 'Updated', ['id' => $id, 'name' => $name]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'updatedAt' => $now]);
    }

    // ============================================================
    // DELETE /api/templates/{id}
    // ============================================================

    /**
     * Deletes a template (GM or Admin only).
     * Spawned instances (characters table) are NOT deleted — they are independent.
     */
    public static function delete(string $id): void
    {
        requireGameMaster();
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM templates WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Template '{$id}' not found."]);
            return;
        }

        $db->prepare('DELETE FROM templates WHERE id = ?')->execute([$id]);

        Logger::info('Template', 'Deleted', ['id' => $id]);
        http_response_code(200);
        echo json_encode(['id' => $id, 'deleted' => true]);
    }

    // ============================================================
    // POST /api/templates/{id}/spawn
    // ============================================================

    /**
     * Spawns a character instance from a template into a specific campaign.
     *
     * SPAWN LOGIC (per user requirements):
     *
     *   NPC type:
     *     character.name       = template.name   (unchanged)
     *     character.playerName = GM's display_name  (who pressed "Spawn NPC")
     *
     *   Monster type:
     *     character.name       = instanceName ?? template.name  (GM may customise)
     *     character.playerName = template.name  (original species name, e.g. "Wolf")
     *
     *   Both:
     *     isNPC      = true
     *     npcType    = template.type
     *     campaignId = from request body
     *     ownerId    = spawner's user ID
     *
     * REQUEST BODY:
     *   {
     *     "campaignId":   string  — required; the campaign to spawn into
     *     "instanceName": string  — optional; Monster only — overrides character.name
     *   }
     *
     * @param string $id  Template ID (from URL parameter)
     */
    public static function spawn(string $id): void
    {
        $user = requireGameMaster();
        $db   = Database::getInstance();

        // Load the template.
        $stmt = $db->prepare('SELECT id, type, name, template_json FROM templates WHERE id = ?');
        $stmt->execute([$id]);
        $tmpl = $stmt->fetch();

        if (!$tmpl) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Template '{$id}' not found."]);
            return;
        }

        $body       = json_decode(file_get_contents('php://input'), true) ?? [];
        $campaignId = $body['campaignId'] ?? null;

        if (!$campaignId) {
            http_response_code(422);
            echo json_encode(['error' => 'MissingField', 'message' => 'campaignId is required for spawning.']);
            return;
        }

        // Validate that the campaign exists.
        $campStmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
        $campStmt->execute([$campaignId]);
        if (!$campStmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'NotFound', 'message' => "Campaign '{$campaignId}' not found."]);
            return;
        }

        $templateType = $tmpl['type'];  // 'npc' | 'monster'
        $templateName = $tmpl['name'];

        // Build the new character from the template JSON.
        $charData = json_decode($tmpl['template_json'], true) ?? [];

        // Generate a fresh ID for the spawned instance.
        $charId = 'npc_' . bin2hex(random_bytes(8));
        $now    = time();

        // ── Name resolution ─────────────────────────────────────────────────
        // NPC:     character.name = template name, playerName = GM display name
        // Monster: character.name = instanceName (editable, defaults to template name)
        //          character.playerName = template name (species name, e.g. "Wolf")
        if ($templateType === 'npc') {
            $charName   = $templateName;
            $playerName = $user['display_name'] ?? $user['username'];
        } else {
            // Monster — the GM may provide a custom instance name in the request.
            $instanceName = trim($body['instanceName'] ?? '');
            $charName     = $instanceName !== '' ? $instanceName : $templateName;
            $playerName   = $templateName;  // Species/original name
        }

        // ── Override identity fields ─────────────────────────────────────────
        $charData['id']         = $charId;
        $charData['name']       = $charName;
        $charData['playerName'] = $playerName;
        $charData['campaignId'] = $campaignId;
        $charData['ownerId']    = $user['id'];
        $charData['isNPC']      = true;
        $charData['npcType']    = $templateType;

        // Remove template-specific flags — the spawned instance is a character.
        unset($charData['isTemplate']);
        unset($charData['gmOverrides']);

        // Insert into the characters table.
        $stmt = $db->prepare('
            INSERT INTO characters
                (id, campaign_id, owner_id, name, is_npc, npc_type, character_json, gm_overrides_json, updated_at)
            VALUES
                (?, ?, ?, ?, 1, ?, ?, \'[]\', ?)
        ');
        $stmt->execute([$charId, $campaignId, $user['id'], $charName, $templateType, json_encode($charData), $now]);

        Logger::info('Template', 'Spawned', [
            'templateId' => $id,
            'charId'     => $charId,
            'type'       => $templateType,
            'name'       => $charName,
            'campaign'   => $campaignId,
        ]);
        http_response_code(201);
        echo json_encode([
            'id'         => $charId,
            'name'       => $charName,
            'playerName' => $playerName,
            'npcType'    => $templateType,
            'campaignId' => $campaignId,
            'updatedAt'  => $now,
        ]);
    }
}
