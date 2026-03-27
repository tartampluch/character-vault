<!--
  @file src/lib/components/ui/Modal.svelte
  @description Unified modal wrapper — Phase 19.5.

  PURPOSE:
    Provides a single, highly reusable modal/dialog component that covers every
    modal use case in Character Vault: modifier breakdowns, dice rolls, feat
    selection, stat generation wizards, spell details, etc.

  RESPONSIVE BEHAVIOUR:
    Desktop (≥768px):
      - Centered overlay over a blurred semi-transparent backdrop.
      - Max-width is configurable via the `size` prop:
          sm   → max-w-sm  (~384px)
          md   → max-w-md  (~448px)  ← default
          lg   → max-w-lg  (~512px)
          xl   → max-w-xl  (~576px)
          2xl  → max-w-2xl (~672px)
          full → w-full h-full (no max-width, fills viewport)
      - Scrollable content area (`overflow-y-auto`) with a max-height so very
        tall modals don't overflow the viewport.

    Mobile (<768px):
      - By default: slides UP from the bottom as a "bottom sheet" — the dominant
        mobile modal pattern. This avoids the jarring centered modal that can
        obscure most of the screen on small devices.
      - When `fullscreen` prop is true (for complex modals like Feat Catalog or
        Grimoire): takes up the full viewport (no rounded corners, no max-height).
      - The animation is a CSS transform: `translate(0, 100%)` → `translate(0, 0)`.

    Reduced Motion:
      All animations are suppressed if the OS `prefers-reduced-motion: reduce`
      media query is active (handled by the base CSS in app.css).

  FOCUS TRAP:
    When the modal opens:
      1. The first focusable element inside the modal receives focus.
      2. Tab / Shift+Tab cycles ONLY through elements inside the modal.
         Pressing Tab on the last focusable element cycles back to the first.
      3. Focus is restored to the element that was focused BEFORE the modal
         opened, when the modal closes.

    WHY FOCUS TRAP IS CRITICAL:
      Without it, keyboard users can Tab behind the backdrop into invisible
      interactive elements, making the UI inaccessible and violating WCAG 2.1
      Success Criterion 2.1.2 (No Keyboard Trap) — specifically: the user must
      NEVER get stuck, but they also MUST be contained in the modal intent: a
      dialog should behave as a dialog, not a leaky container.

  CLOSE TRIGGERS:
    1. Pressing Escape (keyboard)
    2. Clicking the backdrop (outside the modal panel)
    3. Calling the `onClose` callback from within the modal's slotted content
       (e.g., a "Cancel" or "✕" button dispatching the close action)

    The modal does NOT close automatically on backdrop-click when
    `preventClose` prop is true (used for long wizards where accidental
    dismissal would lose data).

  ARIA:
    - The backdrop div has `role="dialog"` and `aria-modal="true"`.
    - `aria-labelledby` links to the modal title element (when a `title` prop
      is provided, it renders an `<h2>` with id="modal-title").
    - The backdrop is `aria-hidden="true"` — screen readers should not
      announce "backdrop" as interactive.

  PROPS:
    open         — boolean: whether the modal is currently visible
    onClose      — () => void: called when the modal should close
    size         — 'sm'|'md'|'lg'|'xl'|'2xl'|'full' (default: 'md')
    title        — optional string: displayed as a sticky header with a ✕ button
    fullscreen   — boolean: forces full-screen on mobile (default: false)
    preventClose — boolean: disables backdrop-click and Escape closing (default: false)
    children     — Snippet: the modal body content

  USAGE:
    <Modal open={showModal} onClose={() => (showModal = false)} title="Feat Details" size="lg">
      <p>Modal content here…</p>
    </Modal>

  EXAMPLE (programmatic close from within content):
    <Modal bind:open size="md" onClose={() => (open = false)}>
      <button onclick={() => (open = false)}>Close</button>
    </Modal>
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { IconClose } from '$lib/components/ui/icons';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------

  interface Props {
    /** Whether the modal is currently visible. */
    open: boolean;
    /** Callback invoked when the modal should close (Escape, backdrop click, ✕). */
    onClose: () => void;
    /**
     * Max-width preset for desktop centering.
     * 'full' = full-viewport width and height.
     */
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
    /** Optional title displayed in a sticky header with a ✕ close button. */
    title?: string;
    /**
     * On mobile (<768px): when true, the modal fills the entire viewport
     * (no bottom-sheet rounding, no max-height cap).
     * Use this for complex screens: Feat Catalog, Grimoire, stat generation.
     */
    fullscreen?: boolean;
    /**
     * When true, clicking the backdrop and pressing Escape do NOT close the
     * modal. The user must use an explicit "Cancel" or "Done" button.
     * Use for multi-step wizards where accidental dismissal loses work.
     */
    preventClose?: boolean;
    /** Modal body — rendered inside the scrollable content area. */
    children: import('svelte').Snippet;
  }

  let {
    open,
    onClose,
    size = 'md',
    title,
    fullscreen = false,
    preventClose = false,
    children,
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // DOM REFS
  // ---------------------------------------------------------------------------

  /** Reference to the modal panel element — used for focus trap boundary. */
  let panelEl = $state<HTMLDivElement | null>(null);

  /** Element that was focused before this modal opened — restored on close. */
  let previouslyFocused: HTMLElement | null = null;

  // ---------------------------------------------------------------------------
  // SIZE → MAX-WIDTH CLASS MAP
  // ---------------------------------------------------------------------------

  /**
   * Map from `size` prop to a Tailwind max-width utility class.
   * These are stable, non-dynamic strings — safe for Tailwind's static scanner.
   */
  const SIZE_CLASSES: Record<NonNullable<Props['size']>, string> = {
    sm:   'md:max-w-sm',
    md:   'md:max-w-md',
    lg:   'md:max-w-lg',
    xl:   'md:max-w-xl',
    '2xl':'md:max-w-2xl',
    full: 'md:max-w-full',
  };

  const sizeClass = $derived(SIZE_CLASSES[size]);

  // ---------------------------------------------------------------------------
  // PANEL CSS CLASS
  // ---------------------------------------------------------------------------

  /**
   * The modal panel's combined CSS class string, built from the props.
   *
   * Desktop layout:
   *   - `md:mx-auto md:my-8 md:rounded-xl` — centered with margin
   *   - `md:max-h-[calc(100vh-4rem)]` — caps height so it never overflows viewport
   *   - `{sizeClass}` — max-width from the `size` prop
   *
   * Mobile layout (< md = < 768px):
   *   - `w-full rounded-t-xl mt-auto` — bottom sheet: full width, rounded top
   *   - When `fullscreen`: `h-full rounded-none` — fills entire screen
   *   - When normal: `max-h-[90vh]` — allows 10% of screen to peek beneath
   */
  const panelClass = $derived([
    'relative flex flex-col bg-surface shadow-xl',
    // Desktop: centered, constrained
    'md:mx-auto md:my-8 md:rounded-xl md:max-h-[calc(100vh-4rem)]',
    // Desktop max-width from size prop
    sizeClass,
    // Mobile: bottom sheet
    'w-full rounded-t-xl mt-auto md:mt-0',
    // Fullscreen on mobile or normal max-height
    fullscreen
      ? 'h-full rounded-none md:rounded-xl'
      : 'max-h-[90vh] md:max-h-[calc(100vh-4rem)]',
  ].join(' '));

  // ---------------------------------------------------------------------------
  // FOCUS TRAP SETUP
  // ---------------------------------------------------------------------------

  /**
   * Returns all focusable elements inside the given container.
   * The selector covers all standard interactive HTML elements and any
   * elements with tabindex >= 0 (explicitly made focusable).
   *
   * @param container - The DOM node to search within.
   * @returns Array of focusable HTMLElements, in DOM order.
   */
  function getFocusable(container: HTMLElement): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'details > summary',
    ].join(', ');
    return Array.from(container.querySelectorAll<HTMLElement>(selector));
  }

  /**
   * Handle keydown events on the modal panel.
   * Implements:
   *   - Escape → close (unless preventClose)
   *   - Tab / Shift+Tab → cycle within focusable elements only (focus trap)
   *
   * @param event - The keyboard event from the panel's onkeydown listener.
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (!panelEl) return;

    if (event.key === 'Escape') {
      if (!preventClose) {
        event.preventDefault();
        onClose();
      }
      return;
    }

    if (event.key === 'Tab') {
      const focusable = getFocusable(panelEl);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (event.shiftKey) {
        // Shift+Tab: if focus is on the first element, wrap to last
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus is on the last element, wrap to first
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  }

  /**
   * Handle backdrop click — close the modal unless preventClose is set.
   *
   * IMPORTANT: We stop propagation in the panel's click handler so that
   * clicks INSIDE the panel do not bubble up to the backdrop and trigger
   * an accidental close.
   */
  function handleBackdropClick(): void {
    if (!preventClose) {
      onClose();
    }
  }

  // ---------------------------------------------------------------------------
  // OPEN/CLOSE LIFECYCLE
  // ---------------------------------------------------------------------------

  /**
   * $effect: reacts to `open` state changes.
   *
   * ON OPEN:
   *   1. Save the currently focused element so we can restore focus on close.
   *   2. After next microtask (tick), focus the first focusable element inside
   *      the modal. We use a 10ms timeout to ensure the DOM has stabilized
   *      after Svelte's reactive rendering cycle completes.
   *   3. Add overflow:hidden to <body> to prevent scroll-behind-modal.
   *
   * ON CLOSE:
   *   1. Remove overflow:hidden from <body>.
   *   2. Restore focus to the element that was focused before opening.
   */
  $effect(() => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      document.body.style.overflow = 'hidden';

      // Small delay to let Svelte render the modal DOM before focusing
      setTimeout(() => {
        if (panelEl) {
          const focusable = getFocusable(panelEl);
          if (focusable.length > 0) {
            focusable[0].focus();
          } else {
            panelEl.focus();
          }
        }
      }, 10);
    } else {
      document.body.style.overflow = '';
      // Restore focus to the trigger element
      setTimeout(() => {
        previouslyFocused?.focus();
      }, 0);
    }
  });

  onDestroy(() => {
    // Safety: always restore body overflow if modal is destroyed while open
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  });
</script>

