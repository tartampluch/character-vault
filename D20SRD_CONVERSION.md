# Character Vault — d20 SRD Data Conversion Pipeline

---

## LOOP EXECUTION PROTOCOL

> **Primary command** (repeat until all tasks are done):
> _"Read `D20SRD_CONVERSION.md` and execute the first unchecked task."_

**When this command is received, execute exactly the following steps — no more, no less:**

1. Scan the **CONVERSION TASK CHECKLIST** section of this file for the **first `- [ ]`** checkbox. That is the task to execute. Note its ID (e.g., `C-01`, `C-10a`, `C-15b`).
2. Load context files (see **CONTEXT FILES** section).
3. Read the source HTML file(s) listed for that task.
4. **If an output file for this task already exists:** validate it using the **STANDARD VALIDATION CHECKLIST**. If valid, skip to step 7 (mark complete, stop). If invalid, delete the file and continue.
5. Execute the conversion, applying all rules in this document.
6. Run the **STANDARD VALIDATION CHECKLIST**. Fix any issues before continuing.
7. **On completion, do ALL of the following:**
   - Update **this file**: change `- [ ] **C-XX**` → `- [x] **C-XX**` for the completed task.
   - End your response with: _"Task [C-XX] complete. [N] entities written to [filename]. Ready for the next task."_
8. **STOP.** Do not begin the next task until the user repeats the command.

**If all checkboxes are `- [x]`:** reply _"All conversion tasks are complete."_

---

## SECONDARY COMMANDS

| Command | Effect |
|---|---|
| `Status` | Count `- [x]` vs. `- [ ]` checkboxes in this file and print a structured summary. |
| `Validate C-XX` | Validate the output file for the specified task without re-converting. Report all issues found. |
| `Validate all` | Validate all output files whose task is marked `- [x]`. |
| `Re-execute C-XX` | Force re-execution: clear its checkbox to `- [ ]`, delete its output file, re-convert, update. |

---

## CRITICAL GUIDELINES

> ⚠️ **These guidelines must be respected for EVERY task without exception.**

1. **Context Loading:** Read `ARCHITECTURE.md` for EVERY task. Read `ANNEXES.md` for complex feature modeling (class features, prestige classes, spells, psionic powers, magic items). See **CONTEXT FILES** for guidance on when each is needed.
2. **Source of Truth:** The d20 SRD mirror is at `d20srd/www.d20srd.org/` (project root). Always read the source HTML before converting. Never invent data — if a rule is unclear, extract the text verbatim into `description`.
3. **Atomicity:** One task at a time. Complete the current task fully, update the checkbox, then stop. Do not chain tasks unless explicitly instructed.
4. **Error & Blocker Protocol:** If you encounter a missing mechanism, an architectural ambiguity, a bug, or a situation this document does not cover — **STOP IMMEDIATELY**. Do not attempt a workaround. Report what you were doing, what the problem is, and what decision is needed. Wait for instructions.
5. **No Hardcoded Logic:** JSON data only. Never embed D&D rules into TypeScript or Svelte.
6. **Bilingual Output:** Every `label` and `description` field MUST have both `"en"` and `"fr"` values. Use the **FRENCH TRANSLATION REFERENCE** table in this document. When a term is not listed, use the official WotC French D&D 3.5 edition (Éditions Spécial Jeux / Asmodée).
7. **Output Directory Creation:** If the target directory does not exist (`static/rules/00_d20srd_core/` or `static/rules/01_d20srd_psionics/`), create it before writing the output file.

---

## OUTPUT DIRECTORY STRUCTURE

All paths are relative to the project root.

```
static/rules/
  00_d20srd_core/
    00_d20srd_core_races.json                    ← C-03
    01_d20srd_core_classes.json                  ← C-04a … C-04k (multi-batch)
    02_d20srd_core_class_features.json           ← C-05a … C-05k (multi-batch)
    03_d20srd_core_feats.json                    ← C-06a … C-06f (multi-batch)
    04_d20srd_core_skills_config.json            ← C-02
    05_d20srd_core_spells.json                   ← C-10a … C-10ae + C-15k (multi-batch)
    06_d20srd_core_equipment_weapons.json        ← C-07
    07_d20srd_core_equipment_armor.json          ← C-08
    08_d20srd_core_equipment_goods.json          ← C-09
    09_d20srd_core_config.json                   ← C-01
    10_d20srd_core_prestige_classes.json         ← C-11a … C-11e (multi-batch)
    11_d20srd_core_prestige_class_features.json  ← C-12a … C-12e (multi-batch)
    12_d20srd_core_magic_items.json              ← C-14a … C-14e (multi-batch)
    13_d20srd_core_domains.json                  ← C-13
    14_d20srd_core_npc_classes.json              ← C-16
    15_d20srd_core_special_materials.json        ← C-17
  01_d20srd_psionics/
    00_d20srd_psionics_classes.json              ← C-15a
    01_d20srd_psionics_class_features.json       ← C-15b
    02_d20srd_psionics_powers.json               ← C-15c … C-15d (multi-batch)
    03_d20srd_psionics_feats.json                ← C-15e
    04_d20srd_psionics_races.json                ← C-15f
    05_d20srd_psionics_prestige_classes.json     ← C-15h
    06_d20srd_psionics_prestige_class_features.json ← C-15i
    07_d20srd_psionics_items.json                ← C-15j
```

---

## CONTEXT FILES

Both files are at the project root.

| File | Contains | When to read |
|---|---|---|
| `ARCHITECTURE.md` | TypeScript interfaces, engine rules, modifier stacking, LogicNode syntax, pipeline names | **Every task** — defines all types you must conform to |
| `ANNEXES.md` | Complete worked JSON examples for every feature type | **Any task where you need a concrete JSON model** — see table below |

**ANNEXES.md quick-reference — what's included:**

| Section | Example | Most useful for |
|---|---|---|
| A.1.1 | Barbarian 20-level class | C-04a/C-05a, C-04b/C-05b, C-04e/C-05e, C-04h/C-05h, C-04i/C-05i, C-04j/C-05j, C-04k/C-05k |
| A.1.2 | Cleric 5 levels + Turn Undead | C-04c/C-05c, C-04g/C-05g |
| A.1.3 | Monk 5 levels + conditional AC | C-04f/C-05f |
| A.2.1 | Dragon Disciple (prestige class) | C-11, C-12 |
| A.3.1–3.3 | Human, Elf, Gnome races | C-03 |
| A.3.4 | Dromite (psionic race) | C-15f |
| A.4.1–4.6 | 6 Feats (prereq chain, choices, metamagic, metapsionic) | C-06, C-15e |
| A.5.1–5.9 | 9 Items (armor, magic, exotic weapons, cursed) | C-07, C-08, C-09, C-14 |
| A.6.1–6.5 | 5 Spells (divine, multi-list, scaling formula) | C-10 |
| A.7 | Soulknife psionic class + Mind Blade | C-15a, C-15b |
| A.8 | Druid + Animal Companion | C-04d/C-05d, C-04h/C-05h |
| A.9 | Sphere of Annihilation (artifact) | C-14 |
| A.12 | Energy Missile + Metamorphosis (psionic powers with augmentations) | C-15c, C-15d |

---

## FRENCH TRANSLATION REFERENCE

Use these official WotC French D&D 3.5 terms for all `label` and `description` fields.
When translating descriptive text, aim for the style of the official French *Manuel des Joueurs* (3.5).

### Ability Scores and Saves

| English | French | ID used in data |
|---|---|---|
| Strength | Force | `stat_str` |
| Dexterity | Dextérité | `stat_dex` |
| Constitution | Constitution | `stat_con` |
| Intelligence | Intelligence | `stat_int` |
| Wisdom | Sagesse | `stat_wis` |
| Charisma | Charisme | `stat_cha` |
| Fortitude save | jet de Vigueur | `save_fort` |
| Reflex save | jet de Réflexes | `save_ref` |
| Will save | jet de Volonté | `save_will` |

### Core Combat Terms

| English | French |
|---|---|
| Base Attack Bonus (BAB) | Bonus de base à l'attaque (BBA) |
| Armor Class (AC) | Classe d'armure (CA) |
| Hit Points (HP) | Points de vie (PV) |
| Damage Reduction | Réduction des dégâts |
| Spell Resistance | Résistance à la magie |
| Fast Healing | Guérison accélérée |
| Attack roll | Jet d'attaque |
| Damage roll | Jet de dégâts |
| Critical hit | Coup critique |
| Initiative | Initiative |
| Touch attack | Attaque de contact |
| Flat-footed | Pris au dépourvu |
| Flanked | Pris en tenaille |

### Classes (base)

| English | French |
|---|---|
| Barbarian | Barbare |
| Bard | Barde |
| Cleric | Clerc |
| Druid | Druide |
| Fighter | Guerrier |
| Monk | Moine |
| Paladin | Paladin |
| Ranger | Rôdeur |
| Rogue | Roublard |
| Sorcerer | Ensorceleur |
| Wizard | Magicien |

### Prestige Classes

| English | French |
|---|---|
| Arcane Archer | Archer arcane |
| Arcane Trickster | Filou de l'arcane |
| Archmage | Archimage |
| Assassin | Assassin |
| Blackguard | Chevalier maudit |
| Dragon Disciple | Disciple du dragon |
| Duelist | Duelliste |
| Dwarven Defender | Défenseur nain |
| Eldritch Knight | Chevalier mystique |
| Hierophant | Hiérophante |
| Horizon Walker | Marcheur des horizons |
| Loremaster | Érudit |
| Mystic Theurge | Théurge mystique |
| Shadowdancer | Danseur des ombres |
| Thaumaturgist | Thaumaturge |

### Key Class Features

| English | French |
|---|---|
| Rage | Furie (barbare) |
| Sneak Attack | Attaque sournoise |
| Bardic Music | Musique de barde |
| Wild Shape | Forme sauvage |
| Flurry of Blows | Torrent de coups |
| Unarmed Strike | Attaque à mains nues |
| Lay on Hands | Imposition des mains |
| Smite Evil | Châtiment du Mal |
| Turn Undead | Renvoi des morts-vivants |
| Rebuke Undead | Contrôle des morts-vivants |
| Evasion | Esquive totale |
| Uncanny Dodge | Esquive instinctive |
| Trap Finding | Recherche de pièges |
| Familiar | Familier |
| Animal Companion | Compagnon animal |
| Spells per Day | Sorts par jour |
| Bonus Feat | Don supplémentaire |

### Races

| English | French |
|---|---|
| Human | Humain |
| Dwarf | Nain |
| Elf | Elfe |
| Gnome | Gnome |
| Half-Elf | Demi-elfe |
| Half-Orc | Demi-orc |
| Halfling | Halfelin |

### Alignment

