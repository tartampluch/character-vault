# Character Vault — d20 SRD Data Conversion Pipeline

---

## LOOP EXECUTION PROTOCOL

> **Primary command** (repeat until all tasks are done):
> _"Read `D20SRD_CONVERSION.md` and execute the first unchecked task."_

**When this command is received, execute exactly the following steps — no more, no less:**

1. Scan the **CONVERSION TASK CHECKLIST** section of this file for the **first `- [ ]`** checkbox. That is the task to execute. Note its ID (e.g., `1`, `35`, `102`).
2. Load context files (see **CONTEXT FILES** section).
3. Read the source HTML file(s) listed for that task.
4. **If an output file for this task already exists:** validate it using the **STANDARD VALIDATION CHECKLIST**. If valid, skip to step 7 (mark complete, stop). If invalid, delete the file and continue.
5. Execute the conversion, applying all rules in this document.
6. Run the **STANDARD VALIDATION CHECKLIST**. Fix any issues before continuing.
7. **On completion, do ALL of the following:**
   - Update **this file**: change `- [ ] **N**` → `- [x] **N**` for the completed task number.
   - End your response with: _"Task [N] complete. [N] entities written to [filename]. Ready for the next task."_
8. **STOP.** Do not begin the next task until the user repeats the command.

**If all checkboxes are `- [x]`:** reply _"All conversion tasks are complete."_

---

## SECONDARY COMMANDS

| Command | Effect |
|---|---|
| `Status` | Count `- [x]` vs. `- [ ]` checkboxes in this file and print a structured summary. |
| `Validate N` | Validate the output file for task number N without re-converting. Report all issues found. |
| `Validate all` | Validate all output files whose task is marked `- [x]`. |
| `Re-execute N` | Force re-execution: clear its checkbox to `- [ ]`, delete its output file, re-convert, update. |

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
    00_d20srd_core_races.json                    ← 3
    01_d20srd_core_classes.json                  ← 4 … 24 (multi-batch)
    02_d20srd_core_class_features.json           ← 5 … 25 (multi-batch)
    03_d20srd_core_feats.json                    ← 26 … 31 (multi-batch)
    04_d20srd_core_skills_config.json            ← 2
    05_d20srd_core_spells.json                   ← 35 … 65 + 111 (multi-batch)
    06_d20srd_core_equipment_weapons.json        ← 32
    07_d20srd_core_equipment_armor.json          ← 33
    08_d20srd_core_equipment_goods.json          ← 34
    09_d20srd_core_config.json                   ← 1
    10_d20srd_core_prestige_classes.json         ← 66 … 74 (multi-batch)
    11_d20srd_core_prestige_class_features.json  ← 67 … 75 (multi-batch)
    12_d20srd_core_magic_items.json              ← 77 … 100 (multi-batch)
    13_d20srd_core_cleric_domains.json           ← 76
    14_d20srd_core_npc_classes.json              ← 112
    15_d20srd_core_special_materials.json        ← 113
  01_d20srd_psionics/
    00_d20srd_psionics_classes.json              ← 101
    01_d20srd_psionics_class_features.json       ← 102
    02_d20srd_psionics_powers.json               ← 103 … 104 (multi-batch)
    03_d20srd_psionics_feats.json                ← 105
    04_d20srd_psionics_races.json                ← 106
    05_d20srd_psionics_prestige_classes.json     ← 108
    06_d20srd_psionics_prestige_class_features.json ← 109
    07_d20srd_psionics_items.json                ← 110
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
| A.1.1 | Barbarian 20-level class | 4/5, 6/7, 12/13, 18/19, 20/21, 22/23, 24/25 |
| A.1.2 | Cleric 5 levels + Turn Undead | 8/9, 16/17 |
| A.1.3 | Monk 5 levels + conditional AC | 14/15 |
| A.2.1 | Dragon Disciple (prestige class) | 66–74, 67–75 |
| A.3.1–3.3 | Human, Elf, Gnome races | 3 |
| A.3.4 | Dromite (psionic race) | 106 |
| A.4.1–4.6 | 6 Feats (prereq chain, choices, metamagic, metapsionic) | 26–31, 105 |
| A.5.1–5.9 | 9 Items (armor, magic, exotic weapons, cursed) | 32, 33, 34, 77 |
| A.6.1–6.5 | 5 Spells (divine, multi-list, scaling formula) | 35 |
| A.7 | Soulknife psionic class + Mind Blade | 101, 102 |
| A.8 | Druid + Animal Companion | 10/11, 18/19 |
| A.9 | Sphere of Annihilation (artifact) | 77 |
| A.12 | Energy Missile + Metamorphosis (psionic powers with augmentations) | 103, 104 |

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
| 4 through 24 | `01_d20srd_core_classes.json` |
| 5 through 25 | `02_d20srd_core_class_features.json` |
| 26 through 31 | `03_d20srd_core_feats.json` |
| 35 through 65 + 111 | `05_d20srd_core_spells.json` |
| 66 through 74 | `10_d20srd_core_prestige_classes.json` |
| 67 through 75 | `11_d20srd_core_prestige_class_features.json` |
| 77 through 100 | `12_d20srd_core_magic_items.json` |
| 103 and 104 | `02_d20srd_psionics_powers.json` |
| 108 and 109 | `05_d20srd_psionics_prestige_classes.json` and `06_d20srd_psionics_prestige_class_features.json` |

**Rules:**
- **First sub-task** (e.g., 4, 5, 35): create the file as a top-level JSON array `[…]` with that batch's entries.
- **Subsequent sub-tasks**: read the existing file, parse the array, append the new entries, write back. Never overwrite the whole file from scratch.
- **Re-executing one sub-task**: remove that batch's entries by ID range, then re-add them.
- **Full-file validation** is only required after the final sub-task of each group (24, 25, 31, 65, 74, 75, 100, 104).

---

## CONVERSION TASK CHECKLIST

