/**
 * @file src/routes/content-editor/new/+page.ts
 * @description Load function for the global NewEntityPage.
 *
 * Reads the optional `cloneFrom` URL search parameter so the page can
 * pre-populate EntityForm with a cloned entity's data.
 */

export const load = ({ url }: { url: URL }) => {
  const cloneFrom = url.searchParams.get('cloneFrom') ?? undefined;
  return { cloneFrom };
};