| English | French |
|---|---|
| Lawful Good | Loyal Bon |
| Lawful Neutral | Loyal Neutre |
| Lawful Evil | Loyal Mauvais |
| Neutral Good | Neutre Bon |
| True Neutral | Neutre |
| Neutral Evil | Neutre Mauvais |
| Chaotic Good | Chaotique Bon |
| Chaotic Neutral | Chaotique Neutre |
| Chaotic Evil | Chaotique Mauvais |

### Size Categories

| English | French |
|---|---|
| Fine | Infime |
| Diminutive | Minuscule |
| Tiny | Très petit |
| Small | Petit |
| Medium | Moyen |
| Large | Grand |
| Huge | Très grand |
| Gargantuan | Gigantesque |
| Colossal | Colossal |

### Schools of Magic

| English | French | Tag |
|---|---|---|
| Abjuration | Abjuration | `spell_abjuration` |
| Conjuration | Invocation | `spell_conjuration` |
| Divination | Divination | `spell_divination` |
| Enchantment | Enchantement | `spell_enchantment` |
| Evocation | Évocation | `spell_evocation` |
| Illusion | Illusion | `spell_illusion` |
| Necromancy | Nécromancie | `spell_necromancy` |
| Transmutation | Transmutation | `spell_transmutation` |
| Universal | Universel | `spell_universal` |

### Magic Sub-schools

| English | French |
|---|---|
| Calling | Appel |
| Charm | Charme |
| Compulsion | Contrainte |
| Creation | Création |
| Figment | Mirage |
| Glamour | Déguisement |
| Healing | Guérison |
| Pattern | Motif |
| Phantasm | Fantasme |
| Scrying | Scrutation |
| Shadow | Ombre |
| Summoning | Convocation |
| Teleportation | Téléportation |

### Spell Components and Ranges

| English | French |
|---|---|
| Verbal (V) | Verbale (V) |
| Somatic (S) | Somatique (S) |
| Material (M) | Matérielle (M) |
| Focus (F) | Focalisateur (F) |
| Divine Focus (DF) | Focalisateur divin (FD) |
| Experience Points (XP) cost | Coût en points d'expérience |
| Personal | Personnelle |
| Touch | Contact |
| Close | Courte |
| Medium | Moyenne |
| Long | Longue |
| Instantaneous | Instantanée |
| Concentration | Concentration |
| Permanent | Permanente |

### Key Skills

| English | French |
|---|---|
| Appraise | Estimation |
| Balance | Équilibre |
| Bluff | Bluff |
| Climb | Escalade |
| Concentration | Concentration |
| Craft | Artisanat |
| Decipher Script | Déchiffrage |
| Diplomacy | Diplomatie |
| Disable Device | Sabotage |
| Disguise | Déguisement |
| Escape Artist | Évasion |
| Forgery | Contrefaçon |
| Gather Information | Collecte d'informations |
| Handle Animal | Dressage |
| Heal | Art de la guérison |
| Hide | Discrétion |
| Intimidate | Intimidation |
| Jump | Saut |
| Knowledge | Connaissance |
| Listen | Écoute |
| Move Silently | Déplacement silencieux |
| Open Lock | Crochetage |
| Perform | Représentation |
| Profession | Profession |
| Ride | Équitation |
| Search | Fouille |
| Sense Motive | Psychologie |
| Sleight of Hand | Escamotage |
| Spellcraft | Art de la magie |
| Spot | Observation |
| Survival | Survie |
| Swim | Natation |
| Tumble | Acrobaties |
| Use Magic Device | Utilisation d'objets magiques |
| Use Rope | Utilisation de cordes |

### Weapon and Armor Types

| English | French |
|---|---|
| Simple weapon | Arme courante |
| Martial weapon | Arme de guerre |
| Exotic weapon | Arme exotique |
| Light armor | Armure légère |
| Medium armor | Armure intermédiaire |
| Heavy armor | Armure lourde |
| Shield | Bouclier |
| Buckler | Rondache |
| Tower shield | Pavois |
| Slashing | Tranchant |
| Piercing | Perforant |
| Bludgeoning | Contondant |

---

## UNIVERSAL CONVERSION RULES

### IDs

All IDs use strict `kebab-case` with a category prefix:

| Category | Prefix | Example |
|---|---|---|
| Race | `race_` | `race_human`, `race_half_elf` |
| Base Class | `class_` | `class_barbarian`, `class_fighter` |
| Prestige Class | `class_` | `class_dragon_disciple` |
| Class Feature | `class_feature_` | `class_feature_barbarian_rage` |
| Feat | `feat_` | `feat_power_attack`, `feat_weapon_focus` |
| Skill | `skill_` | `skill_climb`, `skill_knowledge_arcana` |
| Spell | `spell_` | `spell_fireball`, `spell_cure_light_wounds` |
| Psionic Power | `power_` | `power_energy_missile` |
| Item | `item_` | `item_longsword`, `item_chainmail` |
| Domain | `domain_` | `domain_fire`, `domain_war` |
| Config Table | `config_` | `config_carrying_capacity` |
| Modifier (in levelProgression) | `<classId>_<level>_<stat>` | `class_barbarian_1_bab` |
| Modifier (in class feature) | `<featureId>_<effect>` | `class_feature_barbarian_rage_str` |

### Mandatory fields for every Feature entity

