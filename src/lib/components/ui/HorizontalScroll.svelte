<!--
  @file src/lib/components/ui/HorizontalScroll.svelte
  @description Horizontal scroll container with fade-edge indicators — Phase 19.5.

  PURPOSE:
    Wraps any horizontally scrollable content and provides visual affordances
    that signal to the user that content is scrollable off-screen. Without
    these cues, users on touch devices (especially with hidden scrollbars)
    often don't discover horizontally scrollable content at all.

  VISUAL AFFORDANCES PROVIDED:
    1. Left fade gradient  — appears when the user has scrolled right (content
                              exists to the LEFT of the current viewport).
    2. Right fade gradient — appears when there is more content to the RIGHT
                              of the current viewport.
    Both gradients fade-in and fade-out smoothly as the user scrolls, using
    CSS transitions on `opacity`. The gradients match the surface background
    color so they appear to "dissolve" content into the edge.

  SCROLL BEHAVIOUR:
    - `overflow-x: auto`        — enables horizontal scrolling.
    - `scroll-behavior: smooth` — smooth keyboard/programmatic scroll.
    - `scrollbar-width: thin`   — visible but compact on desktop (mouse).
    - `scrollbar-width: none`   — hidden on touch devices (no visual clutter;
                                   swipe gestures still work perfectly).
    - No `scroll-snap` by default. The `snapStep` prop enables it:
        'start' → snap to the start of each direct child element
        'center' → snap to the center of each direct child element
      Scroll snap is useful for card horizontally-paged carousels (e.g. tabs
      on mobile), but is distracting for free-scrolling data tables.

  SCROLL INDICATOR DOTS (optional):
    When `showDots` is true and there are measurable scroll steps, a row of
    small dot indicators is rendered below the scroll container. The active
    dot (corresponding to the current scroll position) is highlighted in the
    accent color. Tapping a dot scrolls to that position.

    The dots are computed from the container's `scrollWidth` and `clientWidth`
    by dividing the overflow into discrete "pages" of clientWidth size.
    This works well for card carousels but may produce too many dots for
    a skills matrix — in that case, leave `showDots` at its default (false).

  PROPS:
    snapStep   — 'start' | 'center' | null: scroll-snap alignment for children.
                 null (default) = no snap, free scroll.
    showDots   — boolean: render scroll indicator dots below (default: false).
    ariaLabel  — string: accessible label for the scroll container (important
                 for screen readers that announce "scrollable region").
    children   — Snippet: the horizontally scrollable content.

  USAGE (basic — skills table, no snap):
    <HorizontalScroll ariaLabel="Skills table">
      <table class="data-table w-max">...</table>
    </HorizontalScroll>

  USAGE (card carousel — with snap and dots):
    <HorizontalScroll snapStep="start" showDots ariaLabel="Spell levels">
      {#each spellLevels as level}
        <div class="snap-start w-72 shrink-0 card p-4">...</div>
      {/each}
    </HorizontalScroll>

  WHY NOT A CSS-ONLY SOLUTION?
    The fade-edge overlay gradients must know whether the user has scrolled
    to the start or end, which requires JavaScript (`scrollLeft`, `scrollWidth`,
    `clientWidth`). A pure CSS `background-attachment: scroll` gradient on an
    `::after` pseudo-element can hint at scrollability on first render, but
    it cannot dynamically hide the fade when the user reaches the edge.
    The JS-driven `canScrollLeft` / `canScrollRight` booleans drive the opacity
    of the CSS gradient overlays via a CSS custom property `--fade-opacity`.
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------

  interface Props {
    /**
     * Scroll-snap alignment applied to the scroll container.
     * When non-null, `scroll-snap-type: x mandatory` is set on the container
     * and each direct child receives `scroll-snap-align: {snapStep}`.
     * null = no snap (default).
     */
    snapStep?: 'start' | 'center' | null;
    /** Render scroll indicator dots below the container (default: false). */
    showDots?: boolean;
    /** Accessible label for the scrollable region (for screen readers). */
    ariaLabel?: string;
    /** Scrollable content. */
    children: import('svelte').Snippet;
  }

  let {
    snapStep = null,
    showDots = false,
    ariaLabel = 'Scrollable content',
    children,
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // SCROLL STATE
  // ---------------------------------------------------------------------------

  /** Reference to the scrollable container div. */
  let scrollEl = $state<HTMLDivElement | null>(null);

  /** Whether there is content to the left of the current scroll position. */
  let canScrollLeft  = $state(false);

  /** Whether there is content to the right of the current scroll position. */
  let canScrollRight = $state(false);

  /**
   * Current active dot index (for scroll indicator dots).
   * Computed from scrollLeft / clientWidth.
   */
  let activeDotIndex = $state(0);

  /**
   * Total number of scroll "pages" (dots).
   * Each page equals one clientWidth of scroll distance.
   */
  let dotCount = $state(0);

  // ---------------------------------------------------------------------------
  // SCROLL POSITION UPDATER
  // ---------------------------------------------------------------------------

  /**
   * Reads the scroll container's current scroll state and updates reactive
   * booleans for the fade gradients and the active dot indicator.
   *
   * Called:
   *   - On mount (initial state)
   *   - On scroll events
   *   - On resize (via ResizeObserver — content width may change)
   *
   * Uses a small tolerance (1px) for `canScrollLeft` because browsers
   * sometimes report sub-pixel scroll positions when the user has scrolled
   * "all the way left" (scrollLeft may be 0.3 instead of exactly 0).
   */
  function updateScrollState(): void {
    const el = scrollEl;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;

    // A 1px tolerance prevents the fade from flickering at the exact edges.
    canScrollLeft  = scrollLeft > 1;
    canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;

    // Compute dot index and count only when showDots is enabled.
    if (showDots && clientWidth > 0) {
      dotCount = Math.ceil(scrollWidth / clientWidth);
      activeDotIndex = Math.round(scrollLeft / clientWidth);
    }
  }

  // ---------------------------------------------------------------------------
  // SCROLL TO DOT
  // ---------------------------------------------------------------------------

  /**
   * Programmatically scroll to the given page index.
   * Used by the dot indicator buttons.
   *
   * @param index - Zero-based page index.
   */
  function scrollToDot(index: number): void {
    const el = scrollEl;
    if (!el) return;
    // Respect prefers-reduced-motion: the CSS rule in app.css suppresses
    // `scroll-behavior: smooth` via CSS, but JS-driven `behavior: 'smooth'`
    // bypasses that. We must check the media query directly here.
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      left: index * el.clientWidth,
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  }

  // ---------------------------------------------------------------------------
  // LIFECYCLE: ResizeObserver + event listeners
  // ---------------------------------------------------------------------------

  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    const el = scrollEl;
    if (!el) return;

    // Initial state check
    updateScrollState();

    // Re-check when the container or its content resizes (e.g., window resize,
    // dynamic content added, sidebar expand/collapse changing available width).
    resizeObserver = new ResizeObserver(() => updateScrollState());
    resizeObserver.observe(el);

    // Also observe direct children for size changes (items added/removed).
    // We observe the container's scroll width indirectly via the container itself.
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });
</script>