> Scan from the top for the first `- [ ]` checkbox. That is the next task.

---

### 1 — Configuration Tables (`09_d20srd_core_config.json`)

- [x] **1** — Convert configuration tables

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

### 2 — Skill Definitions (`04_d20srd_core_skills_config.json`)

- [x] **2** — Convert all skill definitions

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

### 3 — Races (`00_d20srd_core_races.json`)

- [x] **3** — Convert the 7 core races

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

### 4 — Base Class: Barbarian (`01_d20srd_core_classes.json`)

- [x] **4** — Convert Barbarian (structure only — features in 5)

**Source file:** `d20srd/www.d20srd.org/srd/classes/barbarian.html`
**Context:** Read `ANNEXES.md` section A.1.1 only.
**Output:** Create `01_d20srd_core_classes.json` as a top-level JSON array with this one entry.

Capture:
- Full 20-level `levelProgression` (BAB/save **increments**; list feature IDs — full feature objects go in 5)
- `classSkills` array
- `grantedModifiers`: hit die (d12, type `"base"`), skill points per level (4 + INT, type `"base"`)
- `grantedFeatures`: `proficiency_all_martial`, `proficiency_armor_light`, `proficiency_armor_medium`, `proficiency_shields`
- `forbiddenTags`: `["alignment_lawful"]`
- Tags: `["class", "base_class", "class_barbarian"]`
- `recommendedAttributes`: STR, CON

---

### 5 — Base Class Features: Barbarian (`02_d20srd_core_class_features.json`)

- [x] **5** — Convert Barbarian class features

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

### 6 — Base Class: Bard (`01_d20srd_core_classes.json`)

- [x] **6** — Convert Bard (structure only — features in 7)

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

### 7 — Base Class Features: Bard (`02_d20srd_core_class_features.json`)

- [x] **7** — Convert Bard class features

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

### 8 — Base Class: Cleric (`01_d20srd_core_classes.json`)

- [x] **8** — Convert Cleric (structure only — features in 9)

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

### 9 — Base Class Features: Cleric (`02_d20srd_core_class_features.json`)

- [x] **9** — Convert Cleric class features

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
| Spellcasting (divine, prepared) | `ResourcePool` per slot level 0–9 on `resources.spell_slots_cleric_<n>`; domain spell slots are handled by 76 domain features |

---

### 10 — Base Class: Druid (`01_d20srd_core_classes.json`)

- [x] **10** — Convert Druid (structure only — features in 11)

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

### 11 — Base Class Features: Druid (`02_d20srd_core_class_features.json`)

- [x] **11** — Convert Druid class features

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

### 12 — Base Class: Fighter (`01_d20srd_core_classes.json`)

- [x] **12** — Convert Fighter (structure only — features in 13)

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

### 13 — Base Class Features: Fighter (`02_d20srd_core_class_features.json`)

- [x] **13** — Convert Fighter class features

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

### 14 — Base Class: Monk (`01_d20srd_core_classes.json`)

- [x] **14** — Convert Monk (structure only — features in 15)

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

### 15 — Base Class Features: Monk (`02_d20srd_core_class_features.json`)

- [x] **15** — Convert Monk class features

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

### 16 — Base Class: Paladin (`01_d20srd_core_classes.json`)

- [x] **16** — Convert Paladin (structure only — features in 17)

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

### 17 — Base Class Features: Paladin (`02_d20srd_core_class_features.json`)

- [x] **17** — Convert Paladin class features

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

### 18 — Base Class: Ranger (`01_d20srd_core_classes.json`)

- [x] **18** — Convert Ranger (structure only — features in 19)

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

### 19 — Base Class Features: Ranger (`02_d20srd_core_class_features.json`)

- [x] **19** — Convert Ranger class features

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

### 20 — Base Class: Rogue (`01_d20srd_core_classes.json`)

- [x] **20** — Convert Rogue (structure only — features in 21)

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

### 21 — Base Class Features: Rogue (`02_d20srd_core_class_features.json`)

- [x] **21** — Convert Rogue class features

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

### 22 — Base Class: Sorcerer (`01_d20srd_core_classes.json`)

- [x] **22** — Convert Sorcerer (structure only — features in 23)

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

### 23 — Base Class Features: Sorcerer (`02_d20srd_core_class_features.json`)

- [x] **23** — Convert Sorcerer class features

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

### 24 — Base Class: Wizard (`01_d20srd_core_classes.json`)

- [x] **24** — Convert Wizard (structure only — features in 25)

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

### 25 — Base Class Features: Wizard (`02_d20srd_core_class_features.json`)

- [x] **25** — Convert Wizard class features

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

### 26–31 — Feats (`03_d20srd_core_feats.json`) — SPLIT INTO 26 … 31

> **Shared output file:** `static/rules/00_d20srd_core/03_d20srd_core_feats.json`
> **Source file (all sub-tasks):** `d20srd/www.d20srd.org/srd/feats.html`
> **Context (all sub-tasks):** Read `ANNEXES.md` sections A.4.1–4.6 before starting.
> **Output file:** 26 creates the file as `[…]`; 27–31 append to it.
> **Full-file validation** required only after 31 (the final sub-task).

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

### 26 — Feats batch 1/6: Acrobatic → Diehard (24 feats)

- [x] **26** — Convert feats: Acrobatic → Diehard

**Feats to convert (24 total):**
Acrobatic, Agile, Alertness, Animal Affinity, Armor Proficiency (Heavy), Armor Proficiency (Light), Armor Proficiency (Medium), Athletic, Augment Summoning, Blind-Fight, Brew Potion, Cleave, Combat Casting, Combat Expertise, Combat Reflexes, Craft Magic Arms and Armor, Craft Rod, Craft Staff, Craft Wand, Craft Wondrous Item, Deceitful, Deflect Arrows, Deft Hands, Diehard

**Source location:** `feats.html` — from `<h3 id="acrobatic">` through `<h3 id="diehard">` (inclusive). Use the HTML anchors as the authoritative boundary; line numbers are approximate and may shift.

