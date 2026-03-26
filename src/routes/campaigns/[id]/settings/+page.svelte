<!--
  @file src/routes/campaigns/[id]/settings/+page.svelte
  @description GM-only Campaign Settings — Rule Source Manager + Global Overrides.
  Phase 19.12: Migrated to Tailwind CSS — all scoped <style> removed.

  LAYOUT:
    Sticky page header (back link, title, GM badge, Save button).
    Section 1: Rule Sources — draggable enabled list + available (disabled) list.
    Section 2: GM Global Overrides — JSON textarea with live validation.
-->

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionContext } from '$lib/engine/SessionContext.svelte';
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { campaignStore } from '$lib/engine/CampaignStore.svelte';
  import { storageManager, apiHeaders } from '$lib/engine/StorageManager';
  import { dataLoader } from '$lib/engine/DataLoader';
  import { IconSettings, IconGMDashboard, IconSpells, IconChecked, IconError, IconWarning, IconSuccess, IconDragHandle, IconBack, IconAdd, IconDelete, IconChevronDown, IconChevronUp, IconVault } from '$lib/components/ui/icons';
  import { ui, uiN } from '$lib/i18n/ui-strings';
  import { getCampaignUsers, addCampaignUser, removeCampaignUser, listUsers, ApiError } from '$lib/api/userApi';
  import type { CampaignMember, User } from '$lib/types/user';

  $effect(() => {
    if (!sessionContext.isGameMaster) goto(`/campaigns/${campaignId}`);
  });

  const campaignId = $derived($page.params.id ?? '');
  const campaign   = $derived(campaignStore.getCampaign(campaignId));

  // ── Chapter management ─────────────────────────────────────────────────────
  interface EditableTask {
    id: string;
    title: Record<string, string>;
    isCompleted: boolean;
  }

  interface EditableChapter {
    id: string;
    title: Record<string, string>;
    description: Record<string, string>;
    isCompleted: boolean;
    tasks: EditableTask[];
  }

  let editableChapters = $state<EditableChapter[]>([]);

  /**
   * The `updatedAt` timestamp of the last campaign snapshot we synced chapters
   * from.  -1 means we haven't synced yet.
   *
   * We re-sync when:
   *   a) first load (syncedUpdatedAt === -1), OR
   *   b) the server has a newer timestamp AND no unsaved edits exist.
   *
   * Once the user edits a chapter we set chaptersAreDirty = true so that a
   * concurrent poll cycle doesn't silently overwrite their in-progress work.
   * The flag is cleared again after a successful save.
   */
  let syncedUpdatedAt  = $state<number>(-1);
  let chaptersAreDirty = $state(false);

  $effect(() => {
    const c = campaign;
    if (!c) return;
    if (syncedUpdatedAt === -1 || (!chaptersAreDirty && c.updatedAt > syncedUpdatedAt)) {
      editableChapters = (c.chapters ?? []).map(ch => ({
        id: ch.id,
        title: { ...ch.title },
        description: { ...ch.description },
        isCompleted: ch.isCompleted,
        tasks: ((ch as unknown as Record<string, unknown>)['tasks'] as EditableTask[] ?? []).map(t => ({
          id: t.id,
          title: { ...t.title },
          isCompleted: t.isCompleted,
        })),
      }));
      syncedUpdatedAt  = c.updatedAt;
      chaptersAreDirty = false;
    }
  });

  function addChapter() {
    chaptersAreDirty = true;
    editableChapters = [...editableChapters, {
      id: `chap_${Date.now()}`,
      title: {},
      description: {},
      isCompleted: false,
      tasks: [],
    }];
  }

  // ── Chapter drag-to-reorder ───────────────────────────────────────────────
  let chapterDragSrc = $state<number | null>(null);

  function handleChapterDragStart(index: number) {
    chapterDragSrc = index;
  }
  function handleChapterDragOver(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (chapterDragSrc === null || chapterDragSrc === targetIndex) return;
    const list = [...editableChapters];
    const [removed] = list.splice(chapterDragSrc, 1);
    list.splice(targetIndex, 0, removed);
    editableChapters = list;
    chapterDragSrc   = targetIndex;
    chaptersAreDirty = true;
  }
  function handleChapterDragEnd() { chapterDragSrc = null; }

  // ── Task drag-to-reorder (per chapter) ───────────────────────────────────
  let taskDragSrc = $state<{ chapterId: string; index: number } | null>(null);

  function handleTaskDragStart(chapterId: string, index: number) {
    taskDragSrc = { chapterId, index };
  }
  function handleTaskDragOver(event: DragEvent, chapterId: string, targetIndex: number) {
    event.preventDefault();
    if (!taskDragSrc || taskDragSrc.chapterId !== chapterId || taskDragSrc.index === targetIndex) return;
    const ch = editableChapters.find(c => c.id === chapterId);
    if (!ch) return;
    const tasks = [...ch.tasks];
    const [removed] = tasks.splice(taskDragSrc.index, 1);
    tasks.splice(targetIndex, 0, removed);
    ch.tasks         = tasks;
    taskDragSrc      = { chapterId, index: targetIndex };
    chaptersAreDirty = true;
  }
  function handleTaskDragEnd() { taskDragSrc = null; }

  function addTask(chapterId: string) {
    chaptersAreDirty = true;
    const ch = editableChapters.find(c => c.id === chapterId);
    if (!ch) return;
    ch.tasks = [...ch.tasks, {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: {},
      isCompleted: false,
    }];
  }

  function removeTask(chapterId: string, taskId: string) {
    chaptersAreDirty = true;
    const ch = editableChapters.find(c => c.id === chapterId);
    if (!ch) return;
    ch.tasks = ch.tasks.filter(t => t.id !== taskId);
  }

  function removeChapter(id: string) {
    chaptersAreDirty = true;
    editableChapters = editableChapters.filter(ch => ch.id !== id);
  }

  // ── Rule source file metadata (one entry per JSON file from GET /api/rules/list) ──
  interface RuleSourceFile { path: string; ruleSource: string; entityCount: number; description: string; }
  let availableFiles = $state<RuleSourceFile[]>([]);
  let loadingError   = $state('');

  async function loadAvailableSources() {
    try {
      const response = await fetch('/api/rules/list', { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      availableFiles = await response.json();
      loadingError = '';
    } catch (err) {
      loadingError = `Could not load rule sources: ${err}`;
      availableFiles = [];
    }
  }

  $effect(() => { if (sessionContext.isGameMaster) loadAvailableSources(); });

  /**
   * All distinct ruleSource group IDs present in the available file list.
   * Used for the "Enable all / Disable all" quick-toggle buttons.
   */
  const availableGroups = $derived.by((): string[] => {
    const seen = new Set<string>();
    for (const f of availableFiles) {
      if (f.ruleSource && f.ruleSource !== 'unknown' && f.ruleSource !== '?') {
        seen.add(f.ruleSource);
      }
    }
    return Array.from(seen).sort();
  });

  // ── Enabled sources — stored as RELATIVE FILE PATHS ──────────────────────
  // e.g. ["00_d20srd_core/00_d20srd_core_config_tables.json", "00_d20srd_core/01_d20srd_core_races.json"]
  //
  // The DataLoader receives these paths and fetches ONLY the listed files.
  // This gives fine-grained control: the GM can enable individual files
  // (e.g. disable prestige classes without disabling core rules).
  //
  // Initialised from campaign.enabledRuleSources on first load.
  let enabledSources     = $state<string[]>([]);
  let sourcesInitialised = false;
  $effect(() => {
    const sources = campaign?.enabledRuleSources;
    if (sources && !sourcesInitialised) {
      enabledSources     = [...sources];
      sourcesInitialised = true;
    }
  });

  // ── Group-color palette — deterministic, light & dark aware ─────────────────
  // Each entry has three states: on (all enabled), partial (some), off (none).
  // All class strings are complete literals so Tailwind v4's scanner picks them up.
  // The palette is intentionally longer than the number of expected rule groups so
  // collisions are rare; the hash ensures the same group always gets the same color.
  type GroupColorState = { on: string; partial: string; off: string };
  const GROUP_PALETTE: readonly GroupColorState[] = [
    { on: 'border-sky-600/60 bg-sky-600/10 text-sky-700 dark:text-sky-400',         partial: 'border-sky-600/35 bg-sky-600/10 text-sky-600 dark:text-sky-500',         off: 'border-sky-600/15 bg-transparent text-sky-700/40 dark:text-sky-400/30'         },
    { on: 'border-violet-600/60 bg-violet-600/10 text-violet-700 dark:text-violet-400', partial: 'border-violet-600/35 bg-violet-600/10 text-violet-600 dark:text-violet-500', off: 'border-violet-600/15 bg-transparent text-violet-700/40 dark:text-violet-400/30' },
    { on: 'border-amber-600/60 bg-amber-600/10 text-amber-700 dark:text-amber-400',   partial: 'border-amber-600/35 bg-amber-600/10 text-amber-600 dark:text-amber-500',   off: 'border-amber-600/15 bg-transparent text-amber-700/40 dark:text-amber-400/30'   },
    { on: 'border-emerald-600/60 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400', partial: 'border-emerald-600/35 bg-emerald-600/10 text-emerald-600 dark:text-emerald-500', off: 'border-emerald-600/15 bg-transparent text-emerald-700/40 dark:text-emerald-400/30' },
    { on: 'border-rose-600/60 bg-rose-600/10 text-rose-700 dark:text-rose-400',       partial: 'border-rose-600/35 bg-rose-600/10 text-rose-600 dark:text-rose-500',       off: 'border-rose-600/15 bg-transparent text-rose-700/40 dark:text-rose-400/30'       },
    { on: 'border-cyan-600/60 bg-cyan-600/10 text-cyan-700 dark:text-cyan-400',       partial: 'border-cyan-600/35 bg-cyan-600/10 text-cyan-600 dark:text-cyan-500',       off: 'border-cyan-600/15 bg-transparent text-cyan-700/40 dark:text-cyan-400/30'       },
    { on: 'border-orange-600/60 bg-orange-600/10 text-orange-700 dark:text-orange-400', partial: 'border-orange-600/35 bg-orange-600/10 text-orange-600 dark:text-orange-500', off: 'border-orange-600/15 bg-transparent text-orange-700/40 dark:text-orange-400/30' },
    { on: 'border-teal-600/60 bg-teal-600/10 text-teal-700 dark:text-teal-400',       partial: 'border-teal-600/35 bg-teal-600/10 text-teal-600 dark:text-teal-500',       off: 'border-teal-600/15 bg-transparent text-teal-700/40 dark:text-teal-400/30'       },
    { on: 'border-indigo-600/60 bg-indigo-600/10 text-indigo-700 dark:text-indigo-400', partial: 'border-indigo-600/35 bg-indigo-600/10 text-indigo-600 dark:text-indigo-500', off: 'border-indigo-600/15 bg-transparent text-indigo-700/40 dark:text-indigo-400/30' },
    { on: 'border-pink-600/60 bg-pink-600/10 text-pink-700 dark:text-pink-400',       partial: 'border-pink-600/35 bg-pink-600/10 text-pink-600 dark:text-pink-500',       off: 'border-pink-600/15 bg-transparent text-pink-700/40 dark:text-pink-400/30'       },
    { on: 'border-lime-600/60 bg-lime-600/10 text-lime-700 dark:text-lime-400',       partial: 'border-lime-600/35 bg-lime-600/10 text-lime-600 dark:text-lime-500',       off: 'border-lime-600/15 bg-transparent text-lime-700/40 dark:text-lime-400/30'       },
    { on: 'border-fuchsia-600/60 bg-fuchsia-600/10 text-fuchsia-700 dark:text-fuchsia-400', partial: 'border-fuchsia-600/35 bg-fuchsia-600/10 text-fuchsia-600 dark:text-fuchsia-500', off: 'border-fuchsia-600/15 bg-transparent text-fuchsia-700/40 dark:text-fuchsia-400/30' },
  ];

  /** Deterministic hash: same group name → same palette entry every time. */
  function groupPalette(groupId: string): GroupColorState {
    let h = 0;
    for (let i = 0; i < groupId.length; i++) {
      h = Math.imul(31, h) + groupId.charCodeAt(i) | 0;
    }
    return GROUP_PALETTE[Math.abs(h) % GROUP_PALETTE.length];
  }

  /** Enable every available file (adds all to the load order). */
  function enableAllSources() { enabledSources = availableFiles.map(f => f.path); }

  /** Remove every file from the load order. */
  function disableAllSources() { enabledSources = []; }

  let dragSrcIndex = $state<number | null>(null);

  /** Toggle a single file path on/off. */
  function toggleFile(path: string) {
    enabledSources = enabledSources.includes(path)
      ? enabledSources.filter(p => p !== path)
      : [...enabledSources, path];
  }

  /**
   * Enable or disable ALL files belonging to a ruleSource group in one click.
   * If ALL group files are already enabled → disables them all (toggle behaviour).
   * Otherwise → enables all that aren't already enabled.
   */
  function toggleGroup(groupId: string) {
    const groupPaths = availableFiles.filter(f => f.ruleSource === groupId).map(f => f.path);
    const allEnabled = groupPaths.every(p => enabledSources.includes(p));
    if (allEnabled) {
      enabledSources = enabledSources.filter(p => !groupPaths.includes(p));
    } else {
      const toAdd = groupPaths.filter(p => !enabledSources.includes(p));
      enabledSources = [...enabledSources, ...toAdd];
    }
  }

  function handleDragStart(index: number) { dragSrcIndex = index; }
  function handleDragOver(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
    const newList = [...enabledSources];
    const [removed] = newList.splice(dragSrcIndex, 1);
    newList.splice(targetIndex, 0, removed);
    enabledSources = newList;
    dragSrcIndex = targetIndex;
  }
  function handleDragEnd() { dragSrcIndex = null; }

  let gmOverridesText = $state('[]');

  // Sync the override text from campaign data when campaign loads/changes.
  let overridesInitialised = false;
  $effect(() => {
    const overrides = campaign?.gmGlobalOverrides;
    if (overrides && !overridesInitialised) {
      gmOverridesText = overrides;
      overridesInitialised = true;
    }
  });

  /**
   * Reactive JSON validation — recomputes synchronously whenever gmOverridesText
   * changes. Using $derived.by() guarantees re-evaluation on every edit, unlike
   * the previous $effect approach which could lag or silently no-op.
   */
  const _jsonValidation = $derived.by(() => {
    const text     = gmOverridesText;
    const trimmed  = text.trim();

    if (!trimmed || trimmed === '[]') {
      return { valid: true, error: '', warnings: [] as string[] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e: unknown) {
      const err = e as Error;
      const posMatch = err.message.match(/position (\d+)/);
      let errMsg: string;
      if (posMatch) {
        const pos     = parseInt(posMatch[1], 10);
        const lineNum = text.slice(0, pos).split('\n').length;
        errMsg = `Syntax error on line ${lineNum}: ${err.message}`;
      } else {
        errMsg = `Syntax error: ${err.message}`;
      }
      return { valid: false, error: errMsg, warnings: [] as string[] };
    }

    if (!Array.isArray(parsed)) {
      return { valid: false, error: 'Override JSON must be an array ([ ... ]).', warnings: [] as string[] };
    }

    const warnings: string[] = [];
    for (let i = 0; i < (parsed as unknown[]).length; i++) {
      const entry = (parsed as Record<string, unknown>[])[i];
      if (!entry || typeof entry !== 'object') {
        warnings.push(`Entry ${i}: expected object, got ${typeof entry}.`);
        continue;
      }
      if (!entry['tableId'] && (!entry['id'] || !entry['category'])) {
        warnings.push(`Entry ${i} ("${entry['id'] ?? '?'}"): missing 'id' or 'category'.`);
      }
      if (entry['tableId'] && !entry['data']) {
        warnings.push(`Entry ${i} (tableId: "${entry['tableId']}"): missing 'data' array.`);
      }
    }
    return { valid: true, error: '', warnings };
  });

  const isValidJson  = $derived(_jsonValidation.valid);
  const jsonError    = $derived(_jsonValidation.error);
  const jsonWarnings = $derived(_jsonValidation.warnings);

  // ── Dice Rules ────────────────────────────────────────────────────────────
  // Initialised to engine defaults; overwritten by the $effect below once
  // campaign.campaignSettings arrives from the store (populated by loadFromApi).
  let explodingTwenties = $state(false);

  // ── Stat Generation ───────────────────────────────────────────────────────
  let rerollOnes      = $state(false);
  let pointBuyBudget  = $state(25);
  // allowedMethods: which methods the GM allows players to use (checkboxes)
  // Default: all three enabled (backward-compatible with saved settings that don't have this field)
  let allowedRoll     = $state(true);
  let allowedPointBuy = $state(true);
  let allowedStdArray = $state(true);

  const allowedMethods = $derived.by((): Array<'roll' | 'point_buy' | 'standard_array'> => {
    const methods: Array<'roll' | 'point_buy' | 'standard_array'> = [];
    if (allowedRoll)     methods.push('roll');
    if (allowedPointBuy) methods.push('point_buy');
    if (allowedStdArray) methods.push('standard_array');
    return methods;
  });

  // ── Variant Rules (Extensions G + H) ─────────────────────────────────────
  let variantGestalt = $state(false);
  let variantVWP     = $state(false);

  /**
   * Populate dice / stat-gen / variant fields from the campaign's persisted
   * settings once campaign data is available in the store.
   *
   * WHY NOT engine.settings?
   *   engine.settings is populated in memory at runtime and resets to defaults
   *   on every page refresh.  campaign.campaignSettings comes from the PHP API
   *   (GET /api/campaigns) and survives page refreshes.
   *
   * Guard: only runs once per mount (diceSettingsInitialised flag).
   */
  let diceSettingsInitialised = false;
  $effect(() => {
    const cs = campaign?.campaignSettings;
    // cs is null for campaigns that have never had settings saved — skip init
    // so the form remains at the defaults declared above.
    if (!diceSettingsInitialised && cs && !Array.isArray(cs)) {
      explodingTwenties = cs.diceRules?.explodingTwenties            ?? false;
      rerollOnes        = cs.statGeneration?.rerollOnes               ?? false;
      pointBuyBudget    = cs.statGeneration?.pointBuyBudget           ?? 25;
      const methods     = cs.statGeneration?.allowedMethods
                          ?? ['roll', 'point_buy', 'standard_array'];
      allowedRoll       = methods.includes('roll');
      allowedPointBuy   = methods.includes('point_buy');
      allowedStdArray   = methods.includes('standard_array');
      variantGestalt    = cs.variantRules?.gestalt                    ?? false;
      variantVWP        = cs.variantRules?.vitalityWoundPoints        ?? false;
      diceSettingsInitialised = true;
    }
  });

  let isSaving    = $state(false);
  let saveSuccess = $state('');

  async function saveSettings() {
    if (!isValidJson) return;
    isSaving = true; saveSuccess = '';

    // Apply to in-memory engine state immediately (instant UI feedback)
    engine.settings.enabledRuleSources = [...enabledSources];
    engine.settings.diceRules      = { explodingTwenties };
    engine.settings.statGeneration = { method: allowedMethods[0] ?? 'point_buy', rerollOnes, pointBuyBudget, allowedMethods };
    engine.settings.variantRules   = { gestalt: variantGestalt, vitalityWoundPoints: variantVWP };

    // Reload rule sources so character sheet dropdowns reflect new selection
    dataLoader
      .loadRuleSources(enabledSources, gmOverridesText)
      .catch(e => console.warn('[Settings] DataLoader reload failed:', e));

    try {
      const chaptersPayload = editableChapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        description: ch.description,
        isCompleted: ch.isCompleted,
        tasks: ch.tasks.map(t => ({
          id: t.id,
          title: t.title,
          isCompleted: t.isCompleted,
        })),
      }));
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          enabledRuleSources: enabledSources,
          gmGlobalOverrides: gmOverridesText,
          chapters: chaptersPayload,
          diceRules:      { explodingTwenties },
          statGeneration: { method: allowedMethods[0] ?? 'point_buy', rerollOnes, pointBuyBudget, allowedMethods },
          variantRules:   { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Sync the campaign store so other pages (vault, detail) see the updated data,
      // including campaignSettings so the form re-initialises correctly after navigation.
      campaignStore.updateCampaign(campaignId, {
        enabledRuleSources: [...enabledSources],
        gmGlobalOverrides: gmOverridesText,
        chapters: chaptersPayload,
        campaignSettings: {
          diceRules:      { explodingTwenties },
          statGeneration: { method: allowedMethods[0] ?? 'point_buy', rerollOnes, pointBuyBudget, allowedMethods },
          variantRules:   { gestalt: variantGestalt, vitalityWoundPoints: variantVWP },
        },
      });
      chaptersAreDirty = false;   // sync is safe again after a clean save
      saveSuccess = ui('settings.saved', engine.settings.language);
      setTimeout(() => (saveSuccess = ''), 3000);
    } catch (err) {
      console.warn('[Settings] API unavailable:', err);
      saveSuccess = ui('settings.saved_local', engine.settings.language);
      setTimeout(() => (saveSuccess = ''), 5000);
    } finally {
      isSaving = false;
    }
  }

  // ── SECTION 7: Campaign Members (Phase 22.9) ──────────────────────────────

  let membersOpen          = $state(false);
  let members              = $state<CampaignMember[]>([]);
  let membersLoading       = $state(false);
  let membersError         = $state('');
  let memberActionLoading  = $state<Record<string, boolean>>({});

  // User picker state
  let pickerOpen     = $state(false);
  let pickerSearch   = $state('');
  let pickerUsers    = $state<User[]>([]);   // all users from listUsers()
  let pickerLoading  = $state(false);
  let pickerError    = $state('');
  let pickerInputEl  = $state<HTMLInputElement | null>(null);

  /** IDs of users already in the campaign — used to exclude them from picker. */
  const memberIds = $derived(new Set(members.map(m => m.user_id)));

  /** Filtered picker users: match search text AND not already a member. */
  const filteredPickerUsers = $derived(
    pickerUsers.filter(u => {
      if (memberIds.has(u.id)) return false;
      if (!pickerSearch.trim()) return true;
      const q = pickerSearch.toLowerCase();
      return u.username.toLowerCase().includes(q) || u.player_name.toLowerCase().includes(q);
    })
  );

  async function loadMembers(): Promise<void> {
    membersLoading = true;
    membersError   = '';
    try {
      members = await getCampaignUsers(campaignId);
    } catch (e) {
      membersError = e instanceof ApiError ? e.message : 'Failed to load members.';
    } finally {
      membersLoading = false;
    }
  }

  function toggleMembers(): void {
    membersOpen = !membersOpen;
    if (membersOpen && members.length === 0 && !membersLoading) {
      loadMembers();
    }
  }

  async function openPicker(): Promise<void> {
    pickerSearch = '';
    pickerError  = '';
    pickerOpen   = true;
    // Focus the search input after the picker renders (replaces `autofocus` attr).
    setTimeout(() => pickerInputEl?.focus(), 10);
    if (pickerUsers.length === 0) {
      pickerLoading = true;
      try {
        pickerUsers = await listUsers();
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          pickerError = 'Only administrators can browse the full user list.';
        } else {
          pickerError = e instanceof ApiError ? e.message : 'Failed to load users.';
        }
      } finally {
        pickerLoading = false;
      }
    }
  }

  async function handleAddMember(userId: string): Promise<void> {
    pickerOpen = false;
    try {
      await addCampaignUser(campaignId, userId);
      await loadMembers();
    } catch (e) {
      membersError = e instanceof ApiError ? e.message : 'Failed to add member.';
    }
  }

  async function handleRemoveMember(userId: string): Promise<void> {
    if (memberActionLoading[userId]) return;
    memberActionLoading = { ...memberActionLoading, [userId]: true };
    try {
      await removeCampaignUser(campaignId, userId);
      // Remove from local state immediately for instant feedback, then reload.
      members = members.filter(m => m.user_id !== userId);
    } catch (e) {
      membersError = e instanceof ApiError ? e.message : 'Failed to remove member.';
      await loadMembers(); // Reload to restore consistent state
    } finally {
      memberActionLoading = { ...memberActionLoading, [userId]: false };
    }
  }

  /** Role badge colour classes — same palette as admin user list. */
  function memberRoleBadge(role: CampaignMember['role']): string {
    const base = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border';
    switch (role) {
      case 'admin':  return `${base} bg-red-900/30  text-red-400  border-red-700/40`;
      case 'gm':     return `${base} bg-amber-900/30 text-amber-400 border-amber-700/40`;
      default:       return `${base} bg-blue-900/30  text-blue-400  border-blue-700/40`;
    }
  }
