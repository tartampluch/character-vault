/**
 * @file +page.server.ts
 * @description Root route handler — redirects to the Campaign Hub.
 *
 * ARCHITECTURE.md section 20:
 *   "/" → Redirect to /campaigns
 *
 * The root URL is not a user-facing page. All navigation starts from
 * the Campaign Hub (/campaigns). This redirect ensures that:
 *   - Users who navigate to "/" are sent to the correct entry point.
 *   - Bookmarks to the root URL work correctly.
 *   - The Phase 5 test UI (previously at /) is no longer the default page.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  redirect(303, '/campaigns');
};
