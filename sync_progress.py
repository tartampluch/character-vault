#!/usr/bin/env python3
"""
sync_progress.py — Copy the PROMPT.md checklist verbatim into PROGRESS.md.

Reads the "# Checklist" section from PROMPT.md, adapts it for PROGRESS.md
(adjusts the header level from # to ##, then applies [x]/[ ] states), and
splices the result into PROGRESS.md — replacing only the checklist content
while preserving the preamble (title + CRITICAL CODING GUIDELINES) and the
trailing "## D20SRD Data Conversion" section.

────────────────────────────────────────────────────────────────
USAGE
    python sync_progress.py [LAST_CHECKED_TASK]

    LAST_CHECKED_TASK
        A case-insensitive prefix matched against each task's bold label
        (the text inside ** … ** or the first sentence of a plain item).
        Every task from the top of the list through the FIRST task whose
        label starts with that string is marked [x]; everything after is
        left [ ].

        Special values:
            ALL   – mark every task [x]  (except the NEVER_CHECK list below)
            NONE  – leave every task [ ]

        If omitted on the CLI, the LAST_CHECKED_TASK constant defined
        inside this script is used.  Replace "PLACEHOLDER" with a real
        value before running, or always pass it as a CLI argument.

EXAMPLES
    python sync_progress.py "Checkpoint #4"
    python sync_progress.py "20.6"
    python sync_progress.py "17.8"
    python sync_progress.py ALL
    python sync_progress.py NONE

NOTES
  • The match is a PREFIX match, so "7.3" matches "7.3 Character Vault Page"
    but NOT "17.3 Stacking Rules Tests". Be specific enough to be unambiguous.
  • Tasks in NEVER_CHECK are always left [ ] regardless of LAST_CHECKED_TASK.
  • The "## D20SRD Data Conversion" section in PROGRESS.md is never touched.
────────────────────────────────────────────────────────────────
"""

import re
import sys
from pathlib import Path
from typing import Optional

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION — replace PLACEHOLDER, or always pass the value as a CLI arg.
# ─────────────────────────────────────────────────────────────────────────────
LAST_CHECKED_TASK: str = "PLACEHOLDER"
# ─────────────────────────────────────────────────────────────────────────────

# Files live at the project root, alongside this script.
_ROOT = Path(__file__).resolve().parent
PROMPT_PATH = _ROOT / "PROMPT.md"
PROGRESS_PATH = _ROOT / "PROGRESS.md"

# Task labels whose bold text STARTS WITH any entry below are NEVER
# automatically marked [x], no matter what LAST_CHECKED_TASK is set to.
NEVER_CHECK: frozenset[str] = frozenset(
    {
        "22.",  # Phase 22 — all tasks (22.1 … 22.13, Checkpoint #9)
        "Checkpoint #9",  # Phase 22 checkpoint
        "Final Review",  # Pre-release final review
    }
)

# ── Regex / string constants ─────────────────────────────────────────────────
# Defined once to avoid SonarQube S1192 (duplicate literal) warnings.
_PAT_CHECKED = re.compile(r"^- \[x\]")
_PAT_UNCHECKED = re.compile(r"^- \[ \]")
_CHECKED = "- [x]"
_UNCHECKED = "- [ ]"


# ── Helpers ──────────────────────────────────────────────────────────────────


def extract_checklist_from_prompt(text: str) -> str:
    """Return the text from '# Checklist' to EOF in PROMPT.md."""
    m = re.search(r"^# Checklist\s*$", text, re.MULTILINE)
    if not m:
        raise ValueError("'# Checklist' heading not found in PROMPT.md")
    return text[m.start() :]


def remap_header_level(text: str) -> str:
    """Convert '# Checklist' to '## Checklist' (PROMPT → PROGRESS level)."""
    return text.replace("# Checklist\n", "## Checklist\n", 1)


def task_label(line: str) -> Optional[str]:
    """
    Return the human-readable label of a checklist item line, or None.

    Examples:
      '- [ ] **1.1 Primitives & i18n:** …'  → '1.1 Primitives & i18n'
      '- [x] **Checkpoint #4 — Test…'       → 'Checkpoint #4 — Test…'
      '- [ ] **Final Review** (complete…'   → 'Final Review'
      '- [ ] **21.1+ To be determined.**'   → '21.1+ To be determined.'
      '- [x] Initialize Project & PROG…'    → 'Initialize Project & …'
    """
    if not line.startswith("- ["):
        return None
    # Items with a bold label — stop at closing ** or first colon
    m = re.match(r"^- \[[ x]\] \*\*(.+?)(?:\*\*|:)", line)
    if m:
        return m.group(1).strip()
    # Plain items without bold formatting
    m = re.match(r"^- \[[ x]\] (.+)", line)
    return m.group(1).strip() if m else None


# ── Check-state logic ────────────────────────────────────────────────────────


def _transform_task_line(
    line: str,
    label: str,
    check_all: bool,
    still_checking: bool,
    last_checked: str,
) -> tuple[str, bool, bool]:
    """
    Compute the transformed line and updated state for one checklist item.

    Returns:
        (new_line, new_still_checking, hit_target)
    """
    if any(label.startswith(nc) for nc in NEVER_CHECK):
        return _PAT_CHECKED.sub(_UNCHECKED, line), still_checking, False
    if check_all:
        return _PAT_UNCHECKED.sub(_CHECKED, line), True, False
    if still_checking:
        new_line = _PAT_UNCHECKED.sub(_CHECKED, line)
        hit = label.lower().startswith(last_checked.lower())
        return new_line, not hit, hit
    return _PAT_CHECKED.sub(_UNCHECKED, line), False, False


