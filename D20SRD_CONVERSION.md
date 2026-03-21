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
    00_d20srd_core_races.json             ← C-03
    01_d20srd_core_classes.json           ← C-04
    02_d20srd_core_class_features.json    ← C-05
    03_d20srd_core_feats.json             ← C-06
    04_d20srd_core_skills_config.json     ← C-02
    05_d20srd_core_spells.json            ← C-10a … C-10h (multi-batch)
    06_d20srd_core_equipment_weapons.json ← C-07
    07_d20srd_core_equipment_armor.json   ← C-08
    08_d20srd_core_equipment_goods.json   ← C-09
    09_d20srd_core_config.json            ← C-01
    10_d20srd_core_prestige_classes.json  ← C-11
    11_d20srd_core_prestige_class_features.json ← C-12
    12_d20srd_core_magic_items.json       ← C-14a … C-14e (multi-batch)
    13_d20srd_core_domains.json           ← C-13
  01_d20srd_psionics/
    00_d20srd_psionics_classes.json       ← C-15a
    01_d20srd_psionics_class_features.json ← C-15b
    02_d20srd_psionics_powers.json        ← C-15c … C-15d (multi-batch)
    03_d20srd_psionics_feats.json         ← C-15e
    04_d20srd_psionics_races.json         ← C-15f
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
| A.1.1 | Barbarian 20-level class | C-04, C-05 |
| A.1.2 | Cleric 5 levels + Turn Undead | C-04, C-05 |
| A.1.3 | Monk 5 levels + conditional AC | C-04, C-05 |
| A.2.1 | Dragon Disciple (prestige class) | C-11, C-12 |
| A.3.1–3.3 | Human, Elf, Gnome races | C-03 |
| A.3.4 | Dromite (psionic race) | C-15f |
| A.4.1–4.6 | 6 Feats (prereq chain, choices, metamagic, metapsionic) | C-06, C-15e |
| A.5.1–5.9 | 9 Items (armor, magic, exotic weapons, cursed) | C-07, C-08, C-09, C-14 |
| A.6.1–6.5 | 5 Spells (divine, multi-list, scaling formula) | C-10 |
| A.7 | Soulknife psionic class + Mind Blade | C-15a, C-15b |
| A.8 | Druid + Animal Companion | C-04, C-05 |
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
| C-10a through C-10h | `05_d20srd_core_spells.json` |
| C-14a through C-14e | `12_d20srd_core_magic_items.json` |
| C-15c and C-15d | `02_d20srd_psionics_powers.json` |

**Rules:**
- **First sub-task** (e.g., C-10a): create the file as a top-level JSON array `[…]` with that batch's entries.
- **Subsequent sub-tasks**: read the existing file, parse the array, append the new entries, write back. Never overwrite the whole file from scratch.
- **Re-executing one sub-task**: remove that batch's entries by ID range, then re-add them.
- **Full-file validation** is only required after the final sub-task of each group (C-10h, C-14e, C-15d).

---

## CONVERSION TASK CHECKLIST

> Scan from the top for the first `- [ ]` checkbox. That is the next task.

---

### C-01 — Configuration Tables (`09_d20srd_core_config.json`)

- [ ] **C-01** — Convert configuration tables

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

- [ ] **C-02** — Convert all skill definitions

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

- [ ] **C-03** — Convert the 7 core races

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

### C-04 — Base Classes (`01_d20srd_core_classes.json`)

- [ ] **C-04** — Convert all 11 base classes (structure only — features in C-05)

**Source files:** `d20srd/www.d20srd.org/srd/classes/` — all `.html` files except `index*.html` and `multiclass.html`
**Context:** Read `ANNEXES.md` sections A.1.1–1.3 and A.8 before starting.

**Classes:** Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Wizard

**For each class, capture:**
- Full 20-level `levelProgression` array with BAB/save **increments** and feature IDs per level
- `classSkills` array (full list of skill IDs from C-02)
- Hit Die → `grantedModifiers` targeting `combatStats.hit_die_type`, type `"base"`
- Skill points per level → `grantedModifiers` targeting `attributes.skill_points_per_level`, type `"base"`
- Starting proficiencies → `grantedFeatures` (IDs like `proficiency_all_martial`, `proficiency_armor_light`)
- `recommendedAttributes`
- `forbiddenTags` for alignment restrictions:
  - Barbarian: `["alignment_lawful"]`
  - Monk: `["alignment_chaotic", "alignment_neutral_ethical"]`
  - Druid: `["alignment_non_neutral"]`
  - Paladin: `["alignment_non_lawful_good"]`
- `choices` for domain/school selections:
  - Cleric: 2× `{ "optionsQuery": "tag:domain", "maxSelections": 1 }`
  - Wizard: `{ "optionsQuery": "tag:arcane_school", "maxSelections": 1 }`

---

### C-05 — Base Class Features (`02_d20srd_core_class_features.json`)

