/**
 * @file src/lib/components/ui/icons.ts
 * @description Centralized icon mapping convention for Character Vault.
 *
 * PURPOSE:
 *   This file serves as the authoritative reference for which Lucide icon is used
 *   for each semantic purpose in the application. It provides re-exports so
 *   components can import from a single, stable location rather than coupling
 *   directly to lucide-svelte's internal structure.
 *
 *   If an icon ever needs to be swapped (e.g., `Dumbbell` → `BicepsFlexed`),
 *   changing it here propagates everywhere automatically.
 *
 * USAGE:
 *   import { IconHeart, IconPlus, IconTrash2 } from '$lib/components/ui/icons';
 *   <IconHeart size={20} aria-hidden="true" />
 *
 * SIZING CONVENTIONS (enforced project-wide):
 *   16px — inline with text (inline badges, status indicators)
 *   20px — buttons, navigation items, tab labels, section action buttons
 *   24px — section headers (large, prominent labels)
 *
 * ALL ICONS USE currentColor:
 *   Lucide SVGs use `stroke="currentColor"` by default, so they automatically
 *   inherit the surrounding text color. Never hardcode a color on an icon.
 *
 * ACCESSIBILITY:
 *   - Decorative icons (beside a text label): add `aria-hidden="true"`
 *   - Standalone icon buttons: add `aria-label` on the <button>, not the icon
 *   - Icons in badges that convey meaning: add a visually-hidden <span> alongside
 */

// ─── TAB NAVIGATION ─────────────────────────────────────────────────────────
// Used in character sheet tab bar (Phase 8.1 / 19.6)
export { FileText   as IconTabCore      } from 'lucide-svelte'; // Core / Summary tab
export { Dumbbell   as IconTabAbilities } from 'lucide-svelte'; // Abilities & Skills tab
export { Swords     as IconTabCombat    } from 'lucide-svelte'; // Combat tab
export { Star       as IconTabFeats     } from 'lucide-svelte'; // Feats tab
export { Sparkles   as IconTabMagic     } from 'lucide-svelte'; // Spells & Powers tab
export { Backpack   as IconTabInventory } from 'lucide-svelte'; // Inventory tab

// ─── SECTION HEADERS ────────────────────────────────────────────────────────
// Used as 24px icons in section/panel headers
export { Settings   as IconSettings     } from 'lucide-svelte'; // Campaign settings, GM settings
export { ChartBar   as IconStats        } from 'lucide-svelte'; // Stats overview
export { GraduationCap as IconSkills    } from 'lucide-svelte'; // Skills section
export { Shield     as IconSaves        } from 'lucide-svelte'; // Saving throws
export { Heart      as IconHealth       } from 'lucide-svelte'; // HP / Health section
export { TrendingUp as IconXP           } from 'lucide-svelte'; // Experience points
export { ShieldCheck as IconAC          } from 'lucide-svelte'; // Armor Class
export { Sword      as IconAttacks      } from 'lucide-svelte'; // Weapon attacks
export { Footprints as IconMovement     } from 'lucide-svelte'; // Movement speeds
export { Flame      as IconResistances  } from 'lucide-svelte'; // Energy resistances
export { ShieldAlert as IconDR          } from 'lucide-svelte'; // Damage Reduction
export { BookOpen   as IconSpells       } from 'lucide-svelte'; // Spells / Grimoire
export { Zap        as IconAbilities    } from 'lucide-svelte'; // Special abilities / class features
export { Languages  as IconLanguages    } from 'lucide-svelte'; // Languages section
export { Scroll     as IconLore         } from 'lucide-svelte'; // Personal lore / backstory
export { BookOpen   as IconJournal      } from 'lucide-svelte'; // Leveling journal / history
export { Package    as IconInventory    } from 'lucide-svelte'; // Generic inventory item
export { Coins      as IconWealth       } from 'lucide-svelte'; // Wealth / currency

// ─── ACTION BUTTONS ──────────────────────────────────────────────────────────
// Used as 20px icons in interactive controls
export { Plus           as IconAdd        } from 'lucide-svelte'; // Add item / feat / entry
export { Trash2         as IconDelete     } from 'lucide-svelte'; // Delete / remove
export { Pencil         as IconEdit       } from 'lucide-svelte'; // Edit / rename
export { Info           as IconInfo       } from 'lucide-svelte'; // Info / modifier breakdown
export { Dices          as IconDiceRoll   } from 'lucide-svelte'; // Roll dice
export { Search         as IconSearch     } from 'lucide-svelte'; // Search / filter input
export { Filter         as IconFilter     } from 'lucide-svelte'; // Filter toggle
export { ArrowUpToLine  as IconEquip      } from 'lucide-svelte'; // Equip item
export { ArrowDownToLine as IconUnequip   } from 'lucide-svelte'; // Unequip item
export { HeartPulse     as IconHeal       } from 'lucide-svelte'; // Heal action
export { Skull          as IconDamage     } from 'lucide-svelte'; // Apply damage
export { RefreshCw      as IconReset      } from 'lucide-svelte'; // Reset / reroll
export { ChevronDown    as IconChevronDown } from 'lucide-svelte'; // Dropdown / expand
export { ChevronUp      as IconChevronUp   } from 'lucide-svelte'; // Collapse
export { ChevronRight   as IconChevronRight } from 'lucide-svelte'; // Navigate right / breadcrumb

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
// Used in sidebar navigation and page headers
export { Map        as IconCampaign     } from 'lucide-svelte'; // Campaign hub
export { Users      as IconVault        } from 'lucide-svelte'; // Character vault
export { User       as IconCharacter    } from 'lucide-svelte'; // Single character
export { Crown      as IconGMDashboard  } from 'lucide-svelte'; // GM Dashboard (GM-only)
export { ArrowLeft  as IconBack         } from 'lucide-svelte'; // Back navigation
export { Menu       as IconMenu         } from 'lucide-svelte'; // Hamburger / open drawer
export { X          as IconClose        } from 'lucide-svelte'; // Close / dismiss
export { Home       as IconHome         } from 'lucide-svelte'; // Home / root
export { LogOut     as IconLogout       } from 'lucide-svelte'; // Sign out
export { ChevronsLeft  as IconCollapse  } from 'lucide-svelte'; // Collapse sidebar
export { ChevronsRight as IconExpand    } from 'lucide-svelte'; // Expand sidebar
export { GripVertical  as IconDragHandle } from 'lucide-svelte'; // Drag-and-drop handle (rule sources)

