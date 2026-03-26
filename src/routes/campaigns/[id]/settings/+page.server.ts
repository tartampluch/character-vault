/**
 * @file src/routes/campaigns/[id]/settings/+page.server.ts
 * @description Server-side guard for the GM-only Campaign Settings page.
 *
 * DEFENCE-IN-DEPTH:
 *   Layer 1 (server-side, here): Redirect unauthenticated visitors to /login
 *     before the page loads. Detects absence of the PHP session cookie
 *     (`cvault_session`). Prevents the full page bundle from being delivered
 *     to users who have not logged in at all.
 *
 *   Layer 2 (client-side, +page.svelte): The `$effect(() => { if
 *     (!sessionContext.isGameMaster) goto(...) })` guard handles the GM-role
 *     check after the PHP session is resolved. Full role verification requires
 *     calling `GET /api/auth/me` from the browser (not replicated here to avoid
 *     server-to-server latency and to keep the PHP as the single source of truth
 *     for session data).
 *
 * @see src/routes/campaigns/[id]/settings/+page.svelte — client-side GM guard
 * @see api/auth.php — SESSION_COOKIE_NAME = 'cvault_session'
 * @see ARCHITECTURE.md §20 — GM-only route specification
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies, params }) => {
  // If there is no PHP session cookie, the user is definitely not logged in.
  // Redirect to /login immediately — no need to load the page bundle.
  const session = cookies.get('cvault_session');
  if (!session) {
    redirect(303, `/login?redirect=/campaigns/${params.id}/settings`);
  }

  // Session cookie exists: allow the page to load. The client-side $effect in
  // +page.svelte will redirect non-GMs to the campaign hub after the PHP API
  // call confirms the user's role.
};