<!--
  MODAL CONTAINER

  Only rendered when `open` is true. The outer `div` covers the entire viewport
  and acts as the clickable backdrop. The inner `.modal-panel` is the actual
  dialog content — click propagation is stopped on it.

  Z-INDEX LAYERING:
    z-50 — modal backdrop (above sidebar z-40, above content)
    z-50 — modal panel (same layer, naturally above backdrop due to DOM order)

  ANIMATION:
    Desktop: The panel fades+scales in from opacity-0/scale-95 to opacity-100/scale-100.
    Mobile:  The panel slides up from translate-y-full to translate-y-0.
    app.css already handles `prefers-reduced-motion: reduce` globally.
-->
{#if open}
  <!--
    BACKDROP
    Full-screen clickable overlay. `aria-hidden="true"` because the backdrop
    itself carries no semantic meaning — the dialog panel has role="dialog".
    `transition:fade` fades the backdrop in/out with 200ms duration.
    `prefers-reduced-motion` is handled globally in app.css (transitions become 0.01ms).
  -->
  <div
    class="modal-backdrop"
    onclick={handleBackdropClick}
    aria-hidden="true"
    transition:fade={{ duration: 200 }}
  >
    <!--
      MODAL PANEL
      Stops click propagation so clicking inside the modal doesn't close it.
      `role="dialog"` + `aria-modal="true"` announces it correctly to screen readers.
      `tabindex="-1"` makes the panel itself focusable as a fallback when no
      child elements are focusable (rare edge case, e.g. a loading state).
    -->
    <!--
      Panel transition:
        Mobile: slides up from the bottom (fly with positive y).
        Desktop: fades + scales in from 95% (fly with y=0 + CSS scale via opacity).
      A single `fly` with y=16 (16px) gives a subtle "lift" on desktop and a
      visible slide on mobile (where the panel has mt-auto and is at the bottom).
      Duration 200ms matches the sidebar animation duration.
    -->
    <div
      bind:this={panelEl}
      class={panelClass}
      transition:fly={{ y: 16, duration: 200, opacity: 0 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      tabindex="-1"
    >

      <!--
        OPTIONAL STICKY HEADER
        Rendered when the `title` prop is provided.
        Contains the title text + a ✕ close button. Sticky at the top so
        titles remain visible when scrolling long modal content.
        A bottom border visually separates it from the scrollable body.
      -->
      {#if title}
        <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 id="modal-title" class="text-base font-semibold text-text-primary">
            {title}
          </h2>
          {#if !preventClose}
            <button
              class="btn-ghost btn-icon -mr-1"
              onclick={onClose}
              title="Close"
              aria-label="Close dialog"
              type="button"
            >
              <IconClose size={20} aria-hidden="true" />
            </button>
          {/if}
        </div>
      {/if}

      <!--
        SCROLLABLE CONTENT AREA
        `overflow-y-auto` allows content to scroll when it exceeds the
        modal's max-height. Padding gives comfortable reading margin.
        `flex-1` ensures the content area fills remaining space in the
        flex column (so a sticky footer — if any — stays at the bottom).
      -->
      <div class="flex-1 overflow-y-auto p-4">
        {@render children()}
      </div>

    </div>
  </div>
{/if}

<!--
  BOTTOM-SHEET POSITIONING ON MOBILE:
  The backdrop `.modal-backdrop` is `fixed inset-0 flex flex-col` (covers the full
  screen and acts as a flex container). The flex layout (justify-end on mobile,
  justify-center on md+) is defined in `src/app.css` under the `.modal-backdrop`
  component class — keeping this component's <style> block to keyframes-only
  per the Phase 19.14 Tailwind migration completeness rule.
-->