---

### 27 — Feats batch 2/6: Diligent → Greater Weapon Specialization (18 feats)

- [x] **27** — Convert feats: Diligent → Greater Weapon Specialization

**Feats to convert (18 total):**
Diligent, Dodge, Empower Spell, Endurance, Enlarge Spell, Eschew Materials, Exotic Weapon Proficiency, Extend Spell, Extra Turning, Far Shot, Forge Ring, Great Cleave, Great Fortitude, Greater Spell Focus, Greater Spell Penetration, Greater Two-Weapon Fighting, Greater Weapon Focus, Greater Weapon Specialization

**Source location:** `feats.html` — from `<h3 id="diligent">` through `<h3 id="greaterWeaponSpecialization">` (inclusive).

---

### 28 — Feats batch 3/6: Heighten Spell → Improved Unarmed Strike (17 feats)

- [x] **28** — Convert feats: Heighten Spell → Improved Unarmed Strike

**Feats to convert (17 total):**
Heighten Spell, Improved Bull Rush, Improved Counterspell, Improved Critical, Improved Disarm, Improved Familiar, Improved Feint, Improved Grapple, Improved Initiative, Improved Overrun, Improved Precise Shot, Improved Shield Bash, Improved Sunder, Improved Trip, Improved Turning, Improved Two-Weapon Fighting, Improved Unarmed Strike

**Source location:** `feats.html` — from `<h3 id="heightenSpell">` through `<h3 id="improvedUnarmedStrike">` (inclusive).

---

### 29 — Feats batch 4/6: Investigator → Precise Shot (18 feats)

- [x] **29** — Convert feats: Investigator → Precise Shot

**Feats to convert (18 total):**
Investigator, Iron Will, Leadership, Lightning Reflexes, Magical Aptitude, Manyshot, Martial Weapon Proficiency, Maximize Spell, Mobility, Mounted Archery, Mounted Combat, Natural Spell, Negotiator, Nimble Fingers, Persuasive, Point Blank Shot, Power Attack, Precise Shot

**Source location:** `feats.html` — from `<h3 id="investigator">` through `<h3 id="preciseShot">` (inclusive).

---

### 30 — Feats batch 5/6: Quick Draw → Spell Penetration (17 feats)

- [x] **30** — Convert feats: Quick Draw → Spell Penetration

**Feats to convert (17 total):**
Quick Draw, Quicken Spell, Rapid Reload, Rapid Shot, Ride-By Attack, Run, Scribe Scroll, Self-Sufficient, Shield Proficiency, Shot on the Run, Silent Spell, Simple Weapon Proficiency, Skill Focus, Snatch Arrows, Spell Focus, Spell Mastery, Spell Penetration

**Source location:** `feats.html` — from `<h3 id="quickDraw">` through `<h3 id="spellPenetration">` (inclusive).

---

### 31 — Feats batch 6/6: Spirited Charge → Widen Spell (16 feats) + full validation

- [x] **31** — Convert feats: Spirited Charge → Widen Spell — **run full-file validation after writing**

**Feats to convert (16 total):**
Spirited Charge, Spring Attack, Stealthy, Still Spell, Stunning Fist, Toughness, Tower Shield Proficiency, Track, Trample, Two-Weapon Defense, Two-Weapon Fighting, Weapon Finesse, Weapon Focus, Weapon Specialization, Whirlwind Attack, Widen Spell

**Source location:** `feats.html` — from `<h3 id="spiritedCharge">` through `<h3 id="widenSpell">` (end of feat descriptions).

---

### 32 — Weapons (`06_d20srd_core_equipment_weapons.json`)

- [x] **32** — Convert all weapons (simple, martial, exotic)

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

### 33 — Armor & Shields (`07_d20srd_core_equipment_armor.json`)

- [x] **33** — Convert all armors and shields

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

### 34 — Goods & Services (`08_d20srd_core_equipment_goods.json`)

- [x] **34** — Convert adventuring gear, tools, and general goods

**Source files:** `d20srd/www.d20srd.org/srd/equipment/goodsAndServices.html`