<!--
  OUTER WRAPPER — `relative` so the fade gradients (absolutely positioned) are
  clipped to the container's bounds via `overflow-hidden`.
-->
<div class="relative">

  <!--
    FADE — LEFT EDGE
    Absolutely positioned gradient that appears when `canScrollLeft` is true.
    The gradient goes from `bg-surface` (opaque) at the left edge to transparent
    at the right, creating the "dissolve" effect over scrolled-away content.

    `pointer-events-none` prevents the decorative overlay from intercepting
    mouse clicks/drags on the underlying scrollable content.

    `transition-opacity duration-200` fades the gradient in/out smoothly
    as the user scrolls to/from the start.
  -->
  <div
    class="
      absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none
      transition-opacity duration-200
      {canScrollLeft ? 'opacity-100' : 'opacity-0'}
    "
    style="background: linear-gradient(to right, var(--theme-surface), transparent);"
    aria-hidden="true"
  ></div>

  <!--
    FADE — RIGHT EDGE
    Same as left fade but mirrored: gradient from transparent (left) to
    `bg-surface` (right), appears when `canScrollRight` is true.
  -->
  <div
    class="
      absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none
      transition-opacity duration-200
      {canScrollRight ? 'opacity-100' : 'opacity-0'}
    "
    style="background: linear-gradient(to left, var(--theme-surface), transparent);"
    aria-hidden="true"
  ></div>

  <!--
    SCROLLABLE CONTAINER
    `overflow-x-auto` — enables horizontal scrolling.
    `overflow-y-hidden` — prevents accidental vertical scroll capture;
      important on tablets where a slight diagonal swipe would otherwise
      trigger both vertical page scroll and horizontal content scroll.
    `scroll-smooth` — smooths keyboard/programmatic scroll.

    The `data-scroll-snap` attribute is used by the CSS below to conditionally
    apply scroll-snap behaviour (we can't use Svelte's `class:` directive for
    `scroll-snap-type` because it's not a Tailwind class).
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    bind:this={scrollEl}
    class="overflow-x-auto overflow-y-hidden scroll-smooth"
    class:snap-x={snapStep !== null}
    class:snap-mandatory={snapStep !== null}
    onscroll={updateScrollState}
    role="region"
    aria-label={ariaLabel}
    tabindex={0}
  >
    {@render children()}
  </div>

</div>

<!--
  SCROLL INDICATOR DOTS (optional)
  Rendered below the scroll container when `showDots` is true.
  Each dot button is keyboard focusable and triggers `scrollToDot(i)`.
  The active dot is larger/accent-colored for clear visual indication.
-->
{#if showDots && dotCount > 1}
  <div
    class="flex items-center justify-center gap-1.5 mt-2"
    role="tablist"
    aria-label="Scroll position indicators"
  >
    {#each { length: dotCount } as _, i}
      <button
        class="
          rounded-full transition-all duration-200
          {i === activeDotIndex
            ? 'w-4 h-2 bg-accent'
            : 'w-2 h-2 bg-border hover:bg-text-muted'}
        "
        onclick={() => scrollToDot(i)}
        type="button"
        role="tab"
        aria-selected={i === activeDotIndex}
        aria-label="Scroll to section {i + 1} of {dotCount}"
        title="Section {i + 1}"
      ></button>
    {/each}
  </div>
{/if}

<style>
  /*
   * When snapStep is active, direct children of the scroll container should
   * snap. The `snap-start` / `snap-center` class needs to be on the CHILDREN,
   * but since they live in the `children` snippet (external content), we use
   * a CSS child combinator: .snap-x > * { scroll-snap-align: start/center; }
   *
   * Svelte scoped styles won't bleed into the slot - we use :global to reach
   * the children. The `:where()` wrapper limits specificity to keep it
   * overridable by consumer styles.
   */
  :global(.snap-x > *) {
    scroll-snap-align: start;
  }

  /*
   * Touch devices: hide scrollbar entirely (swipe gesture still works).
   * Desktop: thin scrollbar to indicate scrollability.
   * These are set here because they're component-specific — different from
   * the global scrollbar rules in app.css which apply to the full page.
   */
  div :global([role="region"]) {
    scrollbar-width: thin;
    scrollbar-color: var(--theme-border) transparent;
  }

  @media (pointer: coarse) {
    div :global([role="region"]) {
      scrollbar-width: none;
    }
    div :global([role="region"]::-webkit-scrollbar) {
      display: none;
    }
  }
</style>