def apply_check_states(lines: list[str], last_checked: str) -> list[str]:
    """
    Walk checklist lines and return them with [x]/[ ] states applied.

    Rules (applied in order):
      1. NONE        → uncheck every task.
      2. ALL         → check every task (except NEVER_CHECK entries).
      3. <prefix>    → check tasks from the top through the first task whose
                       label starts with <prefix>; leave everything after [ ].
      4. NEVER_CHECK → the listed label prefixes are always [ ].
    """
    if last_checked.upper() == "NONE":
        return [_PAT_CHECKED.sub(_UNCHECKED, ln) for ln in lines]

    check_all = last_checked.upper() == "ALL"
    still_checking = True  # becomes False once we pass LAST_CHECKED_TASK
    found_target = False  # set True when the target task is encountered
    result: list[str] = []

    for line in lines:
        label = task_label(line)
        if label is None:
            result.append(line)
            continue
        new_line, still_checking, hit = _transform_task_line(
            line, label, check_all, still_checking, last_checked
        )
        result.append(new_line)
        if hit:
            found_target = True

    if not check_all and not found_target:
        print(
            "\n⚠  Warning: no task label starting with "
            f"'{last_checked}' was found.\n"
            "   All tasks have been marked [x].  "
            "Verify the task identifier.\n"
        )

    return result


# ── Splicing ─────────────────────────────────────────────────────────────────


def splice_into_progress(progress_text: str, new_section: str) -> str:
    """
    Replace the ## Checklist content in PROGRESS.md with new_section.

    new_section must start with '## Checklist\\n'.

    Preservation contract:
      • Everything before '## Checklist' (title + CRITICAL CODING GUIDELINES).
      • Everything from the blank-line + '---' separator before
        '## D20SRD Data Conversion' through EOF.

    The function is tolerant: if '## D20SRD Data Conversion' is absent the
    old checklist content is simply discarded and new_section is appended.
    """
    # ── Locate ## Checklist ──────────────────────────────────────────────────
    # CL_MARKER starts with \n so cl_pos points at the \n blank line that
    # immediately precedes '## Checklist' in the file.
    CL_MARKER = "\n## Checklist\n"
    cl_pos = progress_text.find(CL_MARKER)
    if cl_pos == -1:
        raise ValueError("'## Checklist' not found in PROGRESS.md")

    # "before" is everything up to (not including) that leading \n
    before = progress_text[:cl_pos]

    # ── Locate ## D20SRD Data Conversion ─────────────────────────────────────
    # D20_MARKER starts with \n so d20_pos points at the blank line that
    # comes before the '---' separator preceding '## D20SRD Data Conversion'.
    D20_MARKER = "\n---\n\n## D20SRD Data Conversion"
    d20_pos = progress_text.find(D20_MARKER, cl_pos)

    # "after" preserves the separator + D20SRD section (or is empty)
    after = progress_text[d20_pos:] if d20_pos != -1 else ""

    if d20_pos == -1:
        print(
            "⚠  '## D20SRD Data Conversion' not found — section will not be appended."
        )

    # ── Ensure clean boundaries ──────────────────────────────────────────────
    if before and not before.endswith("\n"):
        before += "\n"
    if new_section and not new_section.endswith("\n"):
        new_section += "\n"

    # Join: before ends with '---\n', we add '\n' for the blank line,
    # then new_section ('## Checklist\n\n…'),
    # then after ('\n---\n\n## D20SRD…').
    return before + "\n" + new_section + after


# ── Entry point ──────────────────────────────────────────────────────────────


def main() -> None:
    last_checked = sys.argv[1] if len(sys.argv) > 1 else LAST_CHECKED_TASK

    if last_checked == "PLACEHOLDER":
        sys.exit(
            "\n❌  LAST_CHECKED_TASK is still 'PLACEHOLDER'.\n\n"
            "    Either:\n"
            "      1. Pass it as a CLI argument:\n"
            '            python sync_progress.py "Checkpoint #4"\n'
            '            python sync_progress.py "20.6"\n'
            "            python sync_progress.py ALL\n"
            "            python sync_progress.py NONE\n\n"
            "      2. Edit the LAST_CHECKED_TASK constant at the "
            "top of this script.\n"
        )

    print(f"  Source  : {PROMPT_PATH}")
    print(f"  Target  : {PROGRESS_PATH}")
    print(f"  Mode    : last checked task = '{last_checked}'")
    print()

    prompt_text = PROMPT_PATH.read_text(encoding="utf-8")
    progress_text = PROGRESS_PATH.read_text(encoding="utf-8")

    # 1. Extract the checklist section from PROMPT.md
    raw_section = extract_checklist_from_prompt(prompt_text)

    # 2. Remap header level (# → ##)
    remapped = remap_header_level(raw_section)

    # 3. Apply [x]/[ ] states
    lines = remapped.splitlines(keepends=True)
    final_lines = apply_check_states(lines, last_checked)
    final_section = "".join(final_lines)

    # 4. Splice into PROGRESS.md
    updated = splice_into_progress(progress_text, final_section)

    # 5. Write back
    PROGRESS_PATH.write_text(updated, encoding="utf-8")

    # 6. Report
    checked = sum(1 for ln in final_lines if ln.startswith(_CHECKED))
    unchecked = sum(1 for ln in final_lines if ln.startswith(_UNCHECKED))
    print("✅  PROGRESS.md updated successfully.")
    print(f"    [x] checked   : {checked}")
    print(f"    [ ] unchecked : {unchecked}")


if __name__ == "__main__":
    main()