- [ ] **C-05** — Convert all class features referenced in C-04's `levelProgression`

**Source files:** Same as C-04.
**Context:** Read `ANNEXES.md` sections A.1.1–1.3 and A.8 before starting. This is the most complex task.

Every feature ID in any `levelProgression.grantedFeatures` must be a full Feature object in this file.

**Critical features and the mechanic to use:**

| Feature | Mechanic |
|---|---|
| Barbarian Rage | `activation` + `resourceCost` targeting `resources.barbarian_rage_uses` + conditional STR/CON/Will/AC modifiers |
| Rogue Sneak Attack | Formula `"floor((@classLevels.class_rogue + 1) / 2)d6"` + `situationalContext: "target_flat_footed_or_flanked"` |
| Wizard/Sorcerer Spellcasting | Spell slots as `ResourcePool` modifiers on `resources.spell_slots_<class>_<level>` for levels 0–9 |
| Druid Wild Shape | `setAbsolute` on relevant pipelines + `forbiddenTags: ["metal_armor", "metal_shield"]` on the class |
| Monk Unarmed Damage | `setAbsolute` on `combatStats.unarmed_damage` at each tier (1d6→1d8→1d10→2d6…) |
| Monk AC Bonus | Formula `"@attributes.stat_wis.derivedModifier"` + `conditionNode` (no armor, no shield, no encumbrance) |
| Turn Undead | `activation` + `resourceCost` + `ResourcePool` max formula `"3 + @attributes.stat_cha.derivedModifier"` |
| Uncanny Dodge | Conditional: blocks DEX denial to AC |
| Evasion | Conditional on Reflex save result (full damage → no damage on save) |
| Bardic Music uses | `ResourcePool` max = character level |
| Druid Animal Companion | `FeatureChoice` with `optionsQuery: "tag:animal_companion"` |
| Ranger Combat Style | `FeatureChoice` selecting Two-Weapon Fighting or Archery path |

**For activated abilities:**
```json
"activation": {
  "actionType": "standard|free|swift|move|full_round",
  "resourceCost": { "targetId": "resources.<pool_id>", "cost": 1 }
}
```

---

### C-06 — Feats (`03_d20srd_core_feats.json`)

- [ ] **C-06** — Convert all ~100 core SRD feats

**Source files:** `d20srd/www.d20srd.org/srd/feats.html` (read the full file — ~2937 lines)
**Context:** Read `ANNEXES.md` sections A.4.1–4.6 before starting.

**For each feat, capture:**
- `prerequisitesNode` — convert every prerequisite using the prerequisites table above
- Tags: `"fighter_bonus_feat"` where applicable, `"metamagic"`, `"item_creation"`, `"psionic"` etc.
- `grantedModifiers` for mechanical effects
- `choices` for feats requiring a selection (Weapon Focus, Skill Focus, Exotic Weapon Proficiency, Spell Focus, etc.)

**Situational feats:**
- Dodge (+1 AC vs. one designated opponent): `situationalContext: "vs_designated_target"`, type `"dodge"`
- Alertness (+2 Listen/Spot): `grantedModifiers` with type `"untyped"`
- Toughness (+3 HP): modifier targeting `combatStats.hp_bonus`, type `"untyped"`, value `3`

**Metamagic feats:** Model the slot cost increase as a modifier targeting `combatStats.metamagic_level_cost` with `situationalContext` identifying the metamagic type (e.g., `"metamagic_empower"`, `"metamagic_maximize"`).

**Feats with choices (example):**
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
    "sourceName": { "en": "Weapon Focus", "fr": "Spécialisation martiale" },
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

### C-07 — Weapons (`06_d20srd_core_equipment_weapons.json`)

- [ ] **C-07** — Convert all weapons (simple, martial, exotic)

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

- [ ] **C-08** — Convert all armors and shields

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

- [ ] **C-09** — Convert adventuring gear, tools, and general goods

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

- [ ] **C-10a** — Spells: Acid Arrow → Burning Hands (files `acidArrow.html` through `burningHands.html`)
- [ ] **C-10b** — Spells: Call Lightning → Dominate Person (files `callLightning.html` through `dominatePerson.html`)
- [ ] **C-10c** — Spells: Eagle's Splendor → Freedom of Movement (files `eaglesSplendor.html` through `freedomOfMovement.html`)
- [ ] **C-10d** — Spells: Gaseous Form → Lullaby (files `gaseousForm.html` through `lullaby.html`)
- [ ] **C-10e** — Spells: Mage Armor → Neutralize Poison (files `mageArmor.html` through `neutralizePoison.html`)
- [ ] **C-10f** — Spells: Obscure Object → Resilient Sphere (files `obscureObject.html` through `resilientSphere.html`)
- [ ] **C-10g** — Spells: Sanctuary → Touch of Fatigue (files `sanctuary.html` through `touchOfFatigue.html`)
- [ ] **C-10h** — Spells: Undeath to Death → Zone of Truth (files `undeathToDeath.html` through `zoneOfTruth.html`)

