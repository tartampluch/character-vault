<!--
  @file src/lib/components/settings/ChaptersPanel.svelte
  @description Chapters & Acts panel — chapter/task CRUD + drag-to-reorder.
  Extracted from settings/+page.svelte as part of F1d refactoring.

  Chapters and tasks use LocalizedStringEditor so the GM can provide translations
  for every language their players use.  By default only English is shown
  (the mandatory fallback locale); additional languages appear when added via
  the "+ Add Translation" selector — keeping the panel compact until needed.

  Props (all $bindable):
    bind:editableChapters  — EditableChapter[]
    bind:chaptersAreDirty  — boolean (set to true on any edit)
-->

<script lang="ts">
  import { engine } from '$lib/engine/GameEngine.svelte';
  import { ui } from '$lib/i18n/ui-strings';
  import { IconJournal, IconDragHandle, IconClose } from '$lib/components/ui/icons';
  import LocalizedStringEditor from '$lib/components/content-editor/LocalizedStringEditor.svelte';

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

  const lang = $derived(engine.settings.language);

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

  // ── Task drag-to-reorder (per chapter) ────────────────────────────────────
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
      title: { en: '' },
      description: { en: '' },
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
      title: { en: '' },
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

<!-- ── SECTION 5: CHAPTERS & ACTS ─────────────────────────────────────────── -->
<section class="card p-5 flex flex-col gap-4" id="chapters">
  <div>
    <h2 class="section-header text-base border-b border-border pb-2">
      <IconJournal size={24} aria-hidden="true" /> {ui('settings.chapters.title', lang)}
    </h2>
    <p class="mt-2 text-xs text-text-muted leading-relaxed">
      {ui('settings.chapters.desc', lang)}
    </p>
  </div>

  {#if editableChapters.length === 0}
    <p class="text-xs text-text-muted italic">{ui('settings.chapters.empty', lang)}</p>
  {:else}
    <ol class="flex flex-col gap-4">
      {#each editableChapters as chapter, index (chapter.id)}
        <li
          class="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-3
                 transition-opacity duration-100 {chapterDragSrc === index ? 'opacity-30' : ''}"
          draggable="true"
          ondragstart={() => handleChapterDragStart(index)}
          ondragover={(e) => handleChapterDragOver(e, index)}
          ondragend={handleChapterDragEnd}
        >
          <!-- Chapter header row: drag handle + label + remove -->
          <div class="flex items-center gap-2">
            <IconDragHandle size={14} class="text-text-muted/50 shrink-0 cursor-grab" aria-hidden="true" />
            <span class="flex-1 text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {ui('settings.chapters.title_label', lang)} {index + 1}
            </span>
            <button
              type="button"
              class="shrink-0 text-xs px-2 py-1 btn-danger-outline"
              onclick={() => removeChapter(chapter.id)}
              aria-label="{ui('settings.chapters.remove', lang)} {index + 1}"
            >{ui('settings.chapters.remove', lang)}</button>
          </div>

          <!-- Chapter title — LocalizedStringEditor (single-line input) -->
          <div class="ml-5">
            <LocalizedStringEditor
              value={chapter.title}
              onchange={(v) => { chaptersAreDirty = true; chapter.title = v; }}
              mode="input"
              uid="chap-{chapter.id}"
              fieldName="title"
              {lang}
              placeholder={ui('settings.chapters.title_placeholder', lang)}
              extraPlaceholder={ui('editor.lang.translation_placeholder', lang)}
              inputClass="select-text"
            />
          </div>

          <!-- Chapter description — LocalizedStringEditor (textarea) -->
          <div class="ml-5">
            <LocalizedStringEditor
              value={chapter.description}
              onchange={(v) => { chaptersAreDirty = true; chapter.description = v; }}
              mode="textarea"
              uid="chap-{chapter.id}"
              fieldName="desc"
              {lang}
              placeholder={ui('settings.chapters.desc_placeholder', lang)}
              extraPlaceholder={ui('editor.lang.desc_translation_placeholder', lang)}
              inputClass="min-h-[3rem] text-xs select-text"
            />
          </div>

          <!-- ── Task list ──────────────────────────────────────────────── -->
          <div class="ml-5 flex flex-col gap-2">
            {#if chapter.tasks.length > 0}
              <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {ui('settings.chapters.tasks_label', lang)}
              </span>
              {#each chapter.tasks as task, ti (task.id)}
                <div
                  class="flex items-start gap-2 transition-opacity duration-100
                         {taskDragSrc?.chapterId === chapter.id && taskDragSrc?.index === ti ? 'opacity-30' : ''}"
                  draggable="true"
                  role="listitem"
                  ondragstart={() => handleTaskDragStart(chapter.id, ti)}
                  ondragover={(e) => handleTaskDragOver(e, chapter.id, ti)}
                  ondragend={handleTaskDragEnd}
                >
                  <IconDragHandle size={12} class="text-text-muted/40 shrink-0 cursor-grab mt-2" aria-hidden="true" />
                  <div class="flex-1 min-w-0">
                    <LocalizedStringEditor
                      value={task.title}
                      onchange={(v) => { chaptersAreDirty = true; task.title = v; }}
                      mode="input"
                      uid="task-{task.id}"
                      fieldName="title"
                      {lang}
                      placeholder={ui('settings.chapters.task_placeholder', lang)}
                      extraPlaceholder={ui('editor.lang.translation_placeholder', lang)}
                      inputClass="text-xs select-text"
                    />
                  </div>
                  <button
                    type="button"
                    class="shrink-0 p-1 btn-danger-outline mt-1"
                    onclick={() => removeTask(chapter.id, task.id)}
                    aria-label="{ui('settings.chapters.remove_task', lang)} {ti + 1}"
                  ><IconClose size={12} aria-hidden="true" /></button>
                </div>
              {/each}
            {/if}
            <button
              type="button"
              class="self-start text-xs text-accent/70 hover:text-accent transition-colors mt-0.5"
              onclick={() => addTask(chapter.id)}
            >{ui('settings.chapters.add_task', lang)}</button>
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  <button
    type="button"
    class="btn-secondary self-start gap-1 text-sm"
    onclick={addChapter}
  >+ {ui('settings.chapters.add', lang)}</button>
</section>