// ─── THEME TOGGLE ────────────────────────────────────────────────────────────
// Used in ThemeToggle.svelte (Phase 19.2)
export { Monitor    as IconThemeSystem  } from 'lucide-svelte'; // System / auto theme
export { Sun        as IconThemeLight   } from 'lucide-svelte'; // Force light mode
export { Moon       as IconThemeDark    } from 'lucide-svelte'; // Force dark mode

// ─── STATUS & FEEDBACK ───────────────────────────────────────────────────────
// Used in prerequisites, validation, notifications
export { Check          as IconSuccess   } from 'lucide-svelte'; // Met prerequisite / success
export { AlertCircle    as IconError     } from 'lucide-svelte'; // Error / failed prerequisite
export { AlertTriangle  as IconWarning   } from 'lucide-svelte'; // Warning / caution
export { Lock           as IconLocked    } from 'lucide-svelte'; // Locked / read-only
export { CircleCheck    as IconChecked   } from 'lucide-svelte'; // Completed chapter / checked item
export { Circle         as IconUnchecked } from 'lucide-svelte'; // Incomplete item

// ─── CHARACTER & RPG SPECIFIC ────────────────────────────────────────────────
// Domain-specific icons that map to RPG concepts
export { Wand         as IconMagicWand    } from 'lucide-svelte'; // Wizard / arcane magic
export { Cross        as IconDivine       } from 'lucide-svelte'; // Cleric / divine magic
export { Brain        as IconPsionic      } from 'lucide-svelte'; // Psionics / psionic powers
export { BadgeCheck   as IconNPC          } from 'lucide-svelte'; // NPC character indicator
export { UserPlus     as IconAddCharacter } from 'lucide-svelte'; // Create new character
export { UserCog      as IconEditCharacter } from 'lucide-svelte'; // Edit character
export { Layers       as IconRuleSources  } from 'lucide-svelte'; // Rule source stacking
export { Code         as IconJsonEditor   } from 'lucide-svelte'; // GM JSON override editor
export { Weight       as IconEncumbrance  } from 'lucide-svelte'; // Encumbrance / carry weight
export { Gem          as IconMagicItem    } from 'lucide-svelte';

// ─── EPHEMERAL EFFECTS ICONS ─────────────────────────────────────────────────
// Used in EphemeralEffectsPanel and consumable item flows (Phase E-3)
export { Hourglass    as IconEphemeral    } from 'lucide-svelte'; // Active (ephemeral) effect
export { TimerOff     as IconExpire       } from 'lucide-svelte'; // Expire / dismiss effect button
export { FlaskRound   as IconPotion       } from 'lucide-svelte'; // Potion / consumable item
export { Droplets     as IconOil          } from 'lucide-svelte'; // Oil (applied externally)
export { Bolt         as IconActiveEffect } from 'lucide-svelte'; // Active effect / buff indicator

// ─── ELEMENT / RESISTANCE ICONS ──────────────────────────────────────────────
// Used in the Resistances panel (Phase 10.6)
export { Flame        as IconFire         } from 'lucide-svelte'; // Fire resistance
export { Snowflake    as IconCold         } from 'lucide-svelte'; // Cold resistance
export { FlaskConical as IconAcid         } from 'lucide-svelte'; // Acid resistance
export { Zap          as IconElectricity  } from 'lucide-svelte'; // Electricity resistance
export { Volume2      as IconSonic        } from 'lucide-svelte'; // Sonic resistance
export { Sparkles     as IconSpellSR      } from 'lucide-svelte'; // Spell Resistance
export { BrainCircuit as IconPowerPR      } from 'lucide-svelte'; // Power Resistance (psionic)
export { ShieldAlert  as IconFortification } from 'lucide-svelte'; // Fortification %

// ─── MOVEMENT ICONS ──────────────────────────────────────────────────────────
// Used in the Movement Speeds panel (Phase 10.5)
export { Footprints   as IconSpeedLand    } from 'lucide-svelte'; // Land speed
export { Pickaxe      as IconSpeedBurrow  } from 'lucide-svelte'; // Burrow speed
export { Mountain     as IconSpeedClimb   } from 'lucide-svelte'; // Climb speed
export { Wind         as IconSpeedFly     } from 'lucide-svelte'; // Fly speed
export { Waves        as IconSpeedSwim    } from 'lucide-svelte'; // Swim speed