Focus on items with mechanical relevance (thieves' tools → +2 Disable Device, masterwork thieves' tools → +2 more, healer's kit → +2 Heal, spyglass → +2 Spot at range). Simple items (rope, torches, rations) only need `id`, `category`, `label.en`, `label.fr`, `weightLbs`, `costGp`, `grantedModifiers: []`, `grantedFeatures: []`.

---

### 35 — Spells (`05_d20srd_core_spells.json`)

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

- [x] **35** — Spells: Acid Arrow → Antipathy (files `acidArrow.html` through `antipathy.html`)
- [x] **36** — Spells: Antiplant Shell → Blade Barrier (files `antiplantShell.html` through `bladeBarrier.html`)
- [x] **37** — Spells: Blasphemy → Chain Lightning (files `blasphemy.html` through `chainLightning.html`)
- [x] **38** — Spells: Changestaff → Commune (files `changestaff.html` through `commune.html`)
- [x] **39** — Spells: Commune with Nature → Creeping Doom (files `communeWithNature.html` through `creepingDoom.html`)
- [x] **40** — Spells: Crushing Despair → Death Ward (files `crushingDespair.html` through `deathWard.html`)
- [x] **41** — Spells: Deathwatch → Detect Undead (files `deathwatch.html` through `detectUndead.html`)
- [x] **42** — Spells: Dictum → Disrupting Weapon (files `dictum.html` through `disruptingWeapon.html`)
- [x] **43** — Spells: Divination → Entropic Shield (files `divination.html` through `entropicShield.html`)
- [x] **44** — Spells: Erase → Fire Trap (files `erase.html` through `fireTrap.html`)
- [x] **45** — Spells: Fireball → Gaseous Form (files `fireball.html` through `gaseousForm.html`)
- [x] **46** — Spells: Gate → Guidance (files `gate.html` through `guidance.html`)
- [x] **47** — Spells: Gust of Wind → Hold Monster (Mass) (files `gustOfWind.html` through `holdMonsterMass.html`)
- [x] **48** — Spells: Hold Person → Inflict Critical Wounds (Mass) (files `holdPerson.html` through `inflictCriticalWoundsMass.html`)
- [x] **49** — Spells: Inflict Light Wounds → Jump (files `inflictLightWounds.html` through `jump.html`)
- [x] **50** — Spells: Keen Edge → Mage's Lucubration (files `keenEdge.html` through `magesLucubration.html`)
- [x] **51** — Spells: Mage's Magnificent Mansion → Make Whole (files `magesMagnificentMansion.html` through `makeWhole.html`)
- [x] **52** — Spells: Mark of Justice → Mount (files `markOfJustice.html` through `mount.html`)
- [x] **53** — Spells: Move Earth → Phase Door (files `moveEarth.html` through `phaseDoor.html`)
- [x] **54** — Spells: Planar Ally → Prismatic Wall (files `planarAlly.html` through `prismaticWall.html`)
- [x] **55** — Spells: Produce Flame → Ray of Exhaustion (files `produceFlame.html` through `rayOfExhaustion.html`)
- [x] **56** — Spells: Ray of Frost → Resistance (files `rayOfFrost.html` through `resistance.html`)
- [x] **57** — Spells: Restoration → Secure Shelter (files `restoration.html` through `secureShelter.html`)
- [x] **58** — Spells: See Invisibility → Shocking Grasp (files `seeInvisibility.html` through `shockingGrasp.html`)
- [x] **59** — Spells: Shout → Spectral Hand (files `shout.html` through `spectralHand.html`)
- [x] **60** — Spells: Spell Immunity → Summon Instrument (files `spellImmunity.html` through `summonInstrument.html`)
- [x] **61** — Spells: Summon Monster I → Sunbeam (files `summonMonsterI.html` through `sunbeam.html`)
- [x] **62** — Spells: Sunburst → Time Stop (files `sunburst.html` through `timeStop.html`)
- [x] **63** — Spells: Tiny Hut → Unholy Blight (files `tinyHut.html` through `unholyBlight.html`)
- [x] **64** — Spells: Unseen Servant → Weird (files `unseenServant.html` through `weird.html`)
- [x] **65** — Spells: Whirlwind → Zone of Truth (files `whirlwind.html` through `zoneOfTruth.html`) — **run full-file validation after writing**

---

### 66–74 / 67–75 — Prestige Classes & Features (`10_d20srd_core_prestige_classes.json` / `11_d20srd_core_prestige_class_features.json`) — SPLIT INTO 66…74 / 67…75

> **Shared output files:**
> - Structure: `static/rules/00_d20srd_core/10_d20srd_core_prestige_classes.json`
> - Features: `static/rules/00_d20srd_core/11_d20srd_core_prestige_class_features.json`
>
> **Context (all sub-tasks):** Read `ANNEXES.md` section A.2.1 before starting.
> **Output files:** 66/67 create their respective files as `[…]`; subsequent batches append.
> **Full-file validation** required only after 74 and 75 (the final sub-tasks).
> **Execute interleaved:** 66 → 67 → 68 → 69 → … (class structure first, then features for same batch).
> **Note:** The SRD mirror also contains `giftedOfTheTraveler.html` and `shadowcrafter.html` in the `prestigeClasses/` directory. These are **not** part of the standard d20 SRD — they are supplemental/site-specific content. Do **not** convert them in tasks 66–74. They are intentionally excluded.

**General rules for all prestige class batches:**
- Same format as tasks 4–25 (base classes) but with `"prestige_class"` in `tags` instead of `"base_class"`.
- Each class has a **10-level** `levelProgression`.
- Each class requires a `prerequisitesNode` at the class level (entry requirements), using the prerequisites table in this document.
- **Spellcasting advancement** (Mystic Theurge, Archmage, Eldritch Knight, Arcane Trickster, Loremaster, Thaumaturgist, Hierophant): model as modifiers incrementing the **existing** base class spell slot `ResourcePool` (e.g., add to `resources.spell_slots_wizard_3`). Do not create new pools.
- **Dragon Disciple ability score increases**: `type: "untyped"` on `attributes.stat_str`, `stat_con`, `stat_int` at the specified levels.
- **Blackguard**: Paladin-mirror abilities — use same pool/modifier patterns as 17.

---

### 66 / 67 — Prestige Classes batch 1/5: Arcane Archer, Arcane Trickster, Archmage

- [x] **66** — Convert structure: Arcane Archer, Arcane Trickster, Archmage (creates `10_d20srd_core_prestige_classes.json`)

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/arcaneArcher.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/arcaneTrickster.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/archmage.html`

---

- [x] **67** — Convert features for: Arcane Archer, Arcane Trickster, Archmage (creates `11_d20srd_core_prestige_class_features.json`)

**Source files:** Same as 66.

---

### 68 / 69 — Prestige Classes batch 2/5: Assassin, Blackguard, Dragon Disciple

- [x] **68** — Convert structure: Assassin, Blackguard, Dragon Disciple

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/assassin.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/blackguard.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/dragonDisciple.html`

---

- [x] **69** — Convert features for: Assassin, Blackguard, Dragon Disciple

**Source files:** Same as 68.

---

### 70 / 71 — Prestige Classes batch 3/5: Duelist, Dwarven Defender, Eldritch Knight

- [x] **70** — Convert structure: Duelist, Dwarven Defender, Eldritch Knight

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/duelist.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/dwarvenDefender.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/eldritchKnight.html`

---

- [x] **71** — Convert features for: Duelist, Dwarven Defender, Eldritch Knight

**Source files:** Same as 70.

---

### 72 / 73 — Prestige Classes batch 4/5: Hierophant, Horizon Walker, Loremaster

- [x] **72** — Convert structure: Hierophant, Horizon Walker, Loremaster

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/hierophant.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/horizonWalker.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/loremaster.html`

---

- [x] **73** — Convert features for: Hierophant, Horizon Walker, Loremaster

**Source files:** Same as 72.

---

### 74 / 75 — Prestige Classes batch 5/5: Mystic Theurge, Shadowdancer, Thaumaturgist + full validation

- [x] **74** — Convert structure: Mystic Theurge, Shadowdancer, Thaumaturgist — **run full-file validation after writing**

**Source files:**
- `d20srd/www.d20srd.org/srd/prestigeClasses/mysticTheurge.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/shadowdancer.html`
- `d20srd/www.d20srd.org/srd/prestigeClasses/thaumaturgist.html`

---

- [x] **75** — Convert features for: Mystic Theurge, Shadowdancer, Thaumaturgist — **run full-file validation after writing**

**Source files:** Same as 74.

---

### 76 — Cleric Domains (`13_d20srd_core_cleric_domains.json`)

- [x] **76** — Convert all 22 core cleric domains

**Source files:** `d20srd/www.d20srd.org/srd/spellLists/clericDomains.html`

**Domains:** Air, Animal, Chaos, Death, Destruction, Earth, Evil, Fire, Good, Healing, Knowledge, Law, Luck, Magic, Plant, Protection, Strength, Sun, Travel, Trickery, War, Water

**For each domain:**
- Tags: `["domain", "domain_<name>"]`
- Domain granted power (1/day ability) → Feature with `activation` block and dedicated `ResourcePool`
- Domain spell list (levels 1–9) → `grantedFeatures` referencing spell IDs from 35
- `classSkills` granted by the domain (e.g., Knowledge domain grants all Knowledge skills as class skills)

---

### 77 — Magic Items (`12_d20srd_core_magic_items.json`)

**Source files:** `d20srd/www.d20srd.org/srd/magicItems/`
**Context:** Read `ANNEXES.md` sections A.5.1–5.9 and A.9 before the first sub-task.

**Multi-batch task** — all sub-tasks append to `12_d20srd_core_magic_items.json`. See MULTI-BATCH FILE HANDLING.

**For each magic item:**
- Permanent bonuses: `type` = `"enhancement"` (attack/damage/armor), `"deflection"` (AC), `"natural_armor"`, `"resistance"` (saves), `"luck"`, `"competence"`, `"sacred"`, `"profane"` — use the correct type for stacking rules
- Activated abilities: `activation` block with `ResourcePool` for charges/uses
- Cursed items: `forbiddenTags` preventing removal, or `conditionNode` on the removal action

- [x] **77** — Rings A-E (`rings.html`)
- [x] **78** — Rings F-J (`rings.html`)
- [x] **79** — Rings K-O (`rings.html`)
- [x] **80** — Rings P-T (`rings.html`)
- [x] **81** — Rings U-Z (`rings.html`) — **run full-file validation after writing**
- [x] **82** — Potions & Oils A-E (`potionsAndOils.html`)
- [x] **83** — Potions & Oils F-J (`potionsAndOils.html`)
- [x] **84** — Potions & Oils K-O (`potionsAndOils.html`)
- [x] **85** — Potions & Oils P-T (`potionsAndOils.html`)
- [x] **86** — Potions & Oils U-Z (`potionsAndOils.html`) — **run full-file validation after writing**
- [x] **87** — Magic Armor (`magicArmor.html`)
- [x] **88** — Magic Weapons (`magicWeapons.html`)
- [x] **89** — Wondrous Items A–E (`wondrousItems.html`)
- [x] **90** — Wondrous Items F–J (`wondrousItems.html`)
- [x] **91** — Wondrous Items K–O (`wondrousItems.html`)
- [x] **92** — Wondrous Items P–T (`wondrousItems.html`)
- [x] **93** — Wondrous Items U–Z (`wondrousItems.html`) — **run full-file validation after writing**
- [x] **94** — Rods (`rods.html`)
- [x] **95** — Staves (`staffs.html`)
- [x] **96** — Wands (`wands.html`)
- [x] **97** — Scrolls (`scrolls.html`)
- [x] **98** — Artifacts (`artifacts.html`)
- [x] **99** — Cursed Items (`cursedItems.html`)
- [x] **100** — Intelligent Items (`intelligentItems.html`) — **run full-file validation after writing**

> **Artifacts** (`artifacts.html`): Convert minor and major artifacts. Use `"category": "item"` with `"equipmentSlot": "none"` for non-wearable artifacts. See `ANNEXES.md` section A.9 for the Sphere of Annihilation example.
> **Cursed items** (`cursedItems.html`): Add `forbiddenTags` (e.g., `["cursed_identified"]`) to prevent removal and model curse effects as permanent `grantedModifiers`.
> **Intelligent items** (`intelligentItems.html`): Model as standard items with additional `grantedModifiers` for the item's powers and a `choices` entry for the item's alignment/purpose if variable.

---

### 101 — Psionic System (`static/rules/01_d20srd_psionics/`)

All 101 tasks use `"ruleSource": "srd_psionics"`.

- [x] **101** — Psionic classes → `00_d20srd_psionics_classes.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/classes/` — all `.html` files
  **Classes:** Psion (`psion.html`), Psychic Warrior (`psychicWarrior.html`), Soulknife (`soulknife.html`), Wilder (`wilder.html`)
  Same format as tasks 4–25 (base classes). Key mechanic: Power Points pool as `ResourcePool` on `resources.power_points`.

- [x] **102** — Psionic class features → `01_d20srd_psionics_class_features.json`

  **Source:** Same as 101.
  **Context:** Read `ANNEXES.md` section A.7 before starting.
  Key mechanics: Power Point pool, Discipline choices as `FeatureChoice` with `optionsQuery: "tag:psionic_discipline"`, Psychic Strike dynamic formula.

- [x] **103** — Psionic powers A–M → `02_d20srd_psionics_powers.json` (part 1)

  **Source:** `d20srd/www.d20srd.org/srd/psionic/powers/` — all files whose name starts with a–m alphabetically
  **Context:** Read `ANNEXES.md` section A.12 before starting.
  Multi-batch: 103 creates the file; 104 appends.
  Powers use `MagicFeature` with `magicType: "psionic"` and `augmentations[]`. Each augmentation: `costIncrement`, `effectDescription.en`, `effectDescription.fr`, `isRepeatable`.

- [x] **104** — Psionic powers N–Z → `02_d20srd_psionics_powers.json` (part 2)

  **Source:** `d20srd/www.d20srd.org/srd/psionic/powers/` — all files whose name starts with n–z alphabetically

- [x] **105** — Psionic feats → `03_d20srd_psionics_feats.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/psionicFeats.html`
  Same format as tasks 26–31 (feats). Include `"psionic"` in tags. Metapsionic feats: add `"metapsionic"` tag.

- [x] **106** — Psionic races → `04_d20srd_psionics_races.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/psionicRaces.html`
  **Context:** Read `ANNEXES.md` section A.3.4 before starting.
  Same format as 3. Psionic races often grant a Power Point pool and a set of known powers at level 1.

- [x] **107** — Psionic skills → append to `04_d20srd_core_skills_config.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/skills/` — all 6 files:
  `autohypnosis.html`, `concentration.html` (psionic variant), `knowledgePsionics.html`, `psicraft.html`, `usePsionicDevice.html`, `overview.html`
  Same format as 2 (append new skill entries to the existing `config_skill_definitions` table).
  Note: `concentration.html` is already covered by 2 (core version); only add psionic-specific notes in the description, do not duplicate the skill entry.

- [x] **108** — Psionic prestige classes → `05_d20srd_psionics_prestige_classes.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/prestigeClasses/` — all 9 files:
  `cerebremancer.html`, `elocater.html`, `metamind.html`, `psionUncarnate.html`, `psionicFist.html`, `pyrokineticist.html`, `slayer.html`, `thrallherd.html`, `warMind.html`
  Same format as tasks 66–74 (prestige class structure). Each has a 10-level `levelProgression`.

- [x] **109** — Psionic prestige class features → `06_d20srd_psionics_prestige_class_features.json`

  **Source:** Same as 108.
  Same format as tasks 67–75 (prestige class features).

- [x] **110** — Psionic items → `07_d20srd_psionics_items.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/items/` — all item files (exclude `basics.html`, `creatingPsionicItems.html` which are rules text):
  `armorAndShields.html`, `cognizanceCrystals.html`, `cursedItems.html`, `dorjes.html`, `powerStones.html`, `psicrowns.html`, `psionicArtifacts.html`, `psionicItems.html`, `psionicTattoos.html`, `specialMaterials.html`, `universalItems.html`, `weapons.html`
  Same format as 77. Use `"ruleSource": "srd_psionics"`.

- [x] **111** — Psionic spells (arcane/divine) → append to `05_d20srd_core_spells.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/spells/` — 8 spell files (directory has 9 files total; `overview.html` is rules text only, excluded):
  `brainSpider.html`, `dweomerOfTransference.html`, `glossolalia.html`, `mentalPinnacle.html`, `probeThoughts.html`, `psychicTurmoil.html`, `psychicTurmoilGreater.html`, `telepathicBondLesser.html`
  These are arcane/divine spells that interact with psionics. Use `"ruleSource": "srd_core"` (they appear on standard spell lists). Append to the core spells file.

---

### 112 — NPC Classes (`14_d20srd_core_npc_classes.json`)

- [x] **112** — Convert the 5 NPC classes

**Source files:** `d20srd/www.d20srd.org/srd/npcClasses/` — all 5 files:
`adept.html`, `aristocrat.html`, `commoner.html`, `expert.html`, `warrior.html`

Same format as tasks 4–25 (base classes). NPC classes have 20-level `levelProgression`. Key differences:
- Tags: `["class", "npc_class", "class_<name>"]` (not `"base_class"`)
- Adept casts spells (divine, prepared); model spell slots per the Adept table.
- Expert: bonus to any 10 class skills of the player's choice — model as `FeatureChoice` at level 1.
- No `ruleSource` difference — still `"srd_core"`.

---

### 113 — Special Materials (`15_d20srd_core_special_materials.json`)

- [x] **113** — Convert special materials (adamantine, cold iron, darkwood, mithral, etc.)

**Source files:** `d20srd/www.d20srd.org/srd/specialMaterials.html`

Each material is a Feature of `category: "item"` or `category: "condition"` that modifies weapon/armor stats when applied:
- Tags: `["special_material", "special_material_<name>"]`
- `grantedModifiers`: hardness bonus, HP bonus, DR bypass tag grant, arcane spell failure reduction, etc.
- Referenced by weapon/armor entries via `grantedFeatures: ["special_material_adamantine"]`
- Weapons of cold iron / silver: add tags `"cold_iron"` / `"silver"` for DR bypass checks.

---

## SOURCE FILE COVERAGE

The d20srd mirror at `d20srd/www.d20srd.org/srd/` contains ~1400 HTML files. The table below documents which categories are covered by conversion tasks and which are **intentionally excluded** with justification.

| Directory / File | Status | Task(s) | Reason if excluded |
|---|---|---|---|
| `carryingCapacity.html`, `xp.html`, `theBasics.html`, `description.html` | Covered | 1 | — |
| `skills/` (36 files) | Covered | 2 | — |
| `races.html` | Covered | 3 | — |
| `classes/` (11 base class files) | Covered | 4–25 | — |
| `classes/multiclass.html` | **Excluded** | — | Rules text only; no JSON entities needed |
| `feats.html` | Covered | 26–31 | — |
| `monsterFeats.html` | **Excluded** | — | Monster-only feats; not player-accessible |
| `equipment/weapons.html` | Covered | 32 | — |
| `equipment/armor.html` | Covered | 33 | — |
| `equipment/goodsAndServices.html` | Partially covered | 34 | **Excluded from 34** (not physical items): inn stay, meals, banquet, coach cab, hireling (trained/untrained), messenger, road/gate toll, ship's passage, spellcasting-for-hire costs — these are services with no weight/slot and belong in a future **34b (Services & Prices)** reference task. Barding (cost-multiplier table) and all mounts/animals (horse, pony, warhorse, warpony, donkey/mule, guard dog, riding dog) belong in a future **34c (Mounts & Animals)** creature/vehicle task. |
| `equipment/wealthAndMoney.html` | **Excluded** | — | Price/coinage reference; no game entities |
| `spells/` (610 files) | Covered | 35–65 | — |
| `spellLists/` (8 files) | **Excluded** | — | Summary reference pages; spell list membership is captured in each spell's `spellLists` field |
| `prestigeClasses/` (15 SRD classes) | Covered | 66–74, 67–75 | — |
| `prestigeClasses/giftedOfTheTraveler.html` | **Excluded** | — | Not part of standard d20 SRD; site-specific content in the mirror |
| `prestigeClasses/shadowcrafter.html` | **Excluded** | — | Not part of standard d20 SRD; site-specific content in the mirror |
| `divine/domains.html` | Covered | 76 | — |
| `divine/divineAbilitiesFeats.html` | **Excluded** | — | Deific-rank content; out of player-character scope |
| `divine/divineMinions.html`, `divine/divineRanksAndPowers.html` | **Excluded** | — | GM/narrative deific content; no player-facing entities |
| `divine/spells/` (12 files) | **Excluded** | — | Deific-only spells; not on any player spell list |
| `magicItems/` (14 item files) | Covered | 77–100 | Includes rings, potions, magic armor/weapons, wondrous items, rods, staves, wands, scrolls, artifacts, cursed items, intelligent items |
| `magicItems/creatingMagicItems.html`, `magicItems/magicItemBasics.html` | **Excluded** | — | Rules text; no item entities |
| `npcClasses/` (5 files) | Covered | 112 | — |
| `specialMaterials.html` | Covered | 113 | — |
| `psionic/classes/` (4 files) | Covered | 101–102 | — |
| `psionic/powers/` (~200 files) | Covered | 103–104 | — |
| `psionic/psionicFeats.html` | Covered | 105 | — |
| `psionic/psionicRaces.html` | Covered | 106 | — |
| `psionic/skills/` (6 files) | Covered | 107 | — |
| `psionic/prestigeClasses/` (9 files) | Covered | 108–109 | — |
| `psionic/items/` (12 item files) | Covered | 110 | — |
| `psionic/spells/` (8 spell files + overview.html) | Covered | 111 | 8 spells appended to core spells file; `overview.html` excluded (rules text) |
| `psionic/monsters/`, `psionic/psionicPowersOverview.html`, `psionic/powerList.html` | **Excluded** | — | Monster stat blocks / overview text; no player entities |
| `monsters/` (~250 files) | **Excluded (future)** | — | Large volume; monster stat blocks are a separate future pipeline |
| `epic/` (~142 files) | **Excluded (future)** | — | Epic level rules; separate future pipeline |
| `variant/` (51 files) | **Excluded** | — | Optional variant rules; out of core SRD scope |
| `combat/`, `magicOverview/`, `conditionSummary.html`, `typesSubtypes.html` | **Excluded** | — | Rules reference text; no JSON entities (conditions and types are modelled via tags) |
| `traps.html`, `treasure.html`, `exploration.html`, `environment.html`, etc. | **Excluded** | — | GM-side / procedural content; no player-facing entities |

---

## STANDARD VALIDATION CHECKLIST

Run after generating any output file. Validation is **bidirectional**: first check from the JSON outward to the SRD (completeness), then from the SRD inward to the JSON (accuracy). Both directions must pass.

---

### Direction A — JSON → SRD (Completeness: does the JSON cover everything the SRD defines?)

**Structure**
- [ ] JSON is syntactically valid (no trailing commas, balanced brackets, correct quoting)
- [ ] The file is a top-level JSON array `[…]` for Feature lists, or an array of config objects for config files
- [ ] All IDs are unique within the file and follow the kebab-case prefix convention (`race_`, `class_`, `feat_`, `spell_`, `item_`, `skill_`, `domain_`, `cf_`, etc.)
- [ ] All IDs referenced in `grantedFeatures` or `prerequisitesNode` exist either in this file or in a previously completed task's output file

**Entity completeness**
- [ ] Every entity present in the SRD source file has a corresponding entry in the JSON — no SRD entity was silently omitted
- [ ] For **classes/prestige classes**: every level in the `levelProgression` table is represented (1–20 for base classes, 1–10 for prestige classes); no level is missing
- [ ] For **spells**: every spell listed in the SRD `spells/` directory for the current batch has a JSON entry
- [ ] For **feats**: every feat in `feats.html` for the current batch has a JSON entry, including all sub-feats (e.g. Weapon Focus (longsword) is a separate entry from Weapon Focus (greataxe))
- [ ] For **magic items**: every named item in the SRD table for the current batch (rings, potions, wondrous, etc.) has a JSON entry
- [ ] For **skills**: all 36 core skills + 6 psionic skills have entries; Speak Language is included (special: no ability, unlimited ranks, grants a language FeatureChoice per rank)
- [ ] For **domains**: all 21 cleric domains have entries including their granted spells and domain powers
- [ ] For **config tables** (task 1): all required tables are present — `config_xp_table`, `config_ability_score_costs`, `config_carrying_capacity`, `config_bonus_spell_slots`, `config_multiclass_xp_penalty`, `config_size_modifiers`

**Mechanical coverage**
- [ ] Every mechanical effect stated in the SRD for the entity is modelled as a `grantedModifier`, `grantedFeature`, `activation`, `resourcePoolTemplate`, `FeatureChoice`, or `actionBudget` entry — nothing left as "description only" unless it is genuinely narrative
- [ ] Conditional effects use `conditionNode` (not hard-coded assumptions)
- [ ] Situational bonuses (vs. specific creature types, in specific terrain, etc.) use `situationalContext` — they are NOT added to static pipelines
- [ ] Resources (Rage rounds, Turn Undead uses, spell slots, power points, ki, bardic music, etc.) are modelled as `resourcePoolTemplates` with the correct `resetCondition`
- [ ] Scaling formulas use Math Parser paths (`@characterLevel`, `@classLevels.<id>`, `@attributes.<id>.derivedModifier`) — no hardcoded level-dependent values
- [ ] Iterative BAB notation (e.g. "+6/+1") is NOT stored; only the per-level BAB increment is stored in `levelProgression`; the combat UI derives iterative attacks from the total
- [ ] DR uses `type: "damage_reduction"` with correct `drBypassTags` (or `type: "base"` for additive class DR like Barbarian)
- [ ] Items with charges use `resourcePoolTemplates` with `resetCondition: "never"`; items with X/day abilities use `resetCondition: "per_day"`; X/week use `"per_week"`
- [ ] Cursed items include `removalPrevention.isCursed: true` and `removableBy` array
- [ ] Intelligent items include the full `intelligentItemData` block
- [ ] Metamagic rods include `metamagicEffect.feat` and `metamagicEffect.maxSpellLevel`
- [ ] Staves include `staffSpells[]` with `chargeCost` per spell
- [ ] Wands include `wandSpell.spellId` and `wandSpell.casterLevel`
- [ ] Scrolls include `scrollSpells[]` with `spellId`, `casterLevel`, `spellLevel`, and `spellType`
- [ ] Psionic powers include `augmentations[]` for every augmentation option listed in the SRD, `discipline`, and `displays[]`
- [ ] Psionic items include the full `psionicItemData` block with all type-appropriate fields

---

### Direction B — SRD → JSON (Accuracy: does every value in the JSON exactly match the SRD?)

**Values**
- [ ] All numeric values (BAB increments, save bonuses, AC bonus, damage dice, crit range, crit multiplier, weight, cost, spell level, range, area, duration, DC) match the SRD tables exactly — no off-by-one errors
- [ ] `levelProgression` entries use **increments** (delta per level), not cumulative totals — spot-check BAB and save progression against the official D&D 3.5 tables
- [ ] Spell lists (`spellLists` field) contain every class list and level the SRD assigns to the spell; no list is missing and no incorrect levels are present
- [ ] Feat prerequisites exactly replicate the SRD text in the `prerequisitesNode` logic tree (ability score minimums, BAB minimums, other feat requirements)
- [ ] Item prices, weights, and bonus values match the SRD tables row for row
- [ ] Save DCs, spell school, sub-school, and descriptors are correct for every spell
- [ ] Resistance type (`spell_resistance`, `power_resistance`, `none`) is correct per SRD
- [ ] Class skill lists (`classSkills`) match the SRD class description exactly — no skills added or removed
- [ ] Armor values (`armorBonus`, `maxDex`, `armorCheckPenalty`, `arcaneSpellFailure`) match the SRD armor table exactly

**Texts (English)**
- [ ] `label.en` matches the official SRD name exactly (capitalisation, hyphenation, articles)
- [ ] `description.en` is a complete and faithful rendering of the SRD text — no paragraphs or sentences omitted, no paraphrasing that changes meaning
- [ ] `sourceName.en` on every `Modifier` correctly identifies the source feature
- [ ] Activation descriptions (`activation.actionType`) reflect the SRD action type exactly (standard, move, swift, free, full-round, etc.)

**Texts (French)**
- [ ] `label.fr` uses the official WotC French D&D 3.5 term from the FRENCH TRANSLATION REFERENCE table (not a generic dictionary translation)
- [ ] `description.fr` is a complete translation of `description.en` — no sentences omitted, no English text left untranslated
- [ ] `sourceName.fr` on every `Modifier` is translated (not left in English)
- [ ] Spell school names, creature type names, condition names, action type names all use the official French SRD terminology

**Modifiers**
- [ ] Every `Modifier` object has: `id`, `sourceId`, `sourceName.en`, `sourceName.fr`, `targetId`, `value`, `type`
- [ ] `type` is one of the valid `ModifierType` values: `"base"`, `"multiplier"`, `"untyped"`, `"racial"`, `"enhancement"`, `"morale"`, `"luck"`, `"insight"`, `"sacred"`, `"profane"`, `"dodge"`, `"armor"`, `"shield"`, `"natural_armor"`, `"deflection"`, `"competence"`, `"circumstance"`, `"synergy"`, `"size"`, `"setAbsolute"`, `"damage_reduction"`, `"inherent"`, `"max_dex_cap"`, `"resistance"`
- [ ] Stacking rules are respected: two `"enhancement"` bonuses to the same pipeline do NOT both appear; use the correct type so the engine can enforce non-stacking
- [ ] `targetId` paths are valid pipeline paths (`attributes.stat_str`, `combatStats.attack_bonus`, `skills.skill_hide`, etc.) — no typos, no invented paths

**Choices and options**
- [ ] Every `FeatureChoice` has a valid `optionsQuery` (`"tag:<name>"`, `"category:<name>"`, or `"discipline:<name>"`)
- [ ] `maxSelections` matches the SRD (e.g. Weapon Focus allows 1 selection per feat instance)

**Config files**
- [ ] Each config table object has `tableId`, `ruleSource`, and a `data` object
- [ ] Config table values (XP thresholds, carrying capacity breakpoints, bonus spell slots per ability modifier) match the SRD tables exactly

---

### Final step
- [ ] The checkbox in this file (`D20SRD_CONVERSION.md`) has been updated from `- [ ] **N**` to `- [x] **N**` for the completed task number