---

### C-11 — Prestige Classes (`10_d20srd_core_prestige_classes.json`)

- [ ] **C-11** — Convert all 15 core prestige classes (structure only — features in C-12)

**Source files:** `d20srd/www.d20srd.org/srd/prestigeClasses/` — all `.html` files except `index*.html`
**Context:** Read `ANNEXES.md` section A.2.1 before starting.

**Classes:** Arcane Archer, Arcane Trickster, Archmage, Assassin, Blackguard, Dragon Disciple, Duelist, Dwarven Defender, Eldritch Knight, Hierophant, Horizon Walker, Loremaster, Mystic Theurge, Shadowdancer, Thaumaturgist

Same format as C-04. Each class requires a `prerequisitesNode` at the class level (entry requirements). Prestige classes have 10-level `levelProgression` arrays.

---

### C-12 — Prestige Class Features (`11_d20srd_core_prestige_class_features.json`)

- [ ] **C-12** — Convert all features referenced in C-11's `levelProgression`

**Source files:** Same as C-11.
**Context:** Read `ANNEXES.md` section A.2.1 before starting.

Same approach as C-05. Special cases:
- **Spellcasting advancement** (Mystic Theurge, Archmage, Eldritch Knight, etc.): model as modifiers incrementing existing spell slot `ResourcePool` values, not new pools.
- **Dragon Disciple ability increases**: `type: "untyped"` on `stat_str`, `stat_int`, `stat_con` at the specified levels.
- **Blackguard**: Paladin-like abilities — aura, smite, undead control using C-05 patterns.

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
- [ ] **C-14e** — Rods (`rods.html`), Staves (`staffs.html`), Wands (`wands.html`), Scrolls (`scrolls.html`)

---

### C-15 — Psionic System (`static/rules/01_d20srd_psionics/`)

All C-15 tasks use `"ruleSource": "srd_psionics"`.

- [ ] **C-15a** — Psionic classes → `00_d20srd_psionics_classes.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/classes/` — all `.html` files
  **Classes:** Psion, Psychic Warrior, Soulknife, Wilder
  Same format as C-04. Key mechanic: Power Points pool as `ResourcePool` on `resources.power_points`.

- [ ] **C-15b** — Psionic class features → `01_d20srd_psionics_class_features.json`

  **Source:** Same as C-15a.
  **Context:** Read `ANNEXES.md` section A.7 before starting.
  Key mechanics: Power Point pool, Discipline choices as `FeatureChoice` with `optionsQuery: "tag:psionic_discipline"`, Psychic Strike dynamic formula.

- [ ] **C-15c** — Psionic powers A–M → `02_d20srd_psionics_powers.json` (part 1)

  **Source:** `d20srd/www.d20srd.org/srd/psionic/powers/` — files A–M
  **Context:** Read `ANNEXES.md` section A.12 before starting.
  Multi-batch: C-15c creates the file; C-15d appends.
  Powers use `MagicFeature` with `magicType: "psionic"` and `augmentations[]`. Each augmentation: `costIncrement`, `effectDescription.en`, `effectDescription.fr`, `isRepeatable`.

- [ ] **C-15d** — Psionic powers N–Z → `02_d20srd_psionics_powers.json` (part 2)

  **Source:** `d20srd/www.d20srd.org/srd/psionic/powers/` — files N–Z

- [ ] **C-15e** — Psionic feats → `03_d20srd_psionics_feats.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/psionicFeats.html`
  Same format as C-06. Include `"psionic"` in tags. Metapsionic feats: add `"metapsionic"` tag.

- [ ] **C-15f** — Psionic races → `04_d20srd_psionics_races.json`

  **Source:** `d20srd/www.d20srd.org/srd/psionic/psionicRaces.html`
  **Context:** Read `ANNEXES.md` section A.3.4 before starting.
  Same format as C-03. Psionic races often grant a Power Point pool and a set of known powers at level 1.

---

## RECOMMENDED EXECUTION ORDER

```
C-01 → C-02 → C-03 → C-04 → C-05 → C-06 → C-07 → C-08 → C-09
→ C-10a … C-10h → C-11 → C-12 → C-13 → C-14a … C-14e → C-15a … C-15f
```

**Rationale:**
- C-01/C-02 first: subsequent files reference skill IDs and config tables.
- C-03–C-05 together: races reference features; classes reference skills; class features reference ResourcePools.
- C-06 after C-05: feats reference class feature tags.
- C-07–C-09 before spells: weapon tags are referenced in spell condition nodes.
- C-10 last in core: ~600 individual HTML files, high volume but architecturally independent.
- C-15 last: separate `ruleSource`, skippable without breaking the core.

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