```json
{
  "id": "...",
  "category": "race|class|class_feature|feat|magic|item|domain|condition",
  "ruleSource": "srd_core",
  "label": { "en": "...", "fr": "..." },
  "description": { "en": "...", "fr": "..." },
  "tags": [],
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

> Psionic content uses `"ruleSource": "srd_psionics"`.

### Converting prerequisites to `prerequisitesNode`

| SRD text | JSON `LogicNode` |
|---|---|
| `Str 13` | `{ "logic": "CONDITION", "targetPath": "@attributes.stat_str.totalValue", "operator": ">=", "value": 13, "errorMessage": "Requires Strength 13+" }` |
| `BAB +6` | `{ "logic": "CONDITION", "targetPath": "@combatStats.bab.totalValue", "operator": ">=", "value": 6, "errorMessage": "Requires BAB +6" }` |
| `Power Attack feat` | `{ "logic": "CONDITION", "targetPath": "@activeTags", "operator": "has_tag", "value": "feat_power_attack", "errorMessage": "Requires Power Attack" }` |
| `5 ranks in Spot` | `{ "logic": "CONDITION", "targetPath": "@skills.skill_spot.ranks", "operator": ">=", "value": 5, "errorMessage": "Requires 5 ranks in Spot" }` |
| `Caster level 3` | `{ "logic": "CONDITION", "targetPath": "@attributes.caster_level.totalValue", "operator": ">=", "value": 3, "errorMessage": "Requires caster level 3" }` |
| Multiple requirements (AND) | `{ "logic": "AND", "nodes": [ … ] }` |
| Alternative requirements (OR) | `{ "logic": "OR", "nodes": [ … ] }` |

### Mandatory tags by category

| Entity type | Required tags |
|---|---|
| Race | `["race", "race_<name>", "size_medium"]` (or `size_small`, etc.) |
| Base class | `["class", "base_class", "class_<name>"]` + caster type if applicable |
| Prestige class | `["class", "prestige_class", "class_<name>"]` |
| Feat (general) | `["feat", "general"]` |
| Feat (fighter bonus) | `["feat", "general", "fighter_bonus_feat"]` |
| Feat (metamagic) | `["feat", "metamagic"]` |
| Feat (item creation) | `["feat", "item_creation"]` |
| Spell | `["spell", "spell_<school>"]` + descriptor tags (e.g. `"fire"`, `"mind-affecting"`) |
| Weapon (martial) | `["item", "weapon", "weapon_martial", "weapon_melee"]` (or `weapon_ranged`) |
| Armor (medium) | `["item", "armor", "armor_medium", "metal_armor", "wearing_armor"]` |
| Domain | `["domain", "domain_<name>"]` |

### BAB increments — critical rule

The SRD HTML shows **cumulative totals** (e.g., `+6/+1` at level 6). Store **per-level increments**:

| Level | SRD total | Previous total | **Increment to store** |
|---|---|---|---|
| 1 | +1 | 0 | **+1** |
| 2 | +2 | +1 | **+1** |
| 5 | +5 | +4 | **+1** |
| 6 | +6/+1 | +5 | **+1** |

The engine sums all increments for levels ≤ `classLevels[classId]`. Do **not** store totals.

### Save progression increments

Good save (cumulative: 2, 3, 3, 4, 4, 5, 5, 6, 6, 7…) → increments: `2,1,0,1,0,1,0,1,0,1…`
Poor save (cumulative: 0, 0, 1, 1, 1, 2, 2, 2, 3…) → increments: `0,0,1,0,0,1,0,0,1,0…`

**Always store increments, never cumulative totals.**

---

## MULTI-BATCH FILE HANDLING

Several tasks build a single output file across multiple sub-tasks:

| Sub-tasks | Shared output file |
|---|---|
| C-04a through C-04k | `01_d20srd_core_classes.json` |
| C-05a through C-05k | `02_d20srd_core_class_features.json` |
| C-06a through C-06f | `03_d20srd_core_feats.json` |
| C-10a through C-10ae + C-15k | `05_d20srd_core_spells.json` |
| C-11a through C-11e | `10_d20srd_core_prestige_classes.json` |
| C-12a through C-12e | `11_d20srd_core_prestige_class_features.json` |
| C-14a through C-14e | `12_d20srd_core_magic_items.json` |
| C-15c and C-15d | `02_d20srd_psionics_powers.json` |
| C-15h and C-15i | `05_d20srd_psionics_prestige_classes.json` and `06_d20srd_psionics_prestige_class_features.json` |

**Rules:**
- **First sub-task** (e.g., C-04a, C-05a, C-10a): create the file as a top-level JSON array `[…]` with that batch's entries.
- **Subsequent sub-tasks**: read the existing file, parse the array, append the new entries, write back. Never overwrite the whole file from scratch.
- **Re-executing one sub-task**: remove that batch's entries by ID range, then re-add them.
- **Full-file validation** is only required after the final sub-task of each group (C-04k, C-05k, C-10ae, C-14e, C-15d).

---

## CONVERSION TASK CHECKLIST

> Scan from the top for the first `- [ ]` checkbox. That is the next task.

---

### C-01 — Configuration Tables (`09_d20srd_core_config.json`)

- [x] **C-01** — Convert configuration tables

**Source files:**
- `d20srd/www.d20srd.org/srd/carryingCapacity.html`
- `d20srd/www.d20srd.org/srd/xp.html`
- `d20srd/www.d20srd.org/srd/theBasics.html`
- `d20srd/www.d20srd.org/srd/description.html`

**Tables to produce:**

| `tableId` | Content |
|---|---|
| `config_carrying_capacity` | Light/Medium/Heavy load per Strength score (1–29+), in lbs |
| `config_xp_table` | XP required per level (1–20) and XP awarded per CR |
| `config_point_buy_costs` | Point buy cost for each ability score (8–18) |
| `config_size_categories` | Size names, space/reach, attack/AC modifier, Hide modifier, carrying capacity multiplier |
| `config_ability_score_costs` | Cost table for 3.5 standard point buy |

**Output format:** The output file is a top-level JSON array of config table objects:
```json
[
  {
    "tableId": "config_carrying_capacity",
    "ruleSource": "srd_core",
    "data": {
      "1":  { "lightLbs": 3,  "mediumLbs": 6,  "heavyLbs": 10 },
      "10": { "lightLbs": 33, "mediumLbs": 66, "heavyLbs": 100 }
    }
  },
  { "tableId": "config_xp_table", ... }
]
```

**Priority:** FIRST — all subsequent tasks may reference these tables.

---

### C-02 — Skill Definitions (`04_d20srd_core_skills_config.json`)

- [x] **C-02** — Convert all skill definitions

**Source files:** `d20srd/www.d20srd.org/srd/skills/` — all `.html` files except `index*.html`

**Skills to convert:** ~36 skills + sub-variants. Each Knowledge specialty is a separate entry (`skill_knowledge_arcana`, `skill_knowledge_history`, etc.). Same for Craft, Perform, Profession.

**Output format:**
```json
[
  {
    "tableId": "config_skill_definitions",
    "ruleSource": "srd_core",
    "data": {
      "skill_climb": {
        "id": "skill_climb",
        "label": { "en": "Climb", "fr": "Escalade" },
        "keyAbility": "stat_str",
        "canBeUsedUntrained": true,
        "appliesArmorCheckPenalty": true,
        "description": { "en": "...", "fr": "..." },
        "synergies": [
          {
            "sourceSkillId": "skill_climb",
            "minRanks": 5,
            "targetSkillId": "skill_jump",
            "bonus": 2,
            "type": "synergy"
          }
        ]
      }
    }
  }
]
```

**Important:** Capture all synergy bonuses (e.g., 5 ranks in Bluff → +2 Intimidate). Use the **Key Skills** section of the French reference for translations.

---

### C-03 — Races (`00_d20srd_core_races.json`)

- [x] **C-03** — Convert the 7 core races

**Source files:** `d20srd/www.d20srd.org/srd/races.html`
**Context:** Read `ANNEXES.md` sections A.3.1–3.3 before starting.

**Races:** Human, Dwarf, Elf, Gnome, Half-Elf, Half-Orc, Halfling

**For each race, capture:**
- Ability score modifiers (e.g., Dwarf: +2 CON, −2 CHA) → `grantedModifiers`, type `"racial"`
- Size and land speed
- Special qualities (darkvision, low-light vision, immunities, resistances)
- Skill bonuses (e.g., Elf: +2 Listen/Search/Spot) → `grantedModifiers`, type `"racial"`
- Situational bonuses (e.g., Dwarf +2 saves vs. poison) → `situationalContext: "vs_poison"`, NOT in `activeModifiers`
- Bonus feats and starting languages → `grantedFeatures`
- Favored class → metadata field or `grantedFeatures`
- `classSkills` if a racial feature grants class skills
- Tags: `["race", "race_<name>", "size_<category>"]`

---

### C-04a — Base Class: Barbarian (`01_d20srd_core_classes.json`)

- [x] **C-04a** — Convert Barbarian (structure only — features in C-05a)

**Source file:** `d20srd/www.d20srd.org/srd/classes/barbarian.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Create `01_d20srd_core_classes.json` as a top-level JSON array with this one entry.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; list feature IDs — full feature objects go in C-05a)
- `classSkills` array
- `grantedModifiers`: hit die (d12, type `"base"`), skill points per level (4 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_all_martial`, `proficiency_armor_light`, `proficiency_armor_medium`, `proficiency_shields`
- `forbiddenTags`: `["alignment_lawful"]`
- Tags: `["class", "base_class", "class_barbarian"]`
- `recommendedAttributes`: STR, CON

---

### C-05a — Base Class Features: Barbarian (`02_d20srd_core_class_features.json`)

- [x] **C-05a** — Convert Barbarian class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/barbarian.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Create `02_d20srd_core_class_features.json` as a top-level JSON array.

Convert every feature ID listed in `class_barbarian.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Rage | `activation` (free action) + `resourceCost` on `resources.barbarian_rage_uses`; max formula = `"1 + floor(@classLevels.class_barbarian / 4)"`; conditional +4 STR, +4 CON, +2 Will, −2 AC while active |
| Fast Movement | `grantedModifiers` +10 ft on `combatStats.land_speed`, type `"untyped"`, conditionNode: no medium/heavy armor |
| Uncanny Dodge | Conditional flag: retains DEX bonus to AC when flat-footed |
| Improved Uncanny Dodge | Cannot be flanked except by a rogue 4+ levels higher |
| Trap Sense | `grantedModifiers` on Reflex saves and AC vs. traps, type `"untyped"`, increments at levels 3, 6, 9, 12, 15, 18 |
| Damage Reduction | `setAbsolute` on `combatStats.damage_reduction`; value and bypass change per level (DR 1/— at 11, scaling to DR 5/— at 20) |
| Greater Rage / Indomitable Will / Tireless Rage / Mighty Rage | Upgrade modifiers building on the core Rage feature |

---

### C-04b — Base Class: Bard (`01_d20srd_core_classes.json`)

- [x] **C-04b** — Convert Bard (structure only — features in C-05b)

**Source file:** `d20srd/www.d20srd.org/srd/classes/bard.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs)
- `classSkills` array
- `grantedModifiers`: hit die (d6, type `"base"`), skill points per level (6 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_weapons_simple`, `proficiency_longsword`, `proficiency_rapier`, `proficiency_sap`, `proficiency_short_sword`, `proficiency_shortbow`, `proficiency_whip`, `proficiency_armor_light`, `proficiency_shields_no_tower`
- Tags: `["class", "base_class", "class_bard", "arcane_caster", "spontaneous_caster"]`
- `recommendedAttributes`: CHA, DEX

---

### C-05b — Base Class Features: Bard (`02_d20srd_core_class_features.json`)

- [x] **C-05b** — Convert Bard class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/bard.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append Bard feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_bard.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Bardic Music (pool) | `ResourcePool` on `resources.bardic_music_uses`; max = character level |
| Countersong / Fascinate / Inspire Courage / Inspire Competence / Inspire Greatness / Inspire Heroics / Song of Freedom / Suggestion / Mass Suggestion | Each is its own feature with `activation` + `resourceCost: 1` on `resources.bardic_music_uses`; Inspire Courage bonus scales at levels 8, 14, 20 via conditional `grantedModifiers` |
| Bardic Knowledge | `grantedModifiers` bonus = class level + INT modifier on `attributes.bardic_knowledge` |
| Spellcasting (arcane, spontaneous) | `ResourcePool` per slot level 0–6 on `resources.spell_slots_bard_<n>`; also model spells known table |
| Countersong | Uses `resourceCost` on the shared pool; effect is a Perform check result targeting enemy sonic/language-dependent spell saves |

---

### C-04c — Base Class: Cleric (`01_d20srd_core_classes.json`)

- [x] **C-04c** — Convert Cleric (structure only — features in C-05c)

**Source file:** `d20srd/www.d20srd.org/srd/classes/cleric.html`
**Context:** Read `ANNEXES.md` section A.1.2 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs)
- `classSkills` array
- `grantedModifiers`: hit die (d8, type `"base"`), skill points per level (2 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_weapons_simple`, `proficiency_armor_all`, `proficiency_shields_all`
- Tags: `["class", "base_class", "class_cleric", "divine_caster", "prepared_caster"]`
- `choices`: two domain selections `{ "choiceId": "domain_1", "optionsQuery": "tag:domain", "maxSelections": 1 }` and `{ "choiceId": "domain_2", "optionsQuery": "tag:domain", "maxSelections": 1 }`
- `recommendedAttributes`: WIS, CHA

---

### C-05c — Base Class Features: Cleric (`02_d20srd_core_class_features.json`)

- [x] **C-05c** — Convert Cleric class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/cleric.html`
**Context:** Read `ANNEXES.md` section A.1.2 only.
**Output:** Append Cleric feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_cleric.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Turn Undead | `activation` (standard action) + `ResourcePool` `resources.turn_undead_uses` max = `"3 + @attributes.stat_cha.derivedModifier"` |
| Rebuke Undead | Evil clerics only — same pool/pattern as Turn Undead; different effect description |
| Spontaneous Casting | Tag-based flag: good/neutral clerics swap any prepared spell for a Cure spell of equal or lower level; evil clerics swap for Inflict — model as a `situationalContext` note in description, no `grantedModifiers` needed |
| Spellcasting (divine, prepared) | `ResourcePool` per slot level 0–9 on `resources.spell_slots_cleric_<n>`; domain spell slots are handled by C-13 domain features |

---

### C-04d — Base Class: Druid (`01_d20srd_core_classes.json`)

- [x] **C-04d** — Convert Druid (structure only — features in C-05d)

**Source file:** `d20srd/www.d20srd.org/srd/classes/druid.html`
**Context:** Read `ANNEXES.md` section A.8 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs)
- `classSkills` array
- `grantedModifiers`: hit die (d8, type `"base"`), skill points per level (4 + INT, type `"base"`)
- `grantedFeatures`: list specific druid weapon proficiencies (club, dagger, dart, quarterstaff, scimitar, sickle, shortspear, sling, spear), `proficiency_armor_light`, `proficiency_armor_medium`, `proficiency_shields_wooden`
  - `forbiddenTags`: `["alignment_non_neutral", "metal_armor", "metal_shield"]` — the metal armor/shield restriction is modelled via `forbiddenTags` (same field), per Annex A.8 and the `Feature` interface in `ARCHITECTURE.md`
- Tags: `["class", "base_class", "class_druid", "divine_caster", "prepared_caster"]`
- `recommendedAttributes`: WIS, CON

---

### C-05d — Base Class Features: Druid (`02_d20srd_core_class_features.json`)

