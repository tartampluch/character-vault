/**
 * @file src/lib/api/templatesApi.ts
 * @description Client-side helpers for the Template API endpoints.
 *
 * WHAT ARE TEMPLATES?
 *   Templates are GM-owned NPC/Monster blueprints stored in the `templates` table.
 *   They are campaign-agnostic — not tied to any campaign.  GMs "spawn" templates
 *   into campaigns, creating Character instances in the `characters` table.
 *
 * ENDPOINTS (GM only):
 *   GET    /api/templates              — list all templates
 *   GET    /api/templates?type=npc     — list NPC templates
 *   GET    /api/templates?type=monster — list Monster templates
 *   POST   /api/templates              — create template
 *   PUT    /api/templates/{id}         — update template
 *   DELETE /api/templates/{id}         — delete template
 *   POST   /api/templates/{id}/spawn   — spawn instance into campaign
 *
 * USAGE:
 *   The global vault page uses this module to list and manage templates.
 *   The campaign vault page's SpawnModal uses `spawnTemplate()` to create instances.
 *
 * @see api/controllers/TemplateController.php for the backend implementation.
 * @see src/lib/engine/GameEngine.svelte.ts for engine-level template state.
 */

import type { Character } from '$lib/types/character';
import { apiHeaders } from '$lib/engine/StorageManager';

// ============================================================
// GET — list templates
// ============================================================

/**
 * Fetches all templates (or filtered by type) from the API.
 *
 * @param type - Optional filter: 'npc' | 'monster'. Omit for all templates.
 * @returns Array of template Character objects (empty on error).
 */
export async function getTemplates(type?: 'npc' | 'monster'): Promise<Character[]> {
  try {
    const url = type ? `/api/templates?type=${type}` : '/api/templates';
    const res = await fetch(url, {
      headers: apiHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      console.warn('[templatesApi] getTemplates HTTP', res.status);
      return [];
    }
    return (await res.json()) as Character[];
  } catch (err) {
    console.warn('[templatesApi] getTemplates unavailable:', err);
    return [];
  }
}

// ============================================================
// POST — spawn a template instance into a campaign
// ============================================================

/**
 * Spawns a character instance from a template into a specific campaign.
 *
 * NPC type:
 *   character.name       = template.name
 *   character.playerName = GM's display name (who pressed "Spawn NPC")
 *
 * Monster type:
 *   character.name       = instanceName ?? template.name  (GM may customise)
 *   character.playerName = template.name  (species, e.g. "Wolf")
 *
 * @param templateId   - ID of the template to spawn from.
 * @param campaignId   - Campaign to spawn the instance into.
 * @param instanceName - Optional; Monster only — custom name for the instance.
 *                       Ignored for NPC type (always uses template name).
 * @returns The spawned character data ({ id, name, playerName, npcType }), or null on error.
 */
export async function spawnTemplate(
  templateId: string,
  campaignId: string,
  instanceName?: string,
): Promise<{ id: string; name: string; playerName: string; npcType: string; campaignId: string } | null> {
  try {
    const body: Record<string, string> = { campaignId };
    if (instanceName) body.instanceName = instanceName;

    const res = await fetch(`/api/templates/${templateId}/spawn`, {
      method: 'POST',
      headers: apiHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('[templatesApi] spawnTemplate HTTP', res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[templatesApi] spawnTemplate unavailable:', err);
    return null;
  }
}

// ============================================================
// DELETE — remove a template
// ============================================================

/**
 * Deletes a template by ID.
 * Spawned instances (characters) are NOT affected — they are independent.
 *
 * @param templateId - Template ID to delete.
 * @returns `true` on success, `false` on error.
 */
export async function deleteTemplate(templateId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/templates/${templateId}`, {
      method: 'DELETE',
      headers: apiHeaders(),
      credentials: 'include',
    });
    return res.ok;
  } catch (err) {
    console.warn('[templatesApi] deleteTemplate unavailable:', err);
    return false;
  }
}
