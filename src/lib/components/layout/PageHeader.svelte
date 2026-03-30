<!--
  @file src/lib/components/layout/PageHeader.svelte
  @description Normalised page header used by every full-page route.

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  TWO LAYOUT MODES — same title strip in both cases                       │
  │                                                                          │
  │  STANDARD MODE (default — no `banner` prop)                              │
  │    sticky top-0, fully opaque bg-surface                                 │
  │    ← Breadcrumb label                                                    │
  │    [Icon]  Title                                          [Actions ▶]    │
  │    Subtitle (muted)                                                      │
  │                                                                          │
  │  BANNER MODE (`banner` prop provided)                                    │
  │    ┌─────────────────────────────────────────────────────────────────┐   │
  │    │  Layer 1 — plain image OR plain accent-gradient placeholder.    │   │
  │    │  Layer 2 — gradient overlay (from-black/80 → transparent).      │   │
  │    │  Both scroll with the page until the title strip sticks.        │   │
  │    └─────────────────────────────────────────────────────────────────┘   │
  │    ┌─────────────────────────────────────────────────────────────────┐   │
  │    │  Title strip — identical markup to standard mode.               │   │
  │    └─────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────┘

  PROPS
  ─────
  title       — Page heading (required). Caller resolves via ui().
  subtitle    — Optional muted line below the title.
  icon        — Optional Svelte icon component. Rendered at 22px.
  breadcrumb  — Optional back-link. { href, label, ariaLabel? }
  banner      — When provided, activates banner mode.
                  { src?: string | null; alt?: string }
                  src = image URL or base64 data-URI.
                  null / undefined → show accent gradient placeholder.
  actions     — Svelte 5 snippet: action buttons on the right.
-->

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { IconBack, IconCampaign } from '$lib/components/ui/icons';

  interface BannerProp {
    src?: string | null;
    alt?: string;
  }

  interface BreadcrumbProp {
    href: string;
    label: string;
    ariaLabel?: string;
  }

  interface Props {
    title: string;
    subtitle?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: any;
    breadcrumb?: BreadcrumbProp;
    banner?: BannerProp;
    actions?: Snippet;
  }

  let {
    title,
    subtitle,
    icon,
    breadcrumb,
    banner,
    actions,
  }: Props = $props();

  const isBannerMode   = $derived(banner !== undefined);
  const hasBannerImage = $derived(
    isBannerMode && typeof banner?.src === 'string' && banner.src.length > 0
  );
</script>

<!-- ============================================================================
     BANNER MODE — image/placeholder area only; title strip is shared below.
============================================================================ -->
{#if isBannerMode}

  <!-- ── Banner area: Layer 1 (plain) + Layer 2 (gradient) ────────────── -->
  <div class="relative w-full h-52 overflow-hidden shrink-0">

    {#if hasBannerImage}
      <!-- Layer 1: banner image, unmodified -->
      <img
        src={banner!.src!}
        alt={banner!.alt ?? title}
        class="w-full h-full object-cover"
      />
    {:else}
      <!-- Layer 1: default accent-gradient placeholder with glyph -->
      <div
        class="w-full h-full flex items-center justify-center
               bg-gradient-to-br from-accent-100 to-accent-50
               dark:from-accent-950 dark:to-accent-900"
        aria-hidden="true"
      >
        <IconCampaign size={72} class="opacity-20 text-accent" />
      </div>
    {/if}

    <!-- Layer 2: gradient overlay — always applied regardless of image -->
    <div
      class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
      aria-hidden="true"
    ></div>
  </div>

{/if}

<!-- ============================================================================
     TITLE STRIP — shared by both modes.
     sticky top-0, fully opaque bg-surface so page content never shows through.
============================================================================ -->
<header class="sticky top-0 z-30 bg-surface border-b border-border">
  <div class="flex items-center justify-between gap-3 px-5 py-3 flex-wrap">

    <!-- Left: breadcrumb + title + optional subtitle -->
    <div class="flex flex-col gap-0.5 min-w-0">

      {#if breadcrumb}
        <a
          href={breadcrumb.href}
          class="inline-flex items-center gap-1 text-xs text-text-muted
                 hover:text-accent transition-colors w-fit"
          aria-label={breadcrumb.ariaLabel ?? breadcrumb.label}
        >
          <IconBack size={12} aria-hidden="true" />
          {breadcrumb.label}
        </a>
      {/if}

      <h1 class="flex items-center gap-2 text-2xl font-bold text-text-primary leading-tight">
        {#if icon}
          {@const DynIcon = icon}
          <DynIcon size={22} aria-hidden="true" />
        {/if}
        {title}
      </h1>

      {#if subtitle}
        <p class="text-sm text-text-muted">{subtitle}</p>
      {/if}

    </div>

    <!-- Right: action buttons -->
    {#if actions}
      <div class="flex items-center gap-2 shrink-0 flex-wrap">
        {@render actions()}
      </div>
    {/if}

  </div>
</header>