- [x] **C-05d** — Convert Druid class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/druid.html`
**Context:** Read `ANNEXES.md` section A.8 only.
**Output:** Append Druid feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_druid.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Wild Shape | `activation` (standard action); `ResourcePool` `resources.wild_shape_uses` max starts at 1/day (level 5) scaling to unlimited (level 20); `setAbsolute` targeting form-relevant combat stats; available forms expand per level (Small/Medium beast → Large → Tiny → Huge → plant → elemental) |
| Animal Companion | `FeatureChoice` with `optionsQuery: "tag:animal_companion"` |
| Nature Sense | `grantedModifiers` +2 on Knowledge (nature) and Survival, type `"untyped"` |
| Woodland Stride | Conditional: move through natural difficult terrain at normal speed — description only |
| Trackless Step | Cannot be tracked in natural surroundings — description only |
| Resist Nature's Lure | `grantedModifiers` +4 saves vs. fey spell-like abilities, type `"untyped"` |
| Venom Immunity | Immunity to all poisons — `grantedFeatures` or tag-based flag |
| Spellcasting (divine, prepared) | `ResourcePool` per slot level 0–9 on `resources.spell_slots_druid_<n>` |
| A Thousand Faces / Timeless Body | Passive; description-only features |

---

### C-04e — Base Class: Fighter (`01_d20srd_core_classes.json`)

- [x] **C-04e** — Convert Fighter (structure only — features in C-05e)

**Source file:** `d20srd/www.d20srd.org/srd/classes/fighter.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs — bonus feats at levels 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20)
- `classSkills` array
- `grantedModifiers`: hit die (d10, type `"base"`), skill points per level (2 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_all_martial`, `proficiency_weapons_simple`, `proficiency_armor_all`, `proficiency_shields_all`, `proficiency_tower_shield`
- Tags: `["class", "base_class", "class_fighter"]`
- `recommendedAttributes`: STR, CON

---

### C-05e — Base Class Features: Fighter (`02_d20srd_core_class_features.json`)

- [x] **C-05e** — Convert Fighter class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/fighter.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append Fighter feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_fighter.levelProgression[*].grantedFeatures`.

The Fighter's only class features are bonus feats. Each bonus feat entry in `levelProgression` should reference the same `FeatureChoice` object (or a numbered variant per occurrence):

| Feature | Mechanic |
|---|---|
| Bonus Feat (level 1) | `FeatureChoice` with `choiceId: "fighter_bonus_feat_1"`, `optionsQuery: "tag:fighter_bonus_feat"`, `maxSelections: 1` |
| Bonus Feat (level 2, 4, 6 … 20) | Same pattern, increment `choiceId` suffix for each occurrence |

Each bonus feat choice is a separate feature entity so the engine can track which selections were made at which level.

---

### C-04f — Base Class: Monk (`01_d20srd_core_classes.json`)

- [x] **C-04f** — Convert Monk (structure only — features in C-05f)

**Source file:** `d20srd/www.d20srd.org/srd/classes/monk.html`
**Context:** Read `ANNEXES.md` section A.1.3 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs)
- `classSkills` array
- `grantedModifiers`: hit die (d8, type `"base"`), skill points per level (4 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_weapons_monk` (club, crossbow light/heavy, dagger, handaxe, javelin, kama, nunchaku, quarterstaff, sai, shuriken, siangham, sling), no armor or shield proficiency
- `forbiddenTags`: `["alignment_chaotic", "alignment_neutral_ethical"]`
- Tags: `["class", "base_class", "class_monk"]`
- `recommendedAttributes`: STR, DEX, WIS

---

### C-05f — Base Class Features: Monk (`02_d20srd_core_class_features.json`)

- [x] **C-05f** — Convert Monk class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/monk.html`
**Context:** Read `ANNEXES.md` section A.1.3 only.
**Output:** Append Monk feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_monk.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Unarmed Strike damage | `setAbsolute` on `combatStats.unarmed_damage` per tier: 1d6 (level 1) → 1d8 (level 7) → 1d10 (level 11) → 2d6 (level 15) → 2d8 (level 19); also grants the `"unarmed"` tag |
| AC Bonus | `grantedModifiers` value = `"@attributes.stat_wis.derivedModifier"`, type `"wisdom"`, with `conditionNode` requiring no armor tag, no shield tag, and no encumbrance |
| Flurry of Blows | Extra attack at −2/−2 penalty (levels 1–4), full BAB (level 5+), +1 extra attack (level 11+); model as `grantedModifiers` on `combatStats.extra_attacks` with appropriate penalty |
| Still Mind | `grantedModifiers` +2 saves vs. enchantments, type `"untyped"` |
| Slow Fall | Damage reduction when within arm's reach of a wall; scales per level — description + conditional modifier on fall damage |
| Ki Strike (magic/lawful/adamantine) | Grants tags to unarmed attacks unlocking DR bypass |
| Purity of Body | Immunity to natural diseases |
| Wholeness of Body | `activation` (swift); heals HP = 2 × monk level per day (`ResourcePool`) |
| Diamond Body | Immunity to all poisons |
| Abundant Step | `activation` (move); dimension door 1/day (`ResourcePool`) |
| Diamond Soul | `grantedModifiers` spell resistance = 10 + monk level on `combatStats.spell_resistance` |
| Quivering Palm | `activation` (standard); 1/week death effect (`ResourcePool`) |
| Empty Body | `activation`; etherealness 1 min/day (`ResourcePool`) |
| Perfect Self | Outsider type, DR 10/magic |

---

### C-04g — Base Class: Paladin (`01_d20srd_core_classes.json`)

- [x] **C-04g** — Convert Paladin (structure only — features in C-05g)

**Source file:** `d20srd/www.d20srd.org/srd/classes/paladin.html`
**Context:** Read `ANNEXES.md` section A.1.2 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs; spellcasting begins level 4)
- `classSkills` array
- `grantedModifiers`: hit die (d10, type `"base"`), skill points per level (2 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_all_martial`, `proficiency_weapons_simple`, `proficiency_armor_all`, `proficiency_shields_all`
- `forbiddenTags`: `["alignment_non_lawful_good"]`
- Tags: `["class", "base_class", "class_paladin", "divine_caster", "prepared_caster"]`
- `recommendedAttributes`: STR, CHA, CON

---

### C-05g — Base Class Features: Paladin (`02_d20srd_core_class_features.json`)

- [x] **C-05g** — Convert Paladin class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/paladin.html`
**Context:** Read `ANNEXES.md` section A.1.2 only.
**Output:** Append Paladin feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_paladin.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Detect Evil | At-will (move action); description-only |
| Smite Evil | `activation` (standard); `ResourcePool` `resources.smite_evil_uses` max = `"1 + floor((@classLevels.class_paladin - 1) / 5)"`; on hit: +CHA to attack roll, +class level to damage |
| Divine Grace | `grantedModifiers` CHA modifier to all saving throws, type `"untyped"` |
| Lay on Hands | `ResourcePool` `resources.lay_on_hands_hp` max = `"@classLevels.class_paladin * @attributes.stat_cha.derivedModifier"`; heals that many HP per day (free action on self, standard on others) |
| Aura of Courage | `grantedModifiers` +4 morale bonus vs. fear for self and allies within 10 ft |
| Divine Health | Immunity to all diseases |
| Turn Undead | Gained at level 4; same pattern as Cleric Turn Undead with CHA-based pool |
| Special Mount | `FeatureChoice` with `optionsQuery: "tag:paladin_mount"` |
| Remove Disease | Uses/week = `"floor((@classLevels.class_paladin - 3) / 3)"` (`ResourcePool`) |
| Spellcasting (divine, prepared) | Begins level 4; `ResourcePool` per slot level 1–4 on `resources.spell_slots_paladin_<n>` |
| Aura of Good | Passive aura tag; description only |

---

### C-04h — Base Class: Ranger (`01_d20srd_core_classes.json`)

- [x] **C-04h** — Convert Ranger (structure only — features in C-05h)

**Source file:** `d20srd/www.d20srd.org/srd/classes/ranger.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs; spellcasting begins level 4)
- `classSkills` array
- `grantedModifiers`: hit die (d8, type `"base"`), skill points per level (6 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_all_martial`, `proficiency_weapons_simple`, `proficiency_armor_light`, `proficiency_shields`
- Tags: `["class", "base_class", "class_ranger", "divine_caster", "prepared_caster"]`
- `recommendedAttributes`: STR or DEX, WIS

---

### C-05h — Base Class Features: Ranger (`02_d20srd_core_class_features.json`)

- [x] **C-05h** — Convert Ranger class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/ranger.html`
**Context:** Read `ANNEXES.md` sections A.1.1 and A.8 only.
**Output:** Append Ranger feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_ranger.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Favored Enemy | `FeatureChoice` at levels 1, 5, 10, 15, 20; each selection grants +2 (or +4/+6 for earlier choices) on Bluff, Listen, Sense Motive, Spot, and Survival checks AND attack/damage rolls vs. that creature type; model as `grantedModifiers` with `situationalContext` |
| Track | Grants the Track feat as `grantedFeatures` (references `feat_track`) |
| Wild Empathy | `grantedModifiers` bonus = class level + CHA modifier on `attributes.wild_empathy`; description: influence animal attitude |
| Combat Style (Two-Weapon Fighting or Archery) | `FeatureChoice` at level 2 selecting the path; grant the corresponding feat(s) at levels 2, 6, 11 without meeting prerequisites |
| Endurance | Grants Endurance feat as `grantedFeatures` (references `feat_endurance`) |
| Animal Companion | `FeatureChoice` with `optionsQuery: "tag:animal_companion"` (gained at level 4) |
| Evasion | Same pattern as Rogue Evasion |
| Camouflage | Can use Hide in natural terrain; description — tag flag |
| Hide in Plain Sight | Can hide in natural terrain while observed; description — tag flag |
| Spellcasting (divine, prepared) | Begins level 4; `ResourcePool` per slot level 1–4 on `resources.spell_slots_ranger_<n>` |

---

### C-04i — Base Class: Rogue (`01_d20srd_core_classes.json`)

- [x] **C-04i** — Convert Rogue (structure only — features in C-05i)

**Source file:** `d20srd/www.d20srd.org/srd/classes/rogue.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs)
- `classSkills` array (Rogues have the largest class skill list)
- `grantedModifiers`: hit die (d6, type `"base"`), skill points per level (8 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_weapons_simple`, `proficiency_hand_crossbow`, `proficiency_rapier`, `proficiency_sap`, `proficiency_shortbow`, `proficiency_short_sword`, `proficiency_armor_light`
- Tags: `["class", "base_class", "class_rogue"]`
- `recommendedAttributes`: DEX, INT

---

### C-05i — Base Class Features: Rogue (`02_d20srd_core_class_features.json`)

- [x] **C-05i** — Convert Rogue class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/rogue.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append Rogue feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_rogue.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Sneak Attack | `grantedModifiers` with formula value `"floor((@classLevels.class_rogue + 1) / 2)d6"` targeting `combatStats.sneak_attack_damage`; `situationalContext: "target_flat_footed_or_flanked"` |
| Trapfinding | Allows Search checks for DC 20+ traps and use of Disable Device on magic traps; tag flag |
| Evasion | On successful Reflex save vs. area effect: no damage (normally half); `conditionNode` requiring light or no armor |
| Uncanny Dodge | Retains DEX bonus to AC when flat-footed; tag flag |
| Improved Uncanny Dodge | Cannot be flanked except by a rogue 4+ levels higher; tag flag |
| Trap Sense | `grantedModifiers` type `"untyped"` to Reflex saves and AC vs. traps; increments at levels 3, 6, 9, 12, 15, 18 |
| Special Ability | `FeatureChoice` at levels 10, 13, 16, 19; `optionsQuery: "tag:rogue_special_ability"`; each choice is a separate feature entity with unique `choiceId` |

---

### C-04j — Base Class: Sorcerer (`01_d20srd_core_classes.json`)

- [x] **C-04j** — Convert Sorcerer (structure only — features in C-05j)

**Source file:** `d20srd/www.d20srd.org/srd/classes/sorcererWizard.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs)
- `classSkills` array
- `grantedModifiers`: hit die (d4, type `"base"`), skill points per level (2 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_weapons_simple`
- Tags: `["class", "base_class", "class_sorcerer", "arcane_caster", "spontaneous_caster"]`
- `recommendedAttributes`: CHA, CON

---

### C-05j — Base Class Features: Sorcerer (`02_d20srd_core_class_features.json`)

- [x] **C-05j** — Convert Sorcerer class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/sorcererWizard.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append Sorcerer feature entries to `02_d20srd_core_class_features.json`.

Convert every feature ID in `class_sorcerer.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Spellcasting (arcane, spontaneous) | `ResourcePool` per slot level 0–9 on `resources.spell_slots_sorcerer_<n>`; also model the spells-known table as a separate `ResourcePool` or configuration note per level |
| Familiar | `FeatureChoice` with `optionsQuery: "tag:familiar_creature"`; same pattern as Wizard Familiar |

---

### C-04k — Base Class: Wizard (`01_d20srd_core_classes.json`)

- [x] **C-04k** — Convert Wizard (structure only — features in C-05k)

**Source file:** `d20srd/www.d20srd.org/srd/classes/sorcererWizard.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append one entry to `01_d20srd_core_classes.json`. This is the final (11th) entry — run full-file validation after writing.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; feature IDs)
- `classSkills` array
- `grantedModifiers`: hit die (d4, type `"base"`), skill points per level (2 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_weapons_simple`, `proficiency_club`, `proficiency_dagger`, `proficiency_heavy_crossbow`, `proficiency_light_crossbow`, `proficiency_quarterstaff`
- Tags: `["class", "base_class", "class_wizard", "arcane_caster", "prepared_caster"]`
- `choices`: `{ "choiceId": "arcane_school", "optionsQuery": "tag:arcane_school", "maxSelections": 1 }` (optional; choosing a school grants bonus spells and a prohibited school)
- `recommendedAttributes`: INT, CON

---

### C-05k — Base Class Features: Wizard (`02_d20srd_core_class_features.json`)

- [x] **C-05k** — Convert Wizard class features

**Source file:** `d20srd/www.d20srd.org/srd/classes/sorcererWizard.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Append Wizard feature entries to `02_d20srd_core_class_features.json`. This is the final (11th) class — run full-file validation after writing.

Convert every feature ID in `class_wizard.levelProgression[*].grantedFeatures`.

Key mechanics:

| Feature | Mechanic |
|---|---|
| Spellcasting (arcane, prepared) | `ResourcePool` per slot level 0–9 on `resources.spell_slots_wizard_<n>`; INT modifier adds bonus slots per level (per the bonus spells table) |
| Scribe Scroll | Bonus feat granted at level 1 as `grantedFeatures` (references `feat_scribe_scroll`) |
| Bonus Feat (metamagic/item creation) | `FeatureChoice` at levels 5, 10, 15, 20; `optionsQuery: "tag:metamagic OR tag:item_creation"`; unique `choiceId` per occurrence |
| Familiar | `FeatureChoice` with `optionsQuery: "tag:familiar_creature"` |
| Spell Mastery | `FeatureChoice` indicating INT-modifier spells that can be prepared without a spellbook |

---

### C-06 — Feats (`03_d20srd_core_feats.json`) — SPLIT INTO C-06a … C-06f

> **Shared output file:** `static/rules/00_d20srd_core/03_d20srd_core_feats.json`
> **Source file (all sub-tasks):** `d20srd/www.d20srd.org/srd/feats.html`
> **Context (all sub-tasks):** Read `ANNEXES.md` sections A.4.1–4.6 before starting.
> **Output file:** C-06a creates the file as `[…]`; C-06b–C-06f append to it.
> **Full-file validation** required only after C-06f (the final sub-task).

**For each feat, capture:**
- `id`: `feat_<camelCase_id_from_html_anchor>` in kebab-case (e.g. `feat_power_attack`)
- `category`: `"feat"`
- `ruleSource`: `"srd_core"`
- `prerequisitesNode` — convert every prerequisite using the prerequisites table in this document
- `tags`: always include `"feat"` + `"general"` (or `"metamagic"` / `"item_creation"` / `"special"`); add `"fighter_bonus_feat"` where applicable (see Fighter Bonus Feats list in source HTML)
- `grantedModifiers` for mechanical effects
- `choices` for feats requiring a selection (Weapon Focus, Skill Focus, Exotic Weapon Proficiency, Spell Focus, etc.)

**Key mechanics:**
- Dodge (+1 AC vs. one designated opponent): `situationalContext: "vs_designated_target"`, type `"dodge"`
- Alertness (+2 Listen/Spot): `grantedModifiers` with type `"untyped"`
- Toughness (+3 HP): modifier targeting `combatStats.hp_bonus`, type `"untyped"`, value `3`
- **Metamagic feats:** Model the slot cost increase as a modifier targeting `combatStats.metamagic_level_cost` with `situationalContext` identifying the metamagic type (e.g., `"metamagic_empower"`, `"metamagic_maximize"`).
- **Item creation feats:** Description + `grantedFeatures: ["feat_item_creation_<name>"]`; no mechanical modifiers needed — the character creation UI checks for the feat tag.

**Feats with choices:**
```json
{
  "id": "feat_weapon_focus",
  "choices": [{
    "choiceId": "weapon_choice",
    "label": { "en": "Choose a weapon", "fr": "Choisissez une arme" },
    "optionsQuery": "tag:weapon",
    "maxSelections": 1
  }],
  "grantedModifiers": [{
    "id": "feat_weapon_focus_attack",
    "sourceId": "feat_weapon_focus",
    "sourceName": { "en": "Weapon Focus", "fr": "Concentration sur une arme" },
    "targetId": "combatStats.attack_bonus",
    "value": 1,
    "type": "untyped",
    "conditionNode": {
      "logic": "CONDITION",
      "targetPath": "@equippedWeaponTags",
      "operator": "includes",
      "value": "@selection.weapon_choice"
    }
  }]
}
```

---

### C-06a — Feats batch 1/6: Acrobatic → Diehard (24 feats)

- [x] **C-06a** — Convert feats: Acrobatic → Diehard

**Feats to convert (24 total):**
Acrobatic, Agile, Alertness, Animal Affinity, Armor Proficiency (Heavy), Armor Proficiency (Light), Armor Proficiency (Medium), Athletic, Augment Summoning, Blind-Fight, Brew Potion, Cleave, Combat Casting, Combat Expertise, Combat Reflexes, Craft Magic Arms and Armor, Craft Rod, Craft Staff, Craft Wand, Craft Wondrous Item, Deceitful, Deflect Arrows, Deft Hands, Diehard

**Source location:** `feats.html` — from `<h3 id="acrobatic">` through `<h3 id="diehard">` (inclusive). Use the HTML anchors as the authoritative boundary; line numbers are approximate and may shift.

---

### C-06b — Feats batch 2/6: Diligent → Greater Weapon Specialization (18 feats)

- [x] **C-06b** — Convert feats: Diligent → Greater Weapon Specialization

**Feats to convert (18 total):**
Diligent, Dodge, Empower Spell, Endurance, Enlarge Spell, Eschew Materials, Exotic Weapon Proficiency, Extend Spell, Extra Turning, Far Shot, Forge Ring, Great Cleave, Great Fortitude, Greater Spell Focus, Greater Spell Penetration, Greater Two-Weapon Fighting, Greater Weapon Focus, Greater Weapon Specialization

**Source location:** `feats.html` — from `<h3 id="diligent">` through `<h3 id="greaterWeaponSpecialization">` (inclusive).

---

### C-06c — Feats batch 3/6: Heighten Spell → Improved Unarmed Strike (17 feats)

- [x] **C-06c** — Convert feats: Heighten Spell → Improved Unarmed Strike

**Feats to convert (17 total):**
Heighten Spell, Improved Bull Rush, Improved Counterspell, Improved Critical, Improved Disarm, Improved Familiar, Improved Feint, Improved Grapple, Improved Initiative, Improved Overrun, Improved Precise Shot, Improved Shield Bash, Improved Sunder, Improved Trip, Improved Turning, Improved Two-Weapon Fighting, Improved Unarmed Strike

**Source location:** `feats.html` — from `<h3 id="heightenSpell">` through `<h3 id="improvedUnarmedStrike">` (inclusive).

---

### C-06d — Feats batch 4/6: Investigator → Precise Shot (18 feats)

- [x] **C-06d** — Convert feats: Investigator → Precise Shot

**Feats to convert (18 total):**
Investigator, Iron Will, Leadership, Lightning Reflexes, Magical Aptitude, Manyshot, Martial Weapon Proficiency, Maximize Spell, Mobility, Mounted Archery, Mounted Combat, Natural Spell, Negotiator, Nimble Fingers, Persuasive, Point Blank Shot, Power Attack, Precise Shot

**Source location:** `feats.html` — from `<h3 id="investigator">` through `<h3 id="preciseShot">` (inclusive).

---

### C-06e — Feats batch 5/6: Quick Draw → Spell Penetration (17 feats)

- [x] **C-06e** — Convert feats: Quick Draw → Spell Penetration

**Feats to convert (17 total):**
Quick Draw, Quicken Spell, Rapid Reload, Rapid Shot, Ride-By Attack, Run, Scribe Scroll, Self-Sufficient, Shield Proficiency, Shot on the Run, Silent Spell, Simple Weapon Proficiency, Skill Focus, Snatch Arrows, Spell Focus, Spell Mastery, Spell Penetration

**Source location:** `feats.html` — from `<h3 id="quickDraw">` through `<h3 id="spellPenetration">` (inclusive).

---

### C-06f — Feats batch 6/6: Spirited Charge → Widen Spell (16 feats) + full validation

- [x] **C-06f** — Convert feats: Spirited Charge → Widen Spell — **run full-file validation after writing**

**Feats to convert (16 total):**
Spirited Charge, Spring Attack, Stealthy, Still Spell, Stunning Fist, Toughness, Tower Shield Proficiency, Track, Trample, Two-Weapon Defense, Two-Weapon Fighting, Weapon Finesse, Weapon Focus, Weapon Specialization, Whirlwind Attack, Widen Spell

**Source location:** `feats.html` — from `<h3 id="spiritedCharge">` through `<h3 id="widenSpell">` (end of feat descriptions).

---

### C-07 — Weapons (`06_d20srd_core_equipment_weapons.json`)

- [x] **C-07** — Convert all weapons (simple, martial, exotic)

**Source files:** `d20srd/www.d20srd.org/srd/equipment/weapons.html`
**Context:** Read `ANNEXES.md` section A.5 (item examples) before starting.

**For each weapon:**
```json
{
  "id": "item_longsword",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Longsword", "fr": "Épée longue" },
  "description": { "en": "...", "fr": "..." },
  "tags": ["item", "weapon", "weapon_martial", "weapon_melee", "item_longsword"],
  "equipmentSlot": "main_hand",
  "weightLbs": 4,
  "costGp": 15,
  "hardness": 10,
  "hpMax": 5,
  "grantedModifiers": [],
  "grantedFeatures": [],
  "weaponData": {
    "wieldCategory": "one_handed",
    "damageDice": "1d8",
    "damageType": ["slashing"],
    "critRange": "19-20",
    "critMultiplier": 2,
    "reachFt": 5
  }
}
```

- Two-handed weapons: `"equipmentSlot": "two_hands"`, `"wieldCategory": "two_handed"`
- Ranged weapons: add `"rangeIncrementFt": <value>` and tag `"weapon_ranged"`
- Proficiency: exactly one of `"weapon_simple"`, `"weapon_martial"`, `"weapon_exotic"` per weapon
- Double weapons: `"wieldCategory": "double"`, `"equipmentSlot": "two_hands"`
- Light weapons: add tag `"weapon_light"` (relevant for Two-Weapon Fighting penalties)

---

### C-08 — Armor & Shields (`07_d20srd_core_equipment_armor.json`)

- [x] **C-08** — Convert all armors and shields

**Source files:** `d20srd/www.d20srd.org/srd/equipment/armor.html`

**For each armor:**
```json
{
  "id": "item_chainmail",
  "category": "item",
  "ruleSource": "srd_core",
  "label": { "en": "Chainmail", "fr": "Cotte de mailles" },
  "description": { "en": "...", "fr": "..." },
  "tags": ["item", "armor", "armor_medium", "metal_armor", "wearing_armor"],
  "equipmentSlot": "body",
  "weightLbs": 40,
  "costGp": 150,
  "hardness": 15,
  "hpMax": 30,
  "grantedModifiers": [
    {
      "id": "item_chainmail_ac",
      "sourceId": "item_chainmail",
      "sourceName": { "en": "Chainmail", "fr": "Cotte de mailles" },
      "targetId": "combatStats.ac_normal",
      "value": 5,
      "type": "armor"
    },
    {
      "id": "item_chainmail_acp",
      "sourceId": "item_chainmail",
      "sourceName": { "en": "Chainmail", "fr": "Cotte de mailles" },
      "targetId": "combatStats.armor_check_penalty",
      "value": -5,
      "type": "base"
    }
  ],
  "grantedFeatures": [],
  "armorData": {
    "armorBonus": 5,
    "maxDex": 2,
    "armorCheckPenalty": -5,
    "arcaneSpellFailure": 30
  }
}
```

**Tag rules:**
- Light armor: `"armor_light"` — add `"metal_armor"` only if metal (chain shirt yes, padded/leather no)
- Medium armor: `"armor_medium"` — add `"metal_armor"` if metal (chainmail, breastplate yes)
- Heavy armor: `"armor_heavy"` + `"metal_armor"` (all heavy armors are metal)
- All worn armors: `"wearing_armor"` (used by Monk AC Bonus condition)
- All shields except tower: `"carrying_shield"` (used by Monk AC Bonus condition)
- Tower shield: `"carrying_shield"`, `"tower_shield"`

---

### C-09 — Goods & Services (`08_d20srd_core_equipment_goods.json`)

- [x] **C-09** — Convert adventuring gear, tools, and general goods

**Source files:** `d20srd/www.d20srd.org/srd/equipment/goodsAndServices.html`

Focus on items with mechanical relevance (thieves' tools → +2 Disable Device, masterwork thieves' tools → +2 more, healer's kit → +2 Heal, spyglass → +2 Spot at range). Simple items (rope, torches, rations) only need `id`, `category`, `label.en`, `label.fr`, `weightLbs`, `costGp`, `grantedModifiers: []`, `grantedFeatures: []`.

---

### C-10 — Spells (`05_d20srd_core_spells.json`)

**Source files:** `d20srd/www.d20srd.org/srd/spells/` — one `.html` file per spell, named in camelCase (e.g., `fireball.html`, `acidArrow.html`). List the directory to enumerate all files; filter by alphabetical range for each sub-task.
**Context:** Read `ANNEXES.md` sections A.6.1–6.5 before the first sub-task.

**Multi-batch task** — all sub-tasks append to `05_d20srd_core_spells.json`. See MULTI-BATCH FILE HANDLING.

**For each spell:**
```json
{
  "id": "spell_fireball",
  "category": "magic",
  "ruleSource": "srd_core",
  "magicType": "arcane",
  "label": { "en": "Fireball", "fr": "Boule de feu" },
  "description": { "en": "...", "fr": "..." },
  "tags": ["spell", "spell_evocation", "fire"],
  "school": "evocation",
  "subSchool": null,
  "descriptors": ["fire"],
  "spellLists": { "list_sorcerer": 3, "list_wizard": 3 },
  "resistanceType": "spell_resistance",
  "components": ["V", "S", "M"],
  "range": "long",
  "targetArea": { "en": "20-ft.-radius spread", "fr": "Zone d'un rayon de 6 m" },
  "duration": "instantaneous",
  "savingThrow": "ref_half",
  "grantedModifiers": [],
  "grantedFeatures": []
}
```

**Spell list IDs:** `list_wizard`, `list_sorcerer`, `list_cleric`, `list_druid`, `list_paladin`, `list_ranger`, `list_bard`

**`savingThrow` values:** `"fort_half"`, `"ref_half"`, `"ref_negates"`, `"will_negates"`, `"will_disbelieves"`, `"fort_negates"`, `"none"`, or a plain descriptive string for complex cases.

**Spells with persistent mechanical effects** (e.g., Bull's Strength +4 STR, Mage Armor +4 AC): add `grantedModifiers` with the appropriate type and `conditionNode` that checks the spell is active. Area damage spells describe their effect in `description` only — no `grantedModifiers`.

- [x] **C-10a** — Spells: Acid Arrow → Antipathy (files `acidArrow.html` through `antipathy.html`)
- [x] **C-10b** — Spells: Antiplant Shell → Blade Barrier (files `antiplantShell.html` through `bladeBarrier.html`)
- [x] **C-10c** — Spells: Blasphemy → Chain Lightning (files `blasphemy.html` through `chainLightning.html`)
- [x] **C-10d** — Spells: Changestaff → Commune (files `changestaff.html` through `commune.html`)
- [x] **C-10e** — Spells: Commune with Nature → Creeping Doom (files `communeWithNature.html` through `creepingDoom.html`)
- [x] **C-10f** — Spells: Crushing Despair → Death Ward (files `crushingDespair.html` through `deathWard.html`)
- [x] **C-10g** — Spells: Deathwatch → Detect Undead (files `deathwatch.html` through `detectUndead.html`)
- [x] **C-10h** — Spells: Dictum → Disrupting Weapon (files `dictum.html` through `disruptingWeapon.html`)
- [x] **C-10i** — Spells: Divination → Entropic Shield (files `divination.html` through `entropicShield.html`)
- [x] **C-10j** — Spells: Erase → Fire Trap (files `erase.html` through `fireTrap.html`)
- [x] **C-10k** — Spells: Fireball → Gaseous Form (files `fireball.html` through `gaseousForm.html`)
- [x] **C-10l** — Spells: Gate → Guidance (files `gate.html` through `guidance.html`)
- [x] **C-10m** — Spells: Gust of Wind → Hold Monster (Mass) (files `gustOfWind.html` through `holdMonsterMass.html`)
- [x] **C-10n** — Spells: Hold Person → Inflict Critical Wounds (Mass) (files `holdPerson.html` through `inflictCriticalWoundsMass.html`)
- [x] **C-10o** — Spells: Inflict Light Wounds → Jump (files `inflictLightWounds.html` through `jump.html`)
- [x] **C-10p** — Spells: Keen Edge → Mage's Lucubration (files `keenEdge.html` through `magesLucubration.html`)
- [x] **C-10q** — Spells: Mage's Magnificent Mansion → Make Whole (files `magesMagnificentMansion.html` through `makeWhole.html`)
- [x] **C-10r** — Spells: Mark of Justice → Mount (files `markOfJustice.html` through `mount.html`)
- [x] **C-10s** — Spells: Move Earth → Phase Door (files `moveEarth.html` through `phaseDoor.html`)
- [x] **C-10t** — Spells: Planar Ally → Prismatic Wall (files `planarAlly.html` through `prismaticWall.html`)
- [x] **C-10u** — Spells: Produce Flame → Ray of Exhaustion (files `produceFlame.html` through `rayOfExhaustion.html`)
- [x] **C-10v** — Spells: Ray of Frost → Resistance (files `rayOfFrost.html` through `resistance.html`)
- [x] **C-10w** — Spells: Restoration → Secure Shelter (files `restoration.html` through `secureShelter.html`)
- [x] **C-10x** — Spells: See Invisibility → Shocking Grasp (files `seeInvisibility.html` through `shockingGrasp.html`)
- [x] **C-10y** — Spells: Shout → Spectral Hand (files `shout.html` through `spectralHand.html`)
- [x] **C-10z** — Spells: Spell Immunity → Summon Instrument (files `spellImmunity.html` through `summonInstrument.html`)
- [x] **C-10aa** — Spells: Summon Monster I → Sunbeam (files `summonMonsterI.html` through `sunbeam.html`)
- [x] **C-10ab** — Spells: Sunburst → Time Stop (files `sunburst.html` through `timeStop.html`)
- [x] **C-10ac** — Spells: Tiny Hut → Unholy Blight (files `tinyHut.html` through `unholyBlight.html`)
- [x] **C-10ad** — Spells: Unseen Servant → Weird (files `unseenServant.html` through `weird.html`)
- [x] **C-10ae** — Spells: Whirlwind → Zone of Truth (files `whirlwind.html` through `zoneOfTruth.html`) — **run full-file validation after writing**

---

### C-11 — Prestige Classes (`10_d20srd_core_prestige_classes.json`) — SPLIT INTO C-11a … C-11e
### C-12 — Prestige Class Features (`11_d20srd_core_prestige_class_features.json`) — SPLIT INTO C-12a … C-12e

> **Shared output files:**
> - Structure: `static/rules/00_d20srd_core/10_d20srd_core_prestige_classes.json`
> - Features: `static/rules/00_d20srd_core/11_d20srd_core_prestige_class_features.json`
>
> **Context (all sub-tasks):** Read `ANNEXES.md` section A.2.1 before starting.
> **Output files:** C-11a/C-12a create their respective files as `[…]`; subsequent batches append.
> **Full-file validation** required only after C-11e and C-12e (the final sub-tasks).
> **Execute interleaved:** C-11a → C-12a → C-11b → C-12b → … (same pattern as C-04x/C-05x).
> **Note:** The SRD mirror also contains `giftedOfTheTraveler.html` and `shadowcrafter.html` in the `prestigeClasses/` directory. These are **not** part of the standard d20 SRD — they are supplemental/site-specific content. Do **not** convert them in C-11x. They are intentionally excluded.

**General rules for all prestige class batches:**
- Same format as C-04/C-05 but with `"prestige_class"` in `tags` instead of `"base_class"`.
- Each class has a **10-level** `levelProgression`.
- Each class requires a `prerequisitesNode` at the class level (entry requirements), using the prerequisites table in this document.
- **Spellcasting advancement** (Mystic Theurge, Archmage, Eldritch Knight, Arcane Trickster, Loremaster, Thaumaturgist, Hierophant): model as modifiers incrementing the **existing** base class spell slot `ResourcePool` (e.g., add to `resources.spell_slots_wizard_3`). Do not create new pools.
- **Dragon Disciple ability score increases**: `type: "untyped"` on `attributes.stat_str`, `stat_con`, `stat_int` at the specified levels.
- **Blackguard**: Paladin-mirror abilities — use same pool/modifier patterns as C-05g.

---

### C-11a / C-12a — Prestige Classes batch 1/5: Arcane Archer, Arcane Trickster, Archmage

- [x] **C-11a** — Convert structure: Arcane Archer, Arcane Trickster, Archmage (creates `10_d20srd_core_prestige_classes.json`)

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/arcaneArcher.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/arcaneTrickster.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/archmage.html`

---

- [x] **C-12a** — Convert features for: Arcane Archer, Arcane Trickster, Archmage (creates `11_d20srd_core_prestige_class_features.json`)

**Source files:** Same as C-11a.

---

### C-11b / C-12b — Prestige Classes batch 2/5: Assassin, Blackguard, Dragon Disciple

- [x] **C-11b** — Convert structure: Assassin, Blackguard, Dragon Disciple

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/assassin.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/blackguard.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/dragonDisciple.html`

---

- [x] **C-12b** — Convert features for: Assassin, Blackguard, Dragon Disciple

**Source files:** Same as C-11b.

---

### C-11c / C-12c — Prestige Classes batch 3/5: Duelist, Dwarven Defender, Eldritch Knight

- [ ] **C-11c** — Convert structure: Duelist, Dwarven Defender, Eldritch Knight

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/duelist.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/dwarvenDefender.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/eldritchKnight.html`

---

- [ ] **C-12c** — Convert features for: Duelist, Dwarven Defender, Eldritch Knight

**Source files:** Same as C-11c.

---

### C-11d / C-12d — Prestige Classes batch 4/5: Hierophant, Horizon Walker, Loremaster

- [ ] **C-11d** — Convert structure: Hierophant, Horizon Walker, Loremaster

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/hierophant.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/horizonWalker.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/loremaster.html`

---

- [ ] **C-12d** — Convert features for: Hierophant, Horizon Walker, Loremaster

**Source files:** Same as C-11d.

---

### C-11e / C-12e — Prestige Classes batch 5/5: Mystic Theurge, Shadowdancer, Thaumaturgist + full validation

- [ ] **C-11e** — Convert structure: Mystic Theurge, Shadowdancer, Thaumaturgist — **run full-file validation after writing**

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/mysticTheurge.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/shadowdancer.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/thaumaturgist.html`

---

- [ ] **C-12e** — Convert features for: Mystic Theurge, Shadowdancer, Thaumaturgist — **run full-file validation after writing**

**Source files:** Same as C-11e.

---

### C-13 — Cleric Domains (`13_d20srd_core_domains.json`)

- [ ] **C-13** — Convert all 22 core cleric domains

**Source files:** `d20srd/www.d20srd.org/srd/divine/domains.html`

**Domains:** Air, Animal, Chaos, Death, Destruction, Earth, Evil, Fire, Good, Healing, Knowledge, Law, Luck, Magic, Plant, Protection, Strength, Sun, Travel, Trickery, War, Water

**For each domain:**
- Tags: `["domain", "domain_<name>"]`
- Domain granted power (1/day ability) → Feature with `activation` block and dedicated `ResourcePool`
- Domain spell list (levels 1–9) → `grantedFeatures` referencing spell IDs from C-10
- `classSkills` granted by the domain (e.g., Knowledge domain grants all Knowledge skills as class skills)

---

### C-14 — Magic Items (`12_d20srd_core_magic_items.json`)

**Source files:** `d20srd/www.d20srd.org/srd/magicItems/`
**Context:** Read `ANNEXES.md` sections A.5.1–5.9 and A.9 before the first sub-task.

**Multi-batch task** — all sub-tasks append to `12_d20srd_core_magic_items.json`. See MULTI-BATCH FILE HANDLING.

**For each magic item:**
- Permanent bonuses: `type` = `"enhancement"` (attack/damage/armor), `"deflection"` (AC), `"natural_armor"`, `"resistance"` (saves), `"luck"`, `"competence"`, `"sacred"`, `"profane"` — use the correct type for stacking rules
- Activated abilities: `activation` block with `ResourcePool` for charges/uses
- Cursed items: `forbiddenTags` preventing removal, or `conditionNode` on the removal action

- [ ] **C-14a** — Rings (`rings.html`) and Potions & Oils (`potionsAndOils.html`)
- [ ] **C-14b** — Magic Armor (`magicArmor.html`) and Magic Weapons (`magicWeapons.html`)
- [ ] **C-14c** — Wondrous Items A–M (`wondrousItems.html`, first half through letter M)
- [ ] **C-14d** — Wondrous Items N–Z (`wondrousItems.html`, second half from letter N)
- [ ] **C-14e** — Rods (`rods.html`), Staves (`staffs.html`), Wands (`wands.html`), Scrolls (`scrolls.html`), Artifacts (`artifacts.html`), Cursed Items (`cursedItems.html`), Intelligent Items (`intelligentItems.html`) — **run full-file validation after writing**

> **Artifacts** (`artifacts.html`): Convert minor and major artifacts. Use `"category": "item"` with `"equipmentSlot": "none"` for non-wearable artifacts. See `ANNEXES.md` section A.9 for the Sphere of Annihilation example.
> **Cursed items** (`cursedItems.html`): Add `forbiddenTags` (e.g., `["cursed_identified"]`) to prevent removal and model curse effects as permanent `grantedModifiers`.
> **Intelligent items** (`intelligentItems.html`): Model as standard items with additional `grantedModifiers` for the item's powers and a `choices` entry for the item's alignment/purpose if variable.

---

### C-15 — Psionic System (`static/rules/01_d20srd_psionics/`)

All C-15 tasks use `"ruleSource": "srd_psionics"`.

- [ ] **C-15a** — Psionic classes → `00_d20srd_psionics_classes.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/classes/` — all `.html` files
  **Classes:** Psion (`psion.html`), Psychic Warrior (`psychicWarrior.html`), Soulknife (`soulknife.html`), Wilder (`wilder.html`)
  Same format as C-04. Key mechanic: Power Points pool as `ResourcePool` on `resources.power_points`.

- [ ] **C-15b** — Psionic class features → `01_d20srd_psionics_class_features.json`

  **Source:** Same as C-15a.
  **Context:** Read `ANNEXES.md` section A.7 before starting.
  Key mechanics: Power Point pool, Discipline choices as `FeatureChoice` with `optionsQuery: "tag:psionic_discipline"`, Psychic Strike dynamic formula.

- [ ] **C-15c** — Psionic powers A–M → `02_d20srd_psionics_powers.json` (part 1)

  **Source:** `d20srd/www.d20srd.org/srd/psionic/powers/` — all files whose name starts with a–m alphabetically
  **Context:** Read `ANNEXES.md` section A.12 before starting.
  Multi-batch: C-15c creates the file; C-15d appends.
  Powers use `MagicFeature` with `magicType: "psionic"` and `augmentations[]`. Each augmentation: `costIncrement`, `effectDescription.en`, `effectDescription.fr`, `isRepeatable`.

- [ ] **C-15d** — Psionic powers N–Z → `02_d20srd_psionics_powers.json` (part 2)

  **Source:** `d20srd/www.d20srd.org/srd/psionic/powers/` — all files whose name starts with n–z alphabetically

- [ ] **C-15e** — Psionic feats → `03_d20srd_psionics_feats.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/psionicFeats.html`
  Same format as C-06. Include `"psionic"` in tags. Metapsionic feats: add `"metapsionic"` tag.

- [ ] **C-15f** — Psionic races → `04_d20srd_psionics_races.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/psionicRaces.html`
  **Context:** Read `ANNEXES.md` section A.3.4 before starting.
  Same format as C-03. Psionic races often grant a Power Point pool and a set of known powers at level 1.

- [ ] **C-15g** — Psionic skills → append to `04_d20srd_core_skills_config.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/skills/` — all 6 files:
  `autohypnosis.html`, `concentration.html` (psionic variant), `knowledgePsionics.html`, `psicraft.html`, `usePsionicDevice.html`, `overview.html`
  Same format as C-02 (append new skill entries to the existing `config_skill_definitions` table).
  Note: `concentration.html` is already covered by C-02 (core version); only add psionic-specific notes in the description, do not duplicate the skill entry.

- [ ] **C-15h** — Psionic prestige classes → `05_d20srd_psionics_prestige_classes.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/prestigeClasses/` — all 9 files:
  `cerebremancer.html`, `elocater.html`, `metamind.html`, `psionUncarnate.html`, `psionicFist.html`, `pyrokineticist.html`, `slayer.html`, `thrallherd.html`, `warMind.html`
  Same format as C-11 (prestige class structure). Each has a 10-level `levelProgression`.

- [ ] **C-15i** — Psionic prestige class features → `06_d20srd_psionics_prestige_class_features.json`

  **Source:** Same as C-15h.
  Same format as C-12 (prestige class features).

- [ ] **C-15j** — Psionic items → `07_d20srd_psionics_items.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/items/` — all item files (exclude `basics.html`, `creatingPsionicItems.html` which are rules text):
  `armorAndShields.html`, `cognizanceCrystals.html`, `cursedItems.html`, `dorjes.html`, `powerStones.html`, `psicrowns.html`, `psionicArtifacts.html`, `psionicItems.html`, `psionicTattoos.html`, `specialMaterials.html`, `universalItems.html`, `weapons.html`
  Same format as C-14. Use `"ruleSource": "srd_psionics"`.

- [ ] **C-15k** — Psionic spells (arcane/divine) → append to `05_d20srd_core_spells.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/spells/` — all 9 files:
  `brainSpider.html`, `dweomerOfTransference.html`, `glossolalia.html`, `mentalPinnacle.html`, `probeThoughts.html`, `psychicTurmoil.html`, `psychicTurmoilGreater.html`, `telepathicBondLesser.html`
  (Exclude `overview.html` — rules text only.)
  These are arcane/divine spells that interact with psionics. Use `"ruleSource": "srd_core"` (they appear on standard spell lists). Append to the core spells file.

---

### C-16 — NPC Classes (`14_d20srd_core_npc_classes.json`)

- [ ] **C-16** — Convert the 5 NPC classes

**Source files:** `d20srd/www.d20srd.org/srd/npcClasses/` — all 5 files:
`adept.html`, `aristocrat.html`, `commoner.html`, `expert.html`, `warrior.html`

Same format as C-04. NPC classes have 20-level `levelProgression`. Key differences:
- Tags: `["class", "npc_class", "class_<name>"]` (not `"base_class"`)
- Adept casts spells (divine, prepared); model spell slots per the Adept table.
- Expert: bonus to any 10 class skills of the player's choice — model as `FeatureChoice` at level 1.
- No `ruleSource` difference — still `"srd_core"`.

---

### C-17 — Special Materials (`15_d20srd_core_special_materials.json`)

- [ ] **C-17** — Convert special materials (adamantine, cold iron, darkwood, mithral, etc.)

**Source files:** `d20srd/www.d20srd.org/srd/specialMaterials.html`

Each material is a Feature of `category: "item"` or `category: "condition"` that modifies weapon/armor stats when applied:
- Tags: `["special_material", "special_material_<name>"]`
- `grantedModifiers`: hardness bonus, HP bonus, DR bypass tag grant, arcane spell failure reduction, etc.
- Referenced by weapon/armor entries via `grantedFeatures: ["special_material_adamantine"]`
- Weapons of cold iron / silver: add tags `"cold_iron"` / `"silver"` for DR bypass checks.

---

## RECOMMENDED EXECUTION ORDER

```
C-01 → C-02 → C-03
→ C-04a → C-05a → C-04b → C-05b → C-04c → C-05c → C-04d → C-05d
→ C-04e → C-05e → C-04f → C-05f → C-04g → C-05g → C-04h → C-05h
→ C-04i → C-05i → C-04j → C-05j → C-04k → C-05k
→ C-06a → C-06b → C-06c → C-06d → C-06e → C-06f
→ C-07 → C-08 → C-09 → C-17
→ C-10a → C-10b → C-10c → C-10d → C-10e → C-10f → C-10g → C-10h
→ C-10i → C-10j → C-10k → C-10l → C-10m → C-10n → C-10o → C-10p
→ C-10q → C-10r → C-10s → C-10t → C-10u → C-10v → C-10w → C-10x
→ C-10y → C-10z → C-10aa → C-10ab → C-10ac → C-10ad → C-10ae
→ C-11a → C-12a → C-11b → C-12b → C-11c → C-12c
→ C-11d → C-12d → C-11e → C-12e
→ C-13 → C-16
→ C-14a → C-14b → C-14c → C-14d → C-14e
→ C-15a → C-15b → C-15c → C-15d → C-15e → C-15f → C-15g
→ C-15h → C-15i → C-15j → C-15k
```

**Rationale:**
- **C-01/C-02 first:** subsequent files reference skill IDs and config tables.
- **C-03 before C-04:** races reference skills from C-02.
- **C-04x/C-05x interleaved per class:** each C-05x can reference the feature IDs just written by its paired C-04x, minimizing cross-task lookups and reducing per-task context load.
- **C-06a–C-06f after C-05k:** feats reference class feature tags that are now fully defined. Alphabetical batches of ~17–24 feats; C-06a creates the file, C-06f validates.
- **C-07–C-09 before spells:** weapon and armor tags are referenced in spell condition nodes.
- **C-17 (special materials) after C-07–C-09:** materials modify weapon/armor entries; easier to reference after those are complete.
- **C-10a–C-10ae:** 610 individual HTML files spread across 31 batches of 20 (last batch has 10), alphabetically by filename. High volume but architecturally independent.
- **C-11x/C-12x interleaved per batch:** same pattern as C-04x/C-05x — structure first, features immediately after for each group of 3 classes. C-11a/C-12a create their files; C-11e/C-12e validate.
- **C-13 after C-12e:** domain spell lists reference spell IDs from C-10.
- **C-16 (NPC classes) after C-13:** NPC classes reference skills and no spell IDs.
- **C-14a–C-14e:** magic items reference weapon/armor/feat tags from C-06–C-09. C-14e also covers artifacts, cursed items, and intelligent items.
- **C-15a–C-15g (psionic base):** separate `ruleSource: "srd_psionics"`. C-15g (psionic skills) appends to the existing skills config. C-15k (psionic arcane/divine spells) appends to the core spells file.
- **C-15h–C-15j (psionic prestige + items):** after psionic base classes and powers are defined.
- **C-15k last:** psionic spells appended to core spells file after all powers are done.

---

## SOURCE FILE COVERAGE

The d20srd mirror at `d20srd/www.d20srd.org/srd/` contains ~1400 HTML files. The table below documents which categories are covered by conversion tasks and which are **intentionally excluded** with justification.

| Directory / File | Status | Task(s) | Reason if excluded |
|---|---|---|---|
| `carryingCapacity.html`, `xp.html`, `theBasics.html`, `description.html` | Covered | C-01 | — |
| `skills/` (36 files) | Covered | C-02 | — |
| `races.html` | Covered | C-03 | — |
| `classes/` (11 base class files) | Covered | C-04a–C-05k | — |
| `classes/multiclass.html` | **Excluded** | — | Rules text only; no JSON entities needed |
| `feats.html` | Covered | C-06a–C-06f | — |
| `monsterFeats.html` | **Excluded** | — | Monster-only feats; not player-accessible |
| `equipment/weapons.html` | Covered | C-07 | — |
| `equipment/armor.html` | Covered | C-08 | — |
| `equipment/goodsAndServices.html` | Partially covered | C-09 | **Excluded from C-09** (not physical items): inn stay, meals, banquet, coach cab, hireling (trained/untrained), messenger, road/gate toll, ship's passage, spellcasting-for-hire costs — these are services with no weight/slot and belong in a future **C-09b (Services & Prices)** reference task. Barding (cost-multiplier table) and all mounts/animals (horse, pony, warhorse, warpony, donkey/mule, guard dog, riding dog) belong in a future **C-09c (Mounts & Animals)** creature/vehicle task. |
| `equipment/wealthAndMoney.html` | **Excluded** | — | Price/coinage reference; no game entities |
| `spells/` (610 files) | Covered | C-10a–C-10ae | — |
| `spellLists/` (8 files) | **Excluded** | — | Summary reference pages; spell list membership is captured in each spell's `spellLists` field |
| `prestigeClasses/` (15 SRD classes) | Covered | C-11a–C-11e, C-12a–C-12e | — |
| `prestigeClasses/giftedOfTheTraveler.html` | **Excluded** | — | Not part of standard d20 SRD; site-specific content in the mirror |
| `prestigeClasses/shadowcrafter.html` | **Excluded** | — | Not part of standard d20 SRD; site-specific content in the mirror |
| `divine/domains.html` | Covered | C-13 | — |
| `divine/divineAbilitiesFeats.html` | **Excluded** | — | Deific-rank content; out of player-character scope |
| `divine/divineMinions.html`, `divine/divineRanksAndPowers.html` | **Excluded** | — | GM/narrative deific content; no player-facing entities |
| `divine/spells/` (12 files) | **Excluded** | — | Deific-only spells; not on any player spell list |
| `magicItems/` (8 item files) | Covered | C-14a–C-14e | Includes artifacts, cursed items, intelligent items |
| `magicItems/creatingMagicItems.html`, `magicItems/magicItemBasics.html` | **Excluded** | — | Rules text; no item entities |
| `npcClasses/` (5 files) | Covered | C-16 | — |
| `specialMaterials.html` | Covered | C-17 | — |
| `psionic/classes/` (4 files) | Covered | C-15a–C-15b | — |
| `psionic/powers/` (~200 files) | Covered | C-15c–C-15d | — |
| `psionic/psionicFeats.html` | Covered | C-15e | — |
| `psionic/psionicRaces.html` | Covered | C-15f | — |
| `psionic/skills/` (6 files) | Covered | C-15g | — |
| `psionic/prestigeClasses/` (9 files) | Covered | C-15h–C-15i | — |
| `psionic/items/` (12 item files) | Covered | C-15j | — |
| `psionic/spells/` (9 files) | Covered | C-15k | Appended to core spells file |
| `psionic/monsters/`, `psionic/psionicPowersOverview.html`, `psionic/powerList.html` | **Excluded** | — | Monster stat blocks / overview text; no player entities |
| `monsters/` (~250 files) | **Excluded (future)** | — | Large volume; monster stat blocks are a separate future pipeline |
| `epic/` (~142 files) | **Excluded (future)** | — | Epic level rules; separate future pipeline |
| `variant/` (51 files) | **Excluded** | — | Optional variant rules; out of core SRD scope |
| `combat/`, `magicOverview/`, `conditionSummary.html`, `typesSubtypes.html` | **Excluded** | — | Rules reference text; no JSON entities (conditions and types are modelled via tags) |
| `traps.html`, `treasure.html`, `exploration.html`, `environment.html`, etc. | **Excluded** | — | GM-side / procedural content; no player-facing entities |

---

## STANDARD VALIDATION CHECKLIST

Run after generating any output file:

- [ ] JSON is syntactically valid (no trailing commas, balanced brackets, correct quoting)
- [ ] The file is a top-level JSON array `[…]` for Feature lists, or an array of config objects for config files
- [ ] Every Feature entity has: `id`, `category`, `ruleSource`, `label.en`, `label.fr`, `description.en`, `description.fr`, `tags`, `grantedModifiers`, `grantedFeatures`
- [ ] All IDs are unique within the file and follow the kebab-case prefix convention
- [ ] All IDs referenced in `grantedFeatures` exist in this file or in a previously completed file
- [ ] Every `Modifier` object has: `id`, `sourceId`, `sourceName.en`, `sourceName.fr`, `targetId`, `value`, `type`
- [ ] `levelProgression` entries use **increments** not totals — spot-check BAB and save values against the D&D 3.5 progression tables
- [ ] Every `FeatureChoice` has a valid `optionsQuery` format: `"tag:<name>"` or `"category:<name>"`
- [ ] Config files: each table object has `tableId`, `ruleSource`, and a `data` object
- [ ] All French translations use terms from the **FRENCH TRANSLATION REFERENCE** table, not generic dictionary translations
- [ ] The checkbox in this file (`D20SRD_CONVERSION.md`) has been updated from `- [ ]` to `- [x]` for the completed task
