<!--
  @file src/lib/components/settings/ChaptersPanel.svelte
  @description Chapters & Acts panel — chapter/task CRUD + drag-to-reorder.
  Extracted from settings/+page.svelte as part of F1d refactoring.

  The parent handles syncing from the campaign store (syncedUpdatedAt guard).
  This component handles rendering and all editing operations.

  Props (all $bindable):
    bind:editableChapters  — EditableChapter[]
    bind:chaptersAreDirty  — boolean (set to true on any edit)
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconJournal, IconDragHandle } from '$lib/components/ui/icons';

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

  let {
    editableChapters = $bindable<EditableChapter[]>([]),
    chaptersAreDirty = $bindable(false),
  } = $props();

  // ── Chapter drag-to-reorder ────────────────────────────────────────────────
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

  // ── Task drag-to-reorder (per chapter) ───────────────────────────────────────
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
    ch.tasks = ch.tasks.filter((t: EditableTask) => t.id !== taskId);
  }

  function removeChapter(id: string) {
    chaptersAreDirty = true;
    editableChapters = editableChapters.filter(ch => ch.id !== id);
  }
</script>

<!-- ── SECTION 5: CHAPTERS & ACTS ──────────────────────────────────────────────── -->
<section class="card p-5 flex flex-col gap-4" id="chapters">
  <div>
    <h2 class="section-header text-base border-b border-border pb-2">
      <IconJournal size={20} aria-hidden="true" /> {ui('settings.chapters.title', engine.settings.language)}
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

          <!-- ── Task list ─────────────────────────────────────────────────────────────────── -->
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