</script>

<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

  <!-- ── HEADER ───────────────────────────────────────────────────────────── -->
  <header class="flex items-center gap-3 flex-wrap border-b border-border pb-4">
    <a href="/campaigns/{campaignId}" class="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors shrink-0">
      <IconBack size={12} aria-hidden="true" /> {ui('settings.back_campaign', engine.settings.language)}
    </a>
    <h1 class="flex items-center gap-2 text-xl font-bold text-text-primary flex-1">
      <IconSettings size={20} aria-hidden="true" /> {ui('settings.title', engine.settings.language)}
    </h1>
    <div class="flex items-center gap-2">
      <span class="badge-accent flex items-center gap-1 text-xs">
        <IconGMDashboard size={12} aria-hidden="true" /> {ui('settings.gm_view', engine.settings.language)}
      </span>
      <button
        class="btn-primary"
        onclick={saveSettings}
        disabled={isSaving || !isValidJson}
        aria-label="Save campaign settings"
        type="button"
      >
        {isSaving ? ui('settings.saving', engine.settings.language) : ui('settings.save', engine.settings.language)}
      </button>
    </div>
  </header>

  {#if saveSuccess}
    <div class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-green-600/40 bg-green-950/20 text-green-400 text-sm" role="status">
      <IconSuccess size={14} aria-hidden="true" /> {saveSuccess}
    </div>
  {/if}

  <!-- ── SECTION 1: RULE SOURCE MANAGER ────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-4">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        <IconSpells size={18} aria-hidden="true" /> {ui('settings.rule_sources.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        {ui('settings.rule_sources.desc', engine.settings.language)}
      </p>
    </div>

    {#if loadingError}
      <div class="flex items-center gap-2 px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-xs">
        <IconError size={12} aria-hidden="true" /> {ui('settings.rule_sources.error', engine.settings.language)}: {loadingError}
      </div>
    {/if}

    <!--
      HOW RULE SOURCES WORK:
        Each JSON file carries a `ruleSource` field (e.g. "srd_core").
        DataLoader loads ALL discovered files, then filters its feature cache
        to only keep entities whose `ruleSource` is in `enabledRuleSources`.
        So enabling "srd_core" enables ALL files tagged with that source ID —
        you do not need to enable individual files.

        The list below shows individual files for transparency and fine-grained
        ordering. The "Enable group" buttons let you turn on all files of a
        source in one click.
    -->

    <!--
      FILE-BASED RULE SOURCE MANAGER
      ────────────────────────────────
      • Each row = one JSON file (maximum granularity).
      • Files are sorted alphabetically by path (= load order).
      • Quick-toggle buttons enable/disable all files of a ruleSource group at once.
      • The DataLoader loads ONLY the enabled files — no ruleSource-ID filtering.
    -->

    <!-- Quick group enable/disable buttons -->
    {#if availableGroups.length > 0}
      <div class="flex flex-wrap items-center gap-2 py-1">
        <span class="text-xs text-text-muted self-center shrink-0">{ui('settings.rule_sources.quick_toggle', engine.settings.language)}</span>

        <!-- Global All / None -->
        <button
          type="button"
          class="text-xs px-2.5 py-1 rounded border transition-colors
                 border-border text-text-secondary hover:border-green-600/50 hover:bg-green-600/10 hover:text-green-600 dark:hover:border-green-500/50 dark:hover:bg-green-500/10 dark:hover:text-green-400"
          onclick={enableAllSources}
          title={ui('settings.rule_sources.enable_all', engine.settings.language)}
        >{ui('settings.rule_sources.toggle_all', engine.settings.language)}</button>
        <button
          type="button"
          class="text-xs px-2.5 py-1 rounded border transition-colors
                 border-border text-text-secondary hover:border-red-600/50 hover:bg-red-600/10 hover:text-red-600 dark:hover:border-red-500/50 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          onclick={disableAllSources}
          title={ui('settings.rule_sources.disable_all', engine.settings.language)}
        >{ui('settings.rule_sources.toggle_none', engine.settings.language)}</button>

        <!-- Separator -->
        <span class="self-stretch w-px bg-border/60 shrink-0 my-0.5" aria-hidden="true"></span>

        <!-- Per-group colored pills -->
        {#each availableGroups as groupId}
          {@const groupFiles = availableFiles.filter(f => f.ruleSource === groupId)}
          {@const allOn = groupFiles.length > 0 && groupFiles.every(f => enabledSources.includes(f.path))}
          {@const someOn = groupFiles.some(f => enabledSources.includes(f.path))}
          {@const gc = groupPalette(groupId)}
          <button
            class="text-xs px-2.5 py-1 rounded border transition-all
                   {allOn ? gc.on : someOn ? gc.partial : gc.off}"
            onclick={() => toggleGroup(groupId)}
            title="{allOn ? ui('settings.rule_sources.disable_all', engine.settings.language) : ui('settings.rule_sources.enable_all', engine.settings.language)} — {groupId}"
            type="button"
          >
            {#if allOn}<IconChecked size={11} class="inline mr-0.5" aria-hidden="true" />{/if}{groupId}
          </button>
        {/each}
      </div>
    {/if}

    <!-- ── Load order — draggable, shows only enabled files in their current order -->
    {#if enabledSources.length > 0}
      <div class="flex flex-col gap-1">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-0.5">
          {ui('settings.rule_sources.load_order', engine.settings.language)}
          <span class="normal-case font-normal ml-1">— {enabledSources.length} / {availableFiles.length} {uiN('settings.rule_sources.files', availableFiles.length, engine.settings.language)}</span>
        </p>
        {#each enabledSources as path, i (path)}
          {@const file = availableFiles.find(f => f.path === path)}
          {@const gc   = groupPalette(file?.ruleSource ?? '')}
          <div
            class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-accent/40 bg-surface-alt
                   select-none transition-opacity duration-100 {dragSrcIndex === i ? 'opacity-30' : ''}"
            draggable="true"
            ondragstart={() => handleDragStart(i)}
            ondragover={(e) => handleDragOver(e, i)}
            ondragend={handleDragEnd}
            role="listitem"
            aria-label="Drag to reorder: {path}"
          >
            <IconDragHandle size={12} class="text-text-muted/50 shrink-0 cursor-grab" aria-hidden="true" />
            <span class="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border {gc.on}">
              {file?.ruleSource ?? '?'}
            </span>
            <span class="flex-1 text-[10px] font-mono truncate text-text-primary">{path}</span>
            {#if file}
              <span class="shrink-0 text-[10px] text-text-muted/60">{file.entityCount} {uiN('settings.rule_sources.entities', file.entityCount ?? 0, engine.settings.language)}</span>
            {/if}
            <button
              type="button"
              class="shrink-0 text-[10px] px-2 py-0.5 btn-danger-outline"
              onclick={() => toggleFile(path)}
              aria-label="{ui('settings.rule_sources.disable', engine.settings.language)} {path}"
            >{ui('settings.rule_sources.disable', engine.settings.language)}</button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- ── Available files — only files not yet in the load order -->
    {#if availableFiles.length > 0}
      {@const enabledSet = new Set(enabledSources)}
      {@const disabledFiles = availableFiles.filter(f => !enabledSet.has(f.path))}
      {#if disabledFiles.length > 0}
        <div class="flex flex-col gap-1">
          <p class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-0.5">
            {ui('settings.rule_sources.all_files', engine.settings.language)}
            <span class="normal-case font-normal ml-1">— {disabledFiles.length} / {availableFiles.length} {uiN('settings.rule_sources.files', availableFiles.length, engine.settings.language)}</span>
          </p>
          {#each disabledFiles as file}
            {@const gc = groupPalette(file.ruleSource)}
            <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface opacity-50 hover:opacity-80 transition-all duration-150">
              <span class="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border {gc.off}">
                {file.ruleSource}
              </span>
              <span class="flex-1 text-[10px] font-mono truncate text-text-muted">{file.path}</span>
              <span class="shrink-0 text-[10px] text-text-muted/70">{file.entityCount} {uiN('settings.rule_sources.entities', file.entityCount ?? 0, engine.settings.language)}</span>
              <button
                class="shrink-0 text-[10px] px-2 py-0.5 rounded border border-green-700/40 bg-green-950/20 text-green-400 hover:bg-green-900/30 transition-colors"
                onclick={() => toggleFile(file.path)}
                aria-label="{ui('settings.rule_sources.enable', engine.settings.language)} {file.path}"
                type="button"
              >{ui('settings.rule_sources.enable', engine.settings.language)}</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    {#if availableFiles.length === 0 && !loadingError}
      <p class="text-xs text-text-muted italic">{ui('settings.rule_sources.none', engine.settings.language)}</p>
    {/if}

  </section>

  <!-- ── SECTION 2: DICE RULES ────────────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-4">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        🎲 {ui('settings.dice_rules.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        {ui('settings.dice_rules.desc', engine.settings.language)}
      </p>
    </div>

    <!-- Exploding Twenties -->
    <label class="flex items-start gap-3 cursor-pointer group">
      <div class="mt-0.5 shrink-0">
        <input
          type="checkbox"
          bind:checked={explodingTwenties}
          class="w-4 h-4 accent-accent rounded"
          aria-labelledby="dice-exploding-twenties-label"
        />
      </div>
      <div class="flex flex-col gap-0.5">
        <span id="dice-exploding-twenties-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
          {ui('settings.exploding_twenties', engine.settings.language)}
        </span>
        <span class="text-xs text-text-muted leading-relaxed">
          {ui('settings.exploding_twenties_desc', engine.settings.language)}
        </span>
      </div>
    </label>
  </section>

  <!-- ── SECTION 3: STAT GENERATION ───────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-4">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        ⚀ {ui('settings.stat_gen.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        {ui('settings.stat_gen.desc', engine.settings.language)}
      </p>
    </div>

    <!-- Allowed Methods (checkboxes) -->
    <div class="flex flex-col gap-2">
      <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {ui('settings.stat_gen.allowed_methods', engine.settings.language)}
      </span>
      <div class="flex flex-col gap-2">

        <!-- Roll (4d6 drop lowest) -->
        <div class="flex flex-col gap-1.5">
          <label class="flex items-center gap-2.5 cursor-pointer group">
            <input type="checkbox" bind:checked={allowedRoll} class="w-4 h-4 accent-accent rounded shrink-0" />
            <span class="text-sm text-text-primary group-hover:text-accent transition-colors">
              {ui('settings.stat_gen.roll', engine.settings.language)}
            </span>
          </label>
          <!-- Reroll Ones — sub-option for roll -->
          {#if allowedRoll}
            <label class="flex items-start gap-2.5 cursor-pointer group ml-6">
              <input type="checkbox" bind:checked={rerollOnes} class="w-3.5 h-3.5 accent-accent rounded shrink-0 mt-0.5" />
              <div class="flex flex-col gap-0">
                <span class="text-xs font-medium text-text-primary group-hover:text-accent transition-colors">
                  {ui('settings.stat_gen.reroll_ones', engine.settings.language)}
                </span>
                <span class="text-[10px] text-text-muted">{ui('settings.stat_gen.reroll_ones_desc', engine.settings.language)}</span>
              </div>
            </label>
          {/if}
        </div>

        <!-- Point Buy -->
        <label class="flex items-center gap-2.5 cursor-pointer group">
          <input type="checkbox" bind:checked={allowedPointBuy} class="w-4 h-4 accent-accent rounded shrink-0" />
          <span class="text-sm text-text-primary group-hover:text-accent transition-colors">
            {ui('settings.stat_gen.point_buy', engine.settings.language)}
          </span>
        </label>

        <!-- Standard Array -->
        <label class="flex items-center gap-2.5 cursor-pointer group">
          <input type="checkbox" bind:checked={allowedStdArray} class="w-4 h-4 accent-accent rounded shrink-0" />
          <span class="text-sm text-text-primary group-hover:text-accent transition-colors">
            {ui('settings.stat_gen.standard_array', engine.settings.language)}
          </span>
        </label>

      </div>
    </div>

    <!-- Point Buy Budget — only relevant when point_buy is allowed -->
    {#if allowedPointBuy}
      <div class="flex flex-col gap-2">
        <label for="point-buy-budget" class="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {ui('settings.stat_gen.budget', engine.settings.language)}
        </label>
        <p class="text-xs text-text-muted -mt-1">
          {ui('settings.stat_gen.budget_desc', engine.settings.language)}
        </p>

        <!-- Preset buttons -->
        <div class="flex flex-wrap gap-2">
          {#each ([
            [15, 'settings.stat_gen.preset_low'],
            [25, 'settings.stat_gen.preset_std'],
            [32, 'settings.stat_gen.preset_high'],
            [40, 'settings.stat_gen.preset_epic'],
          ] as const) as [pts, key]}
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border transition-colors
                     {pointBuyBudget === pts
                       ? 'border-accent bg-accent/15 text-accent'
                       : 'border-border text-text-muted hover:border-accent/50 hover:text-text-primary'}"
              onclick={() => { pointBuyBudget = pts; }}
            >
              {ui(key, engine.settings.language)}
            </button>
          {/each}
        </div>

        <!-- Custom budget input -->
        <div class="flex items-center gap-2">
          <input
            id="point-buy-budget"
            type="number"
            min="1"
            max="999"
            bind:value={pointBuyBudget}
            class="input w-24 text-center text-sm font-bold text-sky-500 dark:text-sky-400"
            aria-label="Point buy budget"
          />
          <span class="text-xs text-text-muted">{ui('common.level', engine.settings.language).toLowerCase()} points</span>
        </div>
      </div>
    {/if}
  </section>

  <!-- ── SECTION 4: VARIANT RULES (Extensions G + H) ─────────────────────── -->
  <section class="card p-5 flex flex-col gap-4">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        ⚗ {ui('variant.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        Variant rules change core engine behaviour. These flags are saved per-campaign and applied immediately.
        Only enable variant rules your group has agreed to use.
      </p>
    </div>

    <!-- Gestalt Characters (Extension G) -->
    <label class="flex items-start gap-3 cursor-pointer group">
      <div class="mt-0.5 shrink-0">
        <input
          type="checkbox"
          bind:checked={variantGestalt}
          class="w-4 h-4 accent-accent rounded"
          aria-labelledby="variant-gestalt-label"
        />
      </div>
      <div class="flex flex-col gap-0.5">
        <span id="variant-gestalt-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
          {ui('variant.gestalt', engine.settings.language)}
        </span>
        <span class="text-xs text-text-muted leading-relaxed">
          {ui('variant.gestalt_desc', engine.settings.language)}
        </span>
      </div>
    </label>

    <!-- Vitality / Wound Points (Extension H) -->
    <label class="flex items-start gap-3 cursor-pointer group">
      <div class="mt-0.5 shrink-0">
        <input
          type="checkbox"
          bind:checked={variantVWP}
          class="w-4 h-4 accent-accent rounded"
          aria-labelledby="variant-vwp-label"
        />
      </div>
      <div class="flex flex-col gap-0.5">
        <span id="variant-vwp-label" class="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
          {ui('variant.vitality_wound', engine.settings.language)}
        </span>
        <span class="text-xs text-text-muted leading-relaxed">
          {ui('variant.vitality_wound_desc', engine.settings.language)}
        </span>
        {#if variantVWP}
          <p class="text-xs text-amber-400/80 italic mt-0.5">
            ⚠ Requires <code class="bg-surface-alt px-1 rounded">resources.vitality_points</code> and
            <code class="bg-surface-alt px-1 rounded">resources.wound_points</code> pools on each character.
          </p>
        {/if}
      </div>
    </label>
  </section>

  <!-- ── SECTION 5: CHAPTERS & ACTS ──────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-4" id="chapters">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        📖 {ui('settings.chapters.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed">
        {ui('settings.chapters.desc', engine.settings.language)}
      </p>
    </div>

    {#if editableChapters.length === 0}
      <p class="text-xs text-text-muted italic">{ui('settings.chapters.empty', engine.settings.language)}</p>
    {:else}
      <ol class="flex flex-col gap-3">
        {#each editableChapters as chapter, index (chapter.id)}
          <li
            class="flex flex-col gap-2 rounded-lg border border-border bg-surface-alt p-3 select-none
                   transition-opacity duration-100 {chapterDragSrc === index ? 'opacity-30' : ''}"
            draggable="true"
            ondragstart={() => handleChapterDragStart(index)}
            ondragover={(e) => handleChapterDragOver(e, index)}
            ondragend={handleChapterDragEnd}
          >
            <div class="flex items-center gap-2">
              <IconDragHandle size={14} class="text-text-muted/50 shrink-0 cursor-grab" aria-hidden="true" />
              <input
                type="text"
                value={chapter.title[engine.settings.language] ?? chapter.title['en'] ?? ''}
                oninput={(e) => { chaptersAreDirty = true; chapter.title = { ...chapter.title, [engine.settings.language]: e.currentTarget.value }; }}
                class="input flex-1 text-sm cursor-text select-text"
                placeholder={ui('settings.chapters.title_placeholder', engine.settings.language)}
                aria-label="{ui('settings.chapters.title_label', engine.settings.language)} {index + 1}"
              />
              <button
                type="button"
                class="shrink-0 text-xs px-2 py-1 btn-danger-outline"
                onclick={() => removeChapter(chapter.id)}
                aria-label="{ui('settings.chapters.remove', engine.settings.language)} {index + 1}"
              >{ui('settings.chapters.remove', engine.settings.language)}</button>
            </div>
            <div class="ml-7">
              <textarea
                value={chapter.description[engine.settings.language] ?? chapter.description['en'] ?? ''}
                oninput={(e) => { chaptersAreDirty = true; chapter.description = { ...chapter.description, [engine.settings.language]: e.currentTarget.value }; }}
                class="input text-xs w-full resize-y min-h-[3rem]"
                placeholder={ui('settings.chapters.desc_placeholder', engine.settings.language)}
                aria-label="{ui('settings.chapters.desc_label', engine.settings.language)} {index + 1}"
                rows="2"
              ></textarea>
            </div>

            <!-- ── Task list ──────────────────────────────────────────────── -->
            <div class="ml-7 flex flex-col gap-1.5">
              {#if chapter.tasks.length > 0}
                <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {ui('settings.chapters.tasks_label', engine.settings.language)}
                </span>
                {#each chapter.tasks as task, ti (task.id)}
                  <div
                    class="flex items-center gap-2 select-none transition-opacity duration-100
                           {taskDragSrc?.chapterId === chapter.id && taskDragSrc?.index === ti ? 'opacity-30' : ''}"
                    draggable="true"
                    role="listitem"
                    ondragstart={() => handleTaskDragStart(chapter.id, ti)}
                    ondragover={(e) => handleTaskDragOver(e, chapter.id, ti)}
                    ondragend={handleTaskDragEnd}
                  >
                    <IconDragHandle size={12} class="text-text-muted/40 shrink-0 cursor-grab" aria-hidden="true" />
                    <input
                      type="text"
                      value={task.title[engine.settings.language] ?? task.title['en'] ?? ''}
                      oninput={(e) => { chaptersAreDirty = true; task.title = { ...task.title, [engine.settings.language]: e.currentTarget.value }; }}
                      class="input flex-1 text-xs cursor-text select-text"
                      placeholder={ui('settings.chapters.task_placeholder', engine.settings.language)}
                      aria-label="{ui('settings.chapters.tasks_label', engine.settings.language)} {index + 1}, task {ti + 1}"
                    />
                    <button
                      type="button"
                      class="shrink-0 text-xs px-1.5 py-0.5 btn-danger-outline"
                      onclick={() => removeTask(chapter.id, task.id)}
                      aria-label="{ui('settings.chapters.remove_task', engine.settings.language)} {ti + 1}"
                    >×</button>
                  </div>
                {/each}
              {/if}
              <button
                type="button"
                class="self-start text-xs text-accent/70 hover:text-accent transition-colors mt-0.5"
                onclick={() => addTask(chapter.id)}
              >{ui('settings.chapters.add_task', engine.settings.language)}</button>
            </div>
          </li>
        {/each}
      </ol>
    {/if}

    <button
      type="button"
      class="btn-secondary self-start gap-1 text-sm"
      onclick={addChapter}
    >+ {ui('settings.chapters.add', engine.settings.language)}</button>
  </section>

  <!-- ── SECTION 6: GM GLOBAL OVERRIDES ────────────────────────────────────── -->
  <section class="card p-5 flex flex-col gap-3">
    <div>
      <h2 class="section-header text-base border-b border-border pb-2">
        <IconGMDashboard size={18} aria-hidden="true" /> {ui('settings.overrides.title', engine.settings.language)}
      </h2>
      <p class="mt-2 text-xs text-text-muted leading-relaxed [&_code]:bg-surface-alt [&_code]:px-1 [&_code]:rounded">
        {@html ui('settings.overrides.desc', engine.settings.language)}
      </p>
    </div>

    <!-- Examples (collapsible) -->
    <details class="group rounded-lg border border-border">
      <summary class="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted
                      hover:text-text-primary transition-colors list-none [&::-webkit-details-marker]:hidden">
        <span class="transition-transform duration-150 group-open:rotate-90" aria-hidden="true">▶</span>
        {ui('settings.overrides.examples', engine.settings.language)}
      </summary>
      <div class="flex flex-col gap-3 px-3 pb-3 pt-1">

        <!-- Example 1: new feature granting a campaign-wide bonus -->
        <div class="flex flex-col gap-1">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-accent/80">
            {ui('settings.overrides.ex_new_label', engine.settings.language)}
          </p>
          <pre class="overflow-x-auto rounded bg-surface-alt px-3 py-2 text-[10px] leading-relaxed text-text-secondary font-mono">{`[
  {
    "id":          "gm_campaign_boon",
    "category":    "feat",
    "ruleSource":  "gm_override",
    "label":       { "en": "Campaign Boon", "fr": "Bénédiction de campagne" },
    "description": { "en": "All adventurers gain a +2 morale bonus to Spot.", "fr": "Tous les aventuriers gagnent un bonus de moral de +2 à Détection." },
    "grantedModifiers": [
      {
        "id":       "gm_campaign_boon_spot",
        "sourceId": "gm_campaign_boon",
        "targetId": "skills.skill_spot",
        "value":    2,
        "type":     "morale"
      }
    ]
  }
]`}</pre>
        </div>

        <!-- Example 2: partial override (merge) to patch an existing entity -->
        <div class="flex flex-col gap-1">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-accent/80">
            {ui('settings.overrides.ex_merge_label', engine.settings.language)}
          </p>
          <pre class="overflow-x-auto rounded bg-surface-alt px-3 py-2 text-[10px] leading-relaxed text-text-secondary font-mono">{`[
  {
    "id":       "feat_power_attack",
    "category": "feat",
    "merge":    "partial",
    "label":    { "en": "Power Attack (house rule)" },
    "grantedModifiers": [
      {
        "id":       "feat_pa_custom_penalty",
        "sourceId": "feat_power_attack",
        "targetId": "combat.attack_bonus",
        "value":    -2,
        "type":     "untyped"
      }
    ]
  }
]`}</pre>
        </div>

        <!-- Example 3: config table override -->
        <div class="flex flex-col gap-1">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-accent/80">
            {ui('settings.overrides.ex_table_label', engine.settings.language)}
          </p>
          <pre class="overflow-x-auto rounded bg-surface-alt px-3 py-2 text-[10px] leading-relaxed text-text-secondary font-mono">{`[
  {
    "tableId":    "config_xp_thresholds",
    "ruleSource": "gm_override",
    "data": [
      { "level": 1, "xpRequired": 0    },
      { "level": 2, "xpRequired": 1500 },
      { "level": 3, "xpRequired": 3500 }
    ]
  }
]`}</pre>
        </div>

      </div>
    </details>

    <!-- JSON error -->
    {#if jsonError}
      <div class="flex items-start gap-2 px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-xs font-mono" role="alert">
        <IconWarning size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
        <strong>JSON Syntax Error:</strong> {jsonError}
      </div>
    {/if}

    <!-- JSON warnings (non-blocking) -->
    {#if jsonWarnings.length > 0}
      <ul class="flex flex-col gap-1">
        {#each jsonWarnings as warning}
          <li class="flex items-center gap-1.5 px-2 py-1 rounded border border-yellow-700/40 bg-yellow-950/20 text-yellow-400 text-xs">
            <IconWarning size={11} aria-hidden="true" /> {warning}
          </li>
        {/each}
      </ul>
    {/if}

    <!-- JSON textarea -->
    <textarea
      class="w-full rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed resize-vertical
             bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors
             {isValidJson ? 'border-border focus:border-accent' : 'border-red-600 bg-red-950/10'}"
      bind:value={gmOverridesText}
      spellcheck="false"
      rows="18"
      aria-label={ui('settings.overrides.aria_label', engine.settings.language)}
    ></textarea>

    <!-- JSON status bar -->
    <div class="flex items-center justify-between text-xs px-0.5">
      <span class="flex items-center gap-1.5 font-medium {isValidJson ? 'text-green-400' : 'text-red-400'}">
        {#if isValidJson}
          <IconSuccess size={13} aria-hidden="true" /> {ui('settings.overrides.valid', engine.settings.language)}
        {:else}
          <IconError size={13} aria-hidden="true" /> {ui('settings.overrides.invalid', engine.settings.language)}
        {/if}
      </span>
      {#if isValidJson}
        {@const _c = JSON.parse(gmOverridesText || '[]').length}
        <span class="text-text-muted">
          {uiN('settings.overrides.entry', _c, engine.settings.language)}
        </span>
      {/if}
    </div>
  </section>

  <!-- ── SECTION 7: CAMPAIGN MEMBERS (Phase 22.9) ─────────────────────────── -->
  <section class="card overflow-hidden">

    <!-- Collapsible toggle header -->
    <button
      type="button"
      class="flex items-center justify-between w-full px-5 py-4 text-left
             hover:bg-surface-alt/50 transition-colors focus:outline-none
             focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
      onclick={toggleMembers}
      aria-expanded={membersOpen}
    >
      <h2 class="flex items-center gap-2 text-base font-semibold text-text-primary">
        <IconVault size={18} aria-hidden="true" />
        Campaign Members
        {#if members.length > 0}
          <span class="text-xs font-normal text-text-muted">({members.length})</span>
        {/if}
      </h2>
      {#if membersOpen}
        <IconChevronUp size={16} class="shrink-0 text-text-muted" aria-hidden="true" />
      {:else}
        <IconChevronDown size={16} class="shrink-0 text-text-muted" aria-hidden="true" />
      {/if}
    </button>

    {#if membersOpen}
      <div class="border-t border-border px-5 py-4 flex flex-col gap-4">

        <!-- Error banner -->
        {#if membersError}
          <div class="px-3 py-2 rounded border border-red-700/40 bg-red-950/20 text-red-400 text-sm" role="alert">
            {membersError}
          </div>
        {/if}

        <!-- Loading -->
        {#if membersLoading}
          <div class="flex items-center gap-2 text-text-muted text-sm py-2">
            <span class="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full shrink-0" aria-hidden="true"></span>
            Loading members…
          </div>

        {:else if members.length === 0}
          <p class="text-sm text-text-muted">No members yet. Add players using the button below.</p>

        {:else}
          <!-- Member list -->
          <ul class="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
            {#each members as member (member.user_id)}
              <li class="flex items-center justify-between gap-3 px-3 py-2.5">
                <div class="flex items-center gap-2 min-w-0">
                  <!-- Role badge -->
                  <span class={memberRoleBadge(member.role)}>
                    {{ admin: 'Admin', gm: 'GM', player: 'Player' }[member.role]}
                  </span>
                  <!-- Username + player name -->
                  <span class="text-sm font-medium text-text-primary truncate">
                    {member.username}
                  </span>
                  <span class="text-xs text-text-muted truncate hidden sm:inline">
                    {member.player_name}
                  </span>
                  <!-- Suspended indicator -->
                  {#if member.is_suspended}
                    <span class="text-xs text-orange-400 font-medium shrink-0">(Suspended)</span>
                  {/if}
                </div>
                <!-- Remove button -->
                <button
                  type="button"
                  class="shrink-0 p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-900/20
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!!memberActionLoading[member.user_id]}
                  onclick={() => handleRemoveMember(member.user_id)}
                  title="Remove {member.username} from campaign"
                  aria-label="Remove {member.username} from campaign"
                >
                  <IconDelete size={14} aria-hidden="true" />
                </button>
              </li>
            {/each}
          </ul>
        {/if}

        <!-- Add Member button + inline user picker -->
        <div class="relative">
          <button
            type="button"
            class="btn-secondary gap-1.5 text-sm"
            onclick={openPicker}
          >
            <IconAdd size={14} aria-hidden="true" />
            Add Member
          </button>

          {#if pickerOpen}
            <!-- Backdrop: clicking outside closes the picker -->
            <div
              class="fixed inset-0 z-10"
              onclick={() => (pickerOpen = false)}
              aria-hidden="true"
            ></div>

            <!-- Picker dropdown -->
            <div class="absolute left-0 top-full mt-1 z-20 w-72 rounded-lg border border-border
                         bg-surface shadow-xl flex flex-col overflow-hidden">
              <!-- Search input -->
              <div class="px-3 pt-3 pb-2 border-b border-border">
                <input
                  type="search"
                  bind:this={pickerInputEl}
                  bind:value={pickerSearch}
                  placeholder="Search by username or name…"
                  class="input text-sm w-full"
                />
              </div>

              <!-- User list -->
              <div class="overflow-y-auto max-h-60">
                {#if pickerLoading}
                  <div class="p-4 text-sm text-text-muted text-center">Loading users…</div>

                {:else if pickerError}
                  <div class="p-4 text-sm text-red-400 text-center">{pickerError}</div>

                {:else if filteredPickerUsers.length === 0}
                  <div class="p-4 text-sm text-text-muted text-center">
                    {pickerSearch ? 'No matching users.' : 'All users are already members.'}
                  </div>

                {:else}
                  <ul>
                    {#each filteredPickerUsers as u (u.id)}
                      <li>
                        <button
                          type="button"
                          class="flex items-center justify-between w-full px-3 py-2 text-left text-sm
                                 transition-colors hover:bg-surface-alt
                                 {u.is_suspended ? 'text-text-muted' : 'text-text-primary'}"
                          onclick={() => handleAddMember(u.id)}
                        >
                          <span>
                            <span class="font-medium">{u.username}</span>
                            <span class="text-xs ml-1 {u.is_suspended ? 'text-text-muted/70' : 'text-text-muted'}">
                              {u.player_name}
                            </span>
                          </span>
                          <span class="flex items-center gap-1.5 shrink-0 ml-2">
                            <span class={memberRoleBadge(u.role)}>
                              {{ admin: 'Admin', gm: 'GM', player: 'Player' }[u.role]}
                            </span>
                            {#if u.is_suspended}
                              <span class="text-xs text-orange-400">(Suspended)</span>
                            {/if}
                          </span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>

              <!-- Close footer -->
              <div class="border-t border-border px-3 py-2">
                <button
                  type="button"
                  class="text-xs text-text-muted hover:text-text-secondary w-full text-center"
                  onclick={() => (pickerOpen = false)}
                >
                  Close
                </button>
              </div>
            </div>
          {/if}
        </div>

      </div>
    {/if}

  </section>

</div>
