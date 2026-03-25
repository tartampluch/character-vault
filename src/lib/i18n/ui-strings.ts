/**
 * @file src/lib/i18n/ui-strings.ts
 * @description Centralized UI chrome strings for internationalization.
 *
 * All user-visible UI text (section headers, button labels, status messages,
 * empty states, form labels, tooltips) is defined here as `LocalizedString`
 * objects with `en` and `fr` translations.
 *
 * Components import the `ui` helper function which resolves strings based
 * on the current campaign language setting via `engine.settings.language`.
 *
 * ADDING A NEW STRING:
 *   1. Add an entry to `UI_STRINGS` with a semantic key.
 *   2. Provide at least `en` and `fr` translations.
 *   3. Use `ui('your_key')` in the component template.
 *
 * NAMING CONVENTION:
 *   Keys use dot-separated namespaces: `section.subsection.element`
 *   Examples: `combat.hp.title`, `feats.empty_state`, `sidebar.campaigns`
 */

import type { LocalizedString } from '../types/i18n';
import { t } from '../utils/formatters';

// ---------------------------------------------------------------------------
// UI STRING REGISTRY
// ---------------------------------------------------------------------------

export const UI_STRINGS: Record<string, LocalizedString> = {

  // ==========================================================================
  // SIDEBAR & NAVIGATION
  // ==========================================================================
  'app.title':                    { en: 'Character Vault', fr: 'Coffre aux Personnages' },
  'nav.campaigns':                { en: 'Campaigns', fr: 'Campagnes' },
  'nav.vault':                    { en: 'Vault', fr: 'Coffre' },
  'nav.character':                { en: 'Character', fr: 'Personnage' },
  'nav.character_sheet':          { en: 'Character Sheet', fr: 'Fiche de Personnage' },
  'nav.gm_tools':                 { en: 'GM Tools', fr: 'Outils MJ' },
  'nav.gm_dashboard':             { en: 'GM Dashboard', fr: 'Tableau de bord MJ' },
  'nav.settings':                 { en: 'Settings', fr: 'Paramètres' },
  'nav.campaign_settings':        { en: 'Campaign Settings', fr: 'Paramètres de campagne' },
  'nav.expand_sidebar':           { en: 'Expand sidebar', fr: 'Développer la barre latérale' },
  'nav.collapse_sidebar':         { en: 'Collapse sidebar', fr: 'Réduire la barre latérale' },
  'nav.close_navigation':         { en: 'Close navigation', fr: 'Fermer la navigation' },
  'nav.role_gm':                  { en: 'Game Master', fr: 'Maître du Jeu' },
  'nav.role_player':              { en: 'Player', fr: 'Joueur' },
  'nav.switch_to_player':         { en: 'Switch to Player mode', fr: 'Passer en mode Joueur' },
  'nav.switch_to_gm':             { en: 'Switch to GM mode', fr: 'Passer en mode MJ' },
  'nav.dev_prefix':               { en: 'Dev:', fr: 'Dev :' },

  // ==========================================================================
  // CAMPAIGNS HUB
  // ==========================================================================
  'campaigns.title':              { en: 'Your Campaigns', fr: 'Vos Campagnes' },
  'campaigns.subtitle':           { en: 'Choose a campaign to begin, or create a new one.', fr: 'Choisissez une campagne ou créez-en une nouvelle.' },
  'campaigns.create':             { en: 'Create Campaign', fr: 'Créer une campagne' },
  'campaigns.new_title':          { en: 'New Campaign', fr: 'Nouvelle campagne' },
  'campaigns.field_title':        { en: 'Campaign Title', fr: 'Titre de la campagne' },
  'campaigns.field_title_placeholder': { en: 'e.g. Reign of Winter, Curse of Strahd…', fr: 'ex. Le Règne de l\'Hiver, La Malédiction de Strahd…' },
  'campaigns.empty_title':        { en: 'No campaigns yet', fr: 'Aucune campagne' },
  'campaigns.empty_gm':           { en: 'Click "+ Create Campaign" above to start your first adventure.', fr: 'Cliquez sur « + Créer une campagne » pour lancer votre première aventure.' },
  'campaigns.empty_player':       { en: 'Your Game Master hasn\'t created a campaign yet. Check back later!', fr: 'Votre Maître du Jeu n\'a pas encore créé de campagne. Revenez plus tard !' },
  'campaigns.open':               { en: 'Open →', fr: 'Ouvrir →' },

  // ==========================================================================
  // CAMPAIGN DETAIL
  // ==========================================================================
  'campaign.not_found':           { en: 'Campaign not found', fr: 'Campagne introuvable' },
  'campaign.not_found_desc':      { en: 'The campaign with this ID doesn\'t exist.', fr: 'La campagne avec cet identifiant n\'existe pas.' },
  'campaign.back_to_hub':         { en: 'Back to Campaign Hub', fr: 'Retour aux campagnes' },
  'campaign.character_vault':     { en: 'Character Vault', fr: 'Coffre aux Personnages' },
  'campaign.chapters_title':      { en: 'Chapters & Acts', fr: 'Chapitres & Actes' },
  'campaign.chapters_empty_gm':   { en: 'No chapters yet. Add chapters via GM Settings.', fr: 'Aucun chapitre. Ajoutez des chapitres via les Paramètres MJ.' },
  'campaign.chapters_empty_player': { en: 'No chapters have been added to this campaign yet.', fr: 'Aucun chapitre n\'a encore été ajouté à cette campagne.' },
  'campaign.completed':           { en: 'Completed', fr: 'Terminé' },
  'campaign.mark_done':           { en: 'Mark done', fr: 'Marquer terminé' },
  'campaign.mark_incomplete':     { en: 'Mark as incomplete', fr: 'Marquer comme incomplet' },
  'campaign.mark_completed':      { en: 'Mark as completed', fr: 'Marquer comme terminé' },
  'campaign.done':                { en: 'Done', fr: 'Terminé' },
  'campaign.active_sources':      { en: 'Active Rule Sources', fr: 'Sources de règles actives' },
  'campaign.manage_sources_hint': { en: 'Manage rule sources in GM Settings.', fr: 'Gérez les sources de règles dans les Paramètres MJ.' },

  // ==========================================================================
  // CHARACTER VAULT
  // ==========================================================================
  'vault.title':                  { en: 'Your Adventurers', fr: 'Vos Aventuriers' },
  'vault.create_character':       { en: 'Create New Character', fr: 'Créer un personnage' },
  'vault.add_npc':                { en: 'Add NPC / Monster', fr: 'Ajouter PNJ / Monstre' },
  'vault.gm_view':                { en: 'GM View', fr: 'Vue MJ' },
  'vault.player_view':            { en: 'Player View', fr: 'Vue Joueur' },
  'vault.characters':             { en: 'character(s)', fr: 'personnage(s)' },
  'vault.empty_title':            { en: 'No adventurers yet!', fr: 'Aucun aventurier !' },
  'vault.empty_gm':               { en: 'Create the party\'s first character or add an NPC to get started.', fr: 'Créez le premier personnage du groupe ou ajoutez un PNJ pour commencer.' },
  'vault.empty_player':           { en: 'You don\'t have any characters in this campaign yet. Click "Create New Character" to begin your journey!', fr: 'Vous n\'avez pas encore de personnage dans cette campagne. Cliquez sur « Créer un personnage » pour commencer votre aventure !' },
  'vault.delete_confirm':         { en: 'Delete "{name}"? This cannot be undone.', fr: 'Supprimer « {name} » ? Cette action est irréversible.' },
  'vault.delete_character':       { en: 'Delete character', fr: 'Supprimer le personnage' },

  // ==========================================================================
  // GM DASHBOARD
  // ==========================================================================
  'gm.dashboard':                 { en: 'GM Dashboard', fr: 'Tableau de bord MJ' },
  'gm.all_characters':            { en: 'All Characters', fr: 'Tous les personnages' },
  'gm.no_characters':             { en: 'No characters in this campaign yet.', fr: 'Aucun personnage dans cette campagne.' },
  'gm.select_character':          { en: '← Select a character to view their stats and edit GM overrides.', fr: '← Sélectionnez un personnage pour voir ses stats et éditer les overrides MJ.' },
  'gm.npc':                       { en: 'NPC', fr: 'PNJ' },
  'gm.pc':                        { en: 'PC', fr: 'PJ' },
  'gm.quick_stats':               { en: 'Quick Stats (read-only)', fr: 'Stats rapides (lecture seule)' },
  'gm.active_features':           { en: 'active features', fr: 'capacités actives' },
  'gm.overrides':                 { en: 'GM override(s)', fr: 'override(s) MJ' },
  'gm.per_char_overrides':        { en: 'Per-Character GM Overrides', fr: 'Overrides MJ par personnage' },
  'gm.override_help':             { en: 'Array of ActiveFeatureInstance objects applied LAST in the resolution chain. Each entry needs instanceId, featureId, isActive.', fr: 'Tableau d\'objets ActiveFeatureInstance appliqués EN DERNIER dans la chaîne de résolution. Chaque entrée nécessite instanceId, featureId, isActive.' },
  'gm.must_be_json_array':        { en: 'Must be a JSON array.', fr: 'Doit être un tableau JSON.' },
  'gm.invalid_json':              { en: 'Invalid JSON', fr: 'JSON invalide' },
  'gm.valid_json':                { en: 'Valid JSON', fr: 'JSON valide' },
  'gm.saved':                     { en: 'Saved!', fr: 'Enregistré !' },
  'gm.saved_locally':             { en: 'Saved locally (API unavailable).', fr: 'Enregistré localement (API indisponible).' },
  'gm.saving':                    { en: 'Saving…', fr: 'Enregistrement…' },
  'gm.save_overrides':            { en: 'Save Overrides', fr: 'Enregistrer les overrides' },
  'gm.syntax_error':              { en: 'Syntax error:', fr: 'Erreur de syntaxe :' },
  'gm.level_prefix':              { en: 'Lv.', fr: 'Nv.' },
  'gm.override_count':            { en: 'override(s)', fr: 'override(s)' },
  'gm.view':                      { en: 'GM View', fr: 'Vue MJ' },

  // ==========================================================================
  // CORE TAB — BASIC INFO
  // ==========================================================================
  'core.basic_info':              { en: 'Basic Information', fr: 'Informations générales' },
  'core.character_name':          { en: 'Character Name', fr: 'Nom du personnage' },
  'core.player_name':             { en: 'Player Name', fr: 'Nom du joueur' },
  'core.character_name_placeholder': { en: 'e.g. Thorin Ironforge', fr: 'ex. Thorin Forgefer' },
  'core.player_name_placeholder': { en: 'e.g. Alice, Bob…', fr: 'ex. Alice, Bob…' },
  'core.race':                    { en: 'Race', fr: 'Race' },
  'core.class':                   { en: 'Class', fr: 'Classe' },
  'core.deity':                   { en: 'Deity', fr: 'Divinité' },
  'core.alignment':               { en: 'Alignment', fr: 'Alignement' },
  'core.none':                    { en: '— None —', fr: '— Aucun —' },
  'core.select':                  { en: '— Select —', fr: '— Choisir —' },
  'core.level_in':                { en: 'Level in', fr: 'Niveau dans' },
  'core.recommended':             { en: 'Recommended:', fr: 'Recommandé :' },
  'core.show_details':            { en: 'Show details', fr: 'Voir les détails' },
  'core.no_deities':              { en: 'No deities loaded. Enable a rule source with deity data.', fr: 'Aucune divinité chargée. Activez une source de règles contenant des divinités.' },
  'core.choices':                 { en: 'Choices', fr: 'Choix' },
  'core.up_to':                   { en: 'up to', fr: 'jusqu\'à' },
  'core.no_options':              { en: 'No options matching', fr: 'Aucune option correspondant à' },

  // ==========================================================================
  // ABILITIES TAB
  // ==========================================================================
  'abilities.title':              { en: 'Ability Scores', fr: 'Caractéristiques' },
  'abilities.point_buy':          { en: 'Point Buy', fr: 'Achat par points' },
  'abilities.roll_stats':         { en: 'Roll Stats', fr: 'Lancer les dés' },
  'abilities.base':               { en: 'Base', fr: 'Base' },
  'abilities.total':              { en: 'Total', fr: 'Total' },
  'abilities.mod':                { en: 'Mod', fr: 'Mod' },
  'abilities.temp':               { en: 'Temp', fr: 'Temp' },
  'abilities.recommended_for':    { en: 'Recommended for your class', fr: 'Recommandé pour votre classe' },
  'abilities.check':              { en: 'Check', fr: 'Test' },
  'abilities.show_breakdown':     { en: 'Show modifier breakdown', fr: 'Voir le détail des modificateurs' },
  'abilities.temp_tooltip':       { en: 'Temporary modifier (buff/curse)', fr: 'Modificateur temporaire (bonus/malédiction)' },
  'abilities.point_buy_tooltip':  { en: 'Point Buy stat generation wizard', fr: 'Assistant de création par achat de points' },
  'abilities.roll_stats_tooltip': { en: 'Roll Stats wizard (4d6 drop lowest)', fr: 'Assistant de lancer de dés (4d6, retire le plus bas)' },

  // ==========================================================================
  // SAVING THROWS
  // ==========================================================================
  'saves.title':                  { en: 'Saving Throws', fr: 'Jets de sauvegarde' },
  'saves.base':                   { en: 'Base', fr: 'Base' },
  'saves.mods':                   { en: 'Mods', fr: 'Mods' },
  'saves.temp':                   { en: 'Temp', fr: 'Temp' },
  'saves.show_breakdown':         { en: 'Show breakdown', fr: 'Voir le détail' },
  'saves.roll':                   { en: 'Roll saving throw', fr: 'Lancer le jet de sauvegarde' },
  'saves.save':                   { en: 'Save', fr: 'Sauvegarde' },

  // ==========================================================================
  // SKILLS MATRIX
  // ==========================================================================
  'skills.title':                 { en: 'Skills Matrix', fr: 'Matrice de compétences' },
  'skills.sp':                    { en: 'SP:', fr: 'PC :' },
  'skills.no_skills':             { en: 'No skills loaded.', fr: 'Aucune compétence chargée.' },
  'skills.enable_source':         { en: 'Enable a rule source with skill definitions.', fr: 'Activez une source de règles avec des définitions de compétences.' },
  'skills.col_skill':             { en: 'Skill', fr: 'Compétence' },
  'skills.col_total':             { en: 'Total', fr: 'Total' },
  'skills.col_ability':           { en: 'Ability', fr: 'Carac.' },
  'skills.col_ranks':             { en: 'Ranks', fr: 'Rangs' },
  'skills.col_cost':              { en: 'Cost', fr: 'Coût' },
  'skills.col_max':               { en: 'Max', fr: 'Max' },
  'skills.training_required':     { en: 'T', fr: 'F' },
  'skills.class_skill':           { en: 'Class Skill', fr: 'Compétence de classe' },
  'skills.cross_class':           { en: 'Cross-class Skill', fr: 'Compétence hors classe' },
  'skills.cross_class_short':     { en: 'Cross-class', fr: 'Hors classe' },
  'skills.rank_locked':           { en: 'Min', fr: 'Min' },
  'skills.rank_locked_tooltip':   { en: 'Minimum rank — skill points spent at a committed level-up cannot be refunded.', fr: 'Rang minimum — les points de compétence dépensés lors d\'un gain de niveau validé ne peuvent pas être remboursés.' },
  'skills.journal_btn':           { en: 'Journal', fr: 'Journal' },
  'skills.journal_tooltip':       { en: 'Open the leveling journal — explains which class contributed which skill points, BAB, and saves.', fr: 'Ouvrir le journal de progression — explique quels points de compétence, BBA et jets de sauvegarde viennent de chaque classe.' },

  // ==========================================================================
  // LEVELING JOURNAL MODAL
  // ==========================================================================
  'journal.title':                { en: 'Leveling Journal', fr: 'Journal de progression' },
  'journal.subtitle':             { en: 'Per-class contribution breakdown', fr: 'Répartition des contributions par classe' },
  'journal.no_classes':           { en: 'No classes active. Add a class on the Core tab to begin.', fr: 'Aucune classe active. Ajoutez une classe dans l\'onglet Principal pour commencer.' },
  'journal.class_level':          { en: 'Level', fr: 'Niveau' },
  'journal.bab':                  { en: 'BAB', fr: 'BBA' },
  'journal.fort':                 { en: 'Fort', fr: 'Vig.' },
  'journal.ref':                  { en: 'Ref', fr: 'Réf.' },
  'journal.will':                 { en: 'Will', fr: 'Vol.' },
  'journal.skill_points':         { en: 'SP', fr: 'PC' },
  'journal.sp_formula':           { en: '{base} SP/lv', fr: '{base} PC/nv' },
  'journal.sp_with_int':          { en: '({base}+INT{int:+}) × {lvl} = {total}', fr: '({base}+INT{int:+}) × {lvl} = {total}' },
  'journal.sp_note':              { en: '× {lvl} levels', fr: '× {lvl} niveaux' },
  'journal.class_skills_title':   { en: 'Class Skills', fr: 'Compétences de classe' },
  'journal.class_skills_none':    { en: 'None declared', fr: 'Aucune déclarée' },
  'journal.features_title':       { en: 'Features Granted (up to level {lvl})', fr: 'Capacités obtenues (jusqu\'au niveau {lvl})' },
  'journal.features_none':        { en: 'No features', fr: 'Aucune capacité' },
  'journal.totals_row':           { en: 'Totals', fr: 'Totaux' },
  'journal.bonus_sp':             { en: 'Bonus SP/lv (racial/feat): +{bonus}', fr: 'PC bonus/nv (racial/don) : +{bonus}' },
  'journal.multiclass_warning':   { en: 'Multiclass XP penalty may apply if classes differ by more than 1 level (SRD rule).', fr: 'Une pénalité d\'XP multiclasse peut s\'appliquer si les classes diffèrent de plus d\'un niveau (règle du MR).' },
  'journal.lock_ranks_btn':       { en: 'Lock Current Ranks', fr: 'Verrouiller les rangs' },
  'journal.lock_ranks_tooltip':   { en: 'Lock current skill ranks as the minimum floor — simulates committing a level-up.', fr: 'Verrouille les rangs actuels comme plancher minimum — simule la validation d\'un gain de niveau.' },
  'journal.unlock_ranks_btn':     { en: 'Unlock Ranks', fr: 'Déverrouiller les rangs' },
  'journal.unlock_ranks_tooltip': { en: 'Remove all rank minimums — allow free reallocation (only for character creation).', fr: 'Supprime tous les minima de rangs — autorise la réallocation libre (création de personnage seulement).' },
  'journal.sp_first_level_note':  { en: 'The first class taken at character level 1 receives 4× the normal SP for that level (D&D 3.5 SRD). This bonus is already included in the totals above.', fr: 'La première classe prise au niveau 1 du personnage reçoit 4× les PC normaux pour ce niveau (SRD D&D 3.5). Ce bonus est déjà inclus dans les totaux ci-dessus.' },

  // ==========================================================================
  // COMBAT TAB — HIT POINTS & XP
  // ==========================================================================
  'combat.hp.title':              { en: 'Hit Points', fr: 'Points de vie' },
  'combat.hp.con_contrib':        { en: 'CON contrib:', fr: 'Contrib. CON :' },
  'combat.hp.current':            { en: 'Current', fr: 'Actuels' },
  'combat.hp.max':                { en: 'Max', fr: 'Max' },
  'combat.hp.temp':               { en: '+Temp', fr: '+Temp' },
  'combat.hp.heal':               { en: 'Heal', fr: 'Soigner' },
  'combat.hp.damage':             { en: 'Damage', fr: 'Dégâts' },
  'combat.hp.add_temp':           { en: '+ Temp', fr: '+ Temp' },
  'combat.hp.unknown':            { en: 'Unknown', fr: 'Inconnu' },
  'combat.hp.dead':               { en: 'Dead', fr: 'Mort' },
  'combat.hp.dying':              { en: 'Dying', fr: 'Agonisant' },
  'combat.hp.unconscious':        { en: 'Unconscious', fr: 'Inconscient' },
  'combat.hp.bloodied':           { en: 'Bloodied', fr: 'Blessé' },
  'combat.hp.injured':            { en: 'Injured', fr: 'Touché' },
  'combat.hp.healthy':            { en: 'Healthy', fr: 'En forme' },
  'combat.xp.title':              { en: 'Experience', fr: 'Expérience' },
  'combat.xp.level':              { en: 'Level', fr: 'Niveau' },
  'combat.xp.xp_separator':      { en: 'XP /', fr: 'XP /' },
  'combat.xp.xp':                { en: 'XP', fr: 'XP' },
  'combat.xp.to_next':           { en: 'XP to next level', fr: 'XP pour le prochain niveau' },
  'combat.xp.add_placeholder':   { en: 'Add XP…', fr: 'Ajouter XP…' },
  'combat.xp.award':             { en: '+ Award XP', fr: '+ Donner XP' },
  'combat.xp.level_up':          { en: 'Level Up!', fr: 'Niveau supérieur !' },
  'combat.xp.config_hint':       { en: 'Load config_xp_thresholds for accurate XP thresholds.', fr: 'Chargez config_xp_thresholds pour des seuils d\'XP précis.' },

  // ==========================================================================
  // COMBAT TAB — ARMOR CLASS
  // ==========================================================================
  'combat.ac.title':              { en: 'Armor Class', fr: 'Classe d\'armure' },
  'combat.ac.temp_mod':           { en: 'Temp Mod', fr: 'Mod Temp' },
  'combat.ac.normal':             { en: 'AC', fr: 'CA' },
  'combat.ac.touch':              { en: 'Touch', fr: 'Contact' },
  'combat.ac.flat':               { en: 'Flat', fr: 'Pris au dépourvu' },
  'combat.ac.normal_desc':        { en: 'Normal Armor Class', fr: 'Classe d\'armure normale' },
  'combat.ac.touch_desc':         { en: 'Touch AC (ignores armor/shield/natural armor)', fr: 'CA de contact (ignore armure/bouclier/armure naturelle)' },
  'combat.ac.flat_desc':          { en: 'Flat-Footed AC (ignores DEX/dodge)', fr: 'CA pris au dépourvu (ignore DEX/esquive)' },
  'combat.ac.temp_label':         { en: 'temp', fr: 'temp' },

  // ==========================================================================
  // COMBAT TAB — CORE COMBAT
  // ==========================================================================
  'combat.core.title':            { en: 'Core Combat', fr: 'Combat de base' },
  'combat.core.bab':              { en: 'BAB', fr: 'BBA' },
  'combat.core.initiative':       { en: 'Initiative', fr: 'Initiative' },
  'combat.core.grapple':          { en: 'Grapple', fr: 'Lutte' },
  'combat.core.bab_desc':         { en: 'Base Attack Bonus', fr: 'Bonus de base à l\'attaque' },
  'combat.core.initiative_desc':  { en: 'Initiative modifier (DEX + misc)', fr: 'Modificateur d\'initiative (DEX + divers)' },
  'combat.core.grapple_desc':     { en: 'Grapple modifier (BAB + STR + size)', fr: 'Modificateur de lutte (BBA + FOR + taille)' },
  'combat.core.initiative_roll':  { en: 'Initiative Roll', fr: 'Jet d\'initiative' },
  'combat.core.grapple_check':    { en: 'Grapple Check', fr: 'Test de lutte' },
  'combat.core.breakdown':        { en: 'Breakdown', fr: 'Détail' },
  'combat.core.roll':             { en: 'Roll', fr: 'Lancer' },

  // ==========================================================================
  // COMBAT TAB — ATTACKS
  // ==========================================================================
  'combat.attacks.title':         { en: 'Weapons & Attacks', fr: 'Armes & Attaques' },
  'combat.attacks.main_hand':     { en: 'Main Hand', fr: 'Main principale' },
  'combat.attacks.unarmed':       { en: 'Unarmed', fr: 'À mains nues' },
  'combat.attacks.atk':           { en: 'ATK:', fr: 'ATQ :' },
  'combat.attacks.dmg':           { en: 'DMG:', fr: 'DGT :' },
  'combat.attacks.crit':          { en: 'Crit:', fr: 'Crit :' },
  'combat.attacks.attack':        { en: 'Attack', fr: 'Attaque' },
  'combat.attacks.damage':        { en: 'Damage', fr: 'Dégâts' },

  // ==========================================================================
  // COMBAT TAB — MOVEMENT
  // ==========================================================================
  'combat.movement.title':        { en: 'Movement Speeds', fr: 'Vitesses de déplacement' },
  'combat.movement.penalty_note': { en: 'Armor & encumbrance penalties applied via pipeline modifiers.', fr: 'Pénalités d\'armure et d\'encombrement appliquées via les modificateurs de pipeline.' },
  'combat.movement.penalty_title': { en: 'Penalty from armor or encumbrance', fr: 'Pénalité d\'armure ou d\'encombrement' },

  // ==========================================================================
  // COMBAT TAB — RESISTANCES
  // ==========================================================================
  'combat.resistances.title':     { en: 'Resistances', fr: 'Résistances' },
  'combat.resistances.fire':      { en: 'Fire', fr: 'Feu' },
  'combat.resistances.cold':      { en: 'Cold', fr: 'Froid' },
  'combat.resistances.acid':      { en: 'Acid', fr: 'Acide' },
  'combat.resistances.electricity': { en: 'Electricity', fr: 'Électricité' },
  'combat.resistances.sonic':     { en: 'Sonic', fr: 'Son' },
  'combat.resistances.sr':        { en: 'SR', fr: 'RM' },
  'combat.resistances.pr':        { en: 'PR', fr: 'RP' },
  'combat.resistances.fort':      { en: 'Fort.', fr: 'Fort.' },
  'combat.resistances.misc':      { en: 'Misc modifier', fr: 'Modificateur divers' },

  // ==========================================================================
  // COMBAT TAB — DAMAGE REDUCTION
  // ==========================================================================
  'combat.dr.title':              { en: 'Damage Reduction', fr: 'Réduction de dégâts' },
  'combat.dr.empty':              { en: 'No Damage Reduction configured.', fr: 'Aucune réduction de dégâts configurée.' },
  'combat.dr.add':                { en: 'Add DR', fr: 'Ajouter RD' },
  'combat.dr.value':              { en: 'Value', fr: 'Valeur' },
  'combat.dr.bypassed_by':        { en: 'Bypassed By', fr: 'Contournée par' },

  // ==========================================================================
  // INVENTORY — ENCUMBRANCE
  // ==========================================================================
  'inventory.encumbrance.title':  { en: 'Encumbrance & Wealth', fr: 'Encombrement & Richesse' },
  'inventory.encumbrance.carried': { en: 'carried', fr: 'porté' },
  'inventory.encumbrance.light':  { en: 'Light', fr: 'Légère' },
  'inventory.encumbrance.medium': { en: 'Medium', fr: 'Moyenne' },
  'inventory.encumbrance.heavy':  { en: 'Heavy', fr: 'Lourde' },
  'inventory.encumbrance.max':    { en: 'Max', fr: 'Max' },
  'inventory.encumbrance.light_lte': { en: 'Light ≤', fr: 'Légère ≤' },
  'inventory.encumbrance.medium_lte': { en: 'Medium ≤', fr: 'Moyenne ≤' },
  'inventory.encumbrance.heavy_lte': { en: 'Heavy ≤', fr: 'Lourde ≤' },
  'inventory.encumbrance.speed_warning': { en: '— speed reduced, check penalties apply', fr: '— vitesse réduite, pénalités de test actives' },
  'inventory.encumbrance.coin_weight': { en: 'Coins add:', fr: 'Poids pièces :' },
  'inventory.encumbrance.wealth': { en: 'Wealth', fr: 'Richesse' },
  'inventory.encumbrance.total':  { en: 'Total', fr: 'Total' },
  'inventory.encumbrance.gp':     { en: 'GP', fr: 'PO' },
  'inventory.encumbrance.config_hint': { en: 'Load config_carrying_capacity for accurate weight limits.', fr: 'Chargez config_carrying_capacity pour des limites précises.' },
  'inventory.encumbrance.tier_unknown':     { en: 'Unknown', fr: 'Inconnu' },
  'inventory.encumbrance.tier_overloaded':  { en: 'Overloaded', fr: 'Surchargé' },
  'inventory.encumbrance.tier_heavy':       { en: 'Heavy Load', fr: 'Charge lourde' },
  'inventory.encumbrance.tier_medium':      { en: 'Medium Load', fr: 'Charge moyenne' },
  'inventory.encumbrance.tier_light':       { en: 'Light Load', fr: 'Charge légère' },
  'inventory.coins.pp':           { en: 'PP', fr: 'PP' },
  'inventory.coins.gp':           { en: 'GP', fr: 'PO' },
  'inventory.coins.sp':           { en: 'SP', fr: 'PA' },
  'inventory.coins.cp':           { en: 'CP', fr: 'PC' },
  'inventory.coins.pp_title':     { en: 'Platinum Pieces', fr: 'Pièces de platine' },
  'inventory.coins.gp_title':     { en: 'Gold Pieces', fr: 'Pièces d\'or' },
  'inventory.coins.sp_title':     { en: 'Silver Pieces', fr: 'Pièces d\'argent' },
  'inventory.coins.cp_title':     { en: 'Copper Pieces', fr: 'Pièces de cuivre' },

  // ==========================================================================
  // FEATS TAB
  // ==========================================================================
  'feats.title':                  { en: 'Feats', fr: 'Dons' },
  'feats.available':              { en: 'Available:', fr: 'Disponibles :' },
  'feats.remaining':              { en: 'Remaining:', fr: 'Restants :' },
  'feats.add':                    { en: 'Add Feat', fr: 'Ajouter un don' },
  'feats.granted':                { en: 'Granted Feats (automatic)', fr: 'Dons acquis (automatiques)' },
  'feats.from':                   { en: 'from:', fr: 'source :' },
  'feats.selected':               { en: 'Selected Feats', fr: 'Dons sélectionnés' },
  'feats.empty':                  { en: 'No feats selected yet. Click "+ Add Feat" to choose from the catalog.', fr: 'Aucun don sélectionné. Cliquez sur « + Ajouter un don » pour choisir dans le catalogue.' },
  'feats.slots_available':        { en: 'slot(s) available.', fr: 'emplacement(s) disponible(s).' },
  'feats.remove_tooltip':         { en: 'Remove this feat (frees a slot)', fr: 'Retirer ce don (libère un emplacement)' },
  'feats.unknown_source':         { en: 'Unknown', fr: 'Inconnu' },

  // ==========================================================================
  // FEAT CATALOG MODAL
  // ==========================================================================
  'feat_catalog.title':           { en: 'Feat Catalog', fr: 'Catalogue de dons' },
  'feat_catalog.slots_left':      { en: 'slot(s) left', fr: 'emplacement(s) restant(s)' },
  'feat_catalog.feats_found':     { en: 'feat(s) found', fr: 'don(s) trouvé(s)' },
  'feat_catalog.search':          { en: 'Search feats…', fr: 'Rechercher des dons…' },
  'feat_catalog.all_tags':        { en: 'All tags', fr: 'Tous les tags' },
  'feat_catalog.empty':           { en: 'Load a rule source with feats to populate this catalog.', fr: 'Chargez une source de règles contenant des dons pour remplir ce catalogue.' },
  'feat_catalog.have':            { en: 'Have', fr: 'Acquis' },
  'feat_catalog.select':          { en: 'Select', fr: 'Choisir' },
  'feat_catalog.prereqs_met':     { en: 'prerequisites met', fr: 'prérequis remplis' },
  'feat_catalog.prereqs_not_met': { en: 'prerequisites not met', fr: 'prérequis non remplis' },
  'feat_catalog.already_have':    { en: 'Already have this feat', fr: 'Don déjà acquis' },
  'feat_catalog.cannot_select':   { en: 'Cannot select: prerequisites not met', fr: 'Impossible : prérequis non remplis' },

  // ==========================================================================
  // EPHEMERAL EFFECTS PANEL (Phase E-3)
  // Active effects created by consuming potions, oils, and one-shot items.
  // ==========================================================================
  'effects.panel.title':          { en: 'Active Effects', fr: 'Effets actifs' },
  'effects.panel.empty':          { en: 'No active effects. Drink a potion or use an ability to see effects here.', fr: 'Aucun effet actif. Buvez une potion ou utilisez une capacité pour voir les effets ici.' },
  'effects.panel.expire':         { en: 'Expire', fr: 'Dissiper' },
  'effects.panel.expire_tooltip': { en: 'End this effect early', fr: 'Terminer cet effet prématurément' },
  'effects.panel.duration':       { en: 'Duration:', fr: 'Durée :' },
  'effects.panel.applied_round':  { en: 'Applied at round', fr: 'Appliqué au round' },
  'effects.panel.source':         { en: 'Source:', fr: 'Source :' },
  'effects.panel.active_badge':   { en: 'Active', fr: 'Actif' },
  'effects.panel.confirm_expire': { en: 'End this effect?', fr: 'Terminer cet effet ?' },

  // Inventory "Use" button for consumables
  'inventory.use_item':           { en: 'Use', fr: 'Utiliser' },
  'inventory.drink_potion':       { en: 'Drink', fr: 'Boire' },
  'inventory.apply_oil':          { en: 'Apply', fr: 'Appliquer' },
  'inventory.consumable_badge':   { en: 'Consumable', fr: 'Consommable' },

  // ==========================================================================
  // MAGIC TAB
  // ==========================================================================
  'magic.abilities.title':        { en: 'Special Abilities', fr: 'Capacités spéciales' },
  'magic.abilities.empty':        { en: 'No special abilities found. Class and domain abilities with activation types will appear here.', fr: 'Aucune capacité spéciale trouvée. Les capacités de classe et de domaine avec un type d\'activation apparaîtront ici.' },
  'magic.abilities.cost':         { en: 'Cost:', fr: 'Coût :' },
  'magic.abilities.use':          { en: 'Use', fr: 'Utiliser' },
  'magic.casting.title':          { en: 'Spells & Powers', fr: 'Sorts & Pouvoirs' },
  'magic.casting.empty':          { en: 'No spells known. Use the Grimoire to learn spells.', fr: 'Aucun sort connu. Utilisez le Grimoire pour apprendre des sorts.' },
  'magic.casting.cantrips':       { en: 'Cantrips (0)', fr: 'Tours de magie (0)' },
  'magic.casting.level':          { en: 'Level', fr: 'Niveau' },
  'magic.casting.save_dc':        { en: 'Save DC:', fr: 'DD Sauveg. :' },
  'magic.casting.cast':           { en: 'Cast', fr: 'Lancer' },
  'magic.casting.damage':         { en: 'Damage', fr: 'Dégâts' },
  'magic.grimoire.title':         { en: 'Grimoire — Spell Catalog', fr: 'Grimoire — Catalogue de sorts' },
  'magic.grimoire.cl':            { en: 'CL', fr: 'NLS' },
  'magic.grimoire.max_level':     { en: 'Max Lvl', fr: 'Niv. max' },
  'magic.grimoire.search':        { en: 'Search spells…', fr: 'Rechercher des sorts…' },
  'magic.grimoire.no_class':      { en: 'Select a spellcasting class to see its spell list.', fr: 'Sélectionnez une classe de lanceur de sorts pour voir sa liste.' },
  'magic.grimoire.no_match':      { en: 'no spells match the current filters.', fr: 'aucun sort ne correspond aux filtres actuels.' },
  'magic.grimoire.lvl':           { en: 'Lvl', fr: 'Niv' },
  'magic.grimoire.known':         { en: 'Known', fr: 'Connu' },
  'magic.grimoire.learn':         { en: 'Learn', fr: 'Apprendre' },

  // ==========================================================================
  // MODIFIER BREAKDOWN MODAL
  // ==========================================================================
  'breakdown.title_suffix':       { en: '— Breakdown', fr: '— Détail' },
  'breakdown.base_value':         { en: 'Base value', fr: 'Valeur de base' },
  'breakdown.suppressed':         { en: 'Suppressed (stacking rules)', fr: 'Supprimés (règles de cumul)' },
  'breakdown.base':               { en: 'Base', fr: 'Base' },
  'breakdown.modifiers':          { en: 'Modifiers', fr: 'Modificateurs' },
  'breakdown.derived_mod':        { en: '→ Mod:', fr: '→ Mod :' },
  'breakdown.situational':        { en: 'Situational (applied at roll time)', fr: 'Situationnels (appliqués au lancer)' },
  'breakdown.vs':                 { en: 'vs.', fr: 'c.' },
  'breakdown.conditional':        { en: 'Conditional', fr: 'Conditionnel' },

  // ==========================================================================
  // DICE ROLL MODAL
  // ==========================================================================
  'dice.target_tags':             { en: 'Target Tags', fr: 'Tags de cible' },
  'dice.situational_available':   { en: 'situational bonus(es) available', fr: 'bonus situationnel(s) disponible(s)' },
  'dice.tags_placeholder':        { en: 'e.g. orc, evil, undead', fr: 'ex. orque, mauvais, mort-vivant' },
  'dice.rolling':                 { en: 'Rolling...', fr: 'Lancer en cours...' },
  'dice.roll_again':              { en: 'Roll Again', fr: 'Relancer' },
  'dice.roll':                    { en: 'Roll!', fr: 'Lancer !' },
  'dice.critical_threat':         { en: 'CRITICAL THREAT!', fr: 'MENACE DE CRITIQUE !' },
  'dice.fumble':                  { en: 'FUMBLE!', fr: 'ÉCHEC CRITIQUE !' },
  'dice.result':                  { en: 'Result', fr: 'Résultat' },
  'dice.explosion':               { en: 'EXPLOSION', fr: 'EXPLOSION' },
  'dice.dice_rolls':              { en: 'Dice rolls', fr: 'Lancers de dés' },
  'dice.natural_total':           { en: 'Natural total', fr: 'Total naturel' },
  'dice.static_bonus':            { en: 'Static bonus', fr: 'Bonus statique' },
  'dice.situational_bonus':       { en: 'Situational bonus', fr: 'Bonus situationnel' },
  'dice.final_total':             { en: 'Final Total', fr: 'Total final' },
  'dice.exploding_active':        { en: 'Exploding 20s active', fr: '20 explosifs actifs' },

  // ==========================================================================
  // COMMON / SHARED
  // ==========================================================================
  'common.cancel':                { en: 'Cancel', fr: 'Annuler' },
  'common.save':                  { en: 'Save', fr: 'Enregistrer' },
  'common.campaign':              { en: 'Campaign', fr: 'Campagne' },
  'common.level':                 { en: 'Level', fr: 'Niveau' },
  'common.unknown':               { en: 'Unknown', fr: 'Inconnu' },
  'common.gm':                    { en: 'GM', fr: 'MJ' },
  'common.player':                { en: 'Player', fr: 'Joueur' },

  // ==========================================================================
  // PREREQUISITE STATUS (for runtime re-validation)
  // ==========================================================================
  'prereq.disabled':              { en: 'Prerequisites no longer met — effects suspended', fr: 'Prérequis non remplis — effets suspendus' },

  // ==========================================================================
  // ECL / LEVEL ADJUSTMENT (Engine Extension A — Phase 1.5)
  // ==========================================================================
  'ecl.title':                    { en: 'Level Adjustment', fr: 'Ajustement de niveau' },
  'ecl.la_label':                 { en: 'LA', fr: 'AN' },
  'ecl.ecl_label':                { en: 'ECL', fr: 'NCE' },
  'ecl.xp_label':                 { en: 'XP', fr: 'XP' },
  'ecl.la_tooltip':               { en: 'Level Adjustment — racial balance surcharge. ECL = class levels + LA.', fr: 'Ajustement de niveau — surcoût racial. NCE = niveaux de classe + AN.' },
  'ecl.ecl_tooltip':              { en: 'Effective Character Level — used for XP thresholds.', fr: 'Niveau de personnage effectif — utilisé pour les seuils d\'XP.' },
  'ecl.reduce_la':                { en: 'Reduce LA', fr: 'Réduire AN' },
  'ecl.reduce_la_tooltip':        { en: 'Pay XP to reduce LA by 1 (requires 3× LA class levels — SRD variant rule).', fr: 'Payez des XP pour réduire l\'AN de 1 (nécessite 3× AN en niveaux de classe).' },
  'ecl.reduce_la_confirm':        { en: 'Reduce Level Adjustment from {current} to {next}?', fr: 'Réduire l\'ajustement de niveau de {current} à {next} ?' },
  'ecl.xp_bar_label':             { en: 'XP to next level', fr: 'XP jusqu\'au prochain niveau' },

  // ==========================================================================
  // FAST HEALING / REGENERATION — per_turn pools (Engine Extension B — Phase 1.6 / 3.6)
  // ==========================================================================
  'heal.fast_healing':            { en: 'Fast Healing', fr: 'Guérison accélérée' },
  'heal.regeneration':            { en: 'Regeneration', fr: 'Régénération' },
  'heal.tick_button':             { en: 'Start Turn', fr: 'Début de tour' },
  'heal.tick_tooltip':            { en: 'Apply per-turn healing (Fast Healing / Regeneration) for this character\'s turn.', fr: 'Appliquer la guérison par tour (Guérison accélérée / Régénération) au début du tour.' },
  'heal.per_turn_badge':          { en: '+{n}/turn', fr: '+{n}/tour' },
  'heal.per_round_badge':         { en: '+{n}/round', fr: '+{n}/round' },
  'heal.encounter_reset':         { en: 'New Encounter', fr: 'Nouveau combat' },
  'heal.long_rest':               { en: 'Long Rest', fr: 'Repos long' },
  'heal.short_rest':              { en: 'Short Rest', fr: 'Repos court' },

  // ==========================================================================
  // DAMAGE REDUCTION — drBypassTags (Engine Extension C — Phase 2.4a)
  // ==========================================================================
  'dr.groups_title':              { en: 'Active DR', fr: 'RD active' },
  'dr.bypass_label':              { en: 'Bypassed by:', fr: 'Contournable par :' },
  'dr.none_bypass':               { en: '— (nothing)', fr: '— (rien)' },
  'dr.suppressed':                { en: 'Suppressed (lower value)', fr: 'Supprimée (valeur inférieure)' },
  'dr.add_innate':                { en: 'Add Innate DR', fr: 'Ajouter une RD innée' },
  'dr.base_class_label':          { en: 'Class DR (additive):', fr: 'RD de classe (additive) :' },
  'dr.innate_label':              { en: 'Innate / Racial DR:', fr: 'RD innée / raciale :' },

  // ==========================================================================
  // PSIONIC POWERS — discipline / displays (Engine Extension D — Phase 1.3a)
  // ==========================================================================
  'psi.discipline_label':         { en: 'Discipline', fr: 'Discipline' },
  'psi.displays_label':           { en: 'Displays', fr: 'Manifestations' },
  'psi.suppress_displays':        { en: 'Suppress Displays', fr: 'Supprimer manifestations' },
  'psi.suppress_dc':              { en: 'DC {dc}', fr: 'DD {dc}' },
  'psi.pp_cost':                  { en: '{pp} PP', fr: '{pp} PM' },
  'psi.discipline.clairsentience':  { en: 'Clairsentience', fr: 'Clairsentience' },
  'psi.discipline.metacreativity': { en: 'Metacreativity', fr: 'Métacréativité' },
  'psi.discipline.psychokinesis':  { en: 'Psychokinesis', fr: 'Psychokinésie' },
  'psi.discipline.psychometabolism': { en: 'Psychometabolism', fr: 'Psychométabolisme' },
  'psi.discipline.psychoportation': { en: 'Psychoportation', fr: 'Psychoportation' },
  'psi.discipline.telepathy':      { en: 'Telepathy', fr: 'Télépathie' },
  'psi.display.auditory':         { en: 'Aud', fr: 'Aud' },
  'psi.display.material':         { en: 'Mat', fr: 'Mat' },
  'psi.display.mental':           { en: 'Men', fr: 'Men' },
  'psi.display.olfactory':        { en: 'Olf', fr: 'Olf' },
  'psi.display.visual':           { en: 'Vis', fr: 'Vis' },
  'psi.filter_discipline':        { en: 'Filter by discipline', fr: 'Filtrer par discipline' },
  'psi.all_disciplines':          { en: 'All disciplines', fr: 'Toutes les disciplines' },

  // ==========================================================================
  // PSIONIC ITEMS (Engine Extension E — Phase 1.3b)
  // ==========================================================================
  'psionic_item.cognizance_crystal': { en: 'Cognizance Crystal', fr: 'Cristal de cognizance' },
  'psionic_item.dorje':              { en: 'Dorje', fr: 'Dorjé' },
  'psionic_item.power_stone':        { en: 'Power Stone', fr: 'Pierre mentale' },
  'psionic_item.psicrown':           { en: 'Psicrown', fr: 'Psicouronne' },
  'psionic_item.psionic_tattoo':     { en: 'Psionic Tattoo', fr: 'Tatouage psionique' },
  'psionic_item.stored_pp':          { en: '{pp} / {max} PP', fr: '{pp} / {max} PM' },
  'psionic_item.charges':            { en: '{n} / {max} charges', fr: '{n} / {max} charges' },
  'psionic_item.attuned':            { en: 'Attuned', fr: 'Accordé' },
  'psionic_item.not_attuned':        { en: 'Not attuned (10 min.)', fr: 'Non accordé (10 min.)' },
  'psionic_item.attune_button':      { en: 'Attune', fr: 'Accorder' },
  'psionic_item.activated':          { en: 'Used', fr: 'Utilisé' },
  'psionic_item.activate_button':    { en: 'Activate Tattoo', fr: 'Activer tatouage' },
  'psionic_item.use_charge':         { en: 'Use', fr: 'Utiliser' },
  'psionic_item.manifest_from_crown': { en: 'Manifest', fr: 'Manifester' },
  'psionic_item.draw_pp':            { en: 'Draw {pp} PP', fr: 'Puiser {pp} PM' },
  'psionic_item.powers_known':       { en: 'Powers', fr: 'Pouvoirs' },
  'psionic_item.brainburn_risk':     { en: '⚠ Brainburn risk (ML check DC {dc})', fr: '⚠ Risque d\'incandescence (jet ML DD {dc})' },
  'psionic_item.power_flushed':      { en: 'Used up', fr: 'Consommé' },

  // ==========================================================================
  // ACTION BUDGET (Engine Extension F — Phase 1.3c)
  // ==========================================================================
  'action.budget_title':          { en: 'Actions This Turn', fr: 'Actions ce tour' },
  'action.standard':              { en: 'Standard', fr: 'Standard' },
  'action.move':                  { en: 'Move', fr: 'Déplacement' },
  'action.swift':                 { en: 'Swift', fr: 'Rapide' },
  'action.immediate':             { en: 'Immediate', fr: 'Immédiate' },
  'action.free':                  { en: 'Free', fr: 'Libre' },
  'action.full_round':            { en: 'Full Round', fr: 'Tour complet' },
  'action.blocked':               { en: 'Blocked by: {conditions}', fr: 'Bloqué par : {conditions}' },
  'action.spent':                 { en: 'Spent', fr: 'Dépensée' },
  'action.available':             { en: 'Available', fr: 'Disponible' },
  'action.spend_standard':        { en: 'Use Standard Action', fr: 'Utiliser action standard' },
  'action.spend_move':            { en: 'Use Move Action', fr: 'Utiliser action de déplacement' },
  'action.spend_full':            { en: 'Use Full-Round Action', fr: 'Utiliser action de tour complet' },
  'action.reset_turn':            { en: 'Reset Turn', fr: 'Réinitialiser le tour' },
  'action.xor_note':              { en: 'Standard OR Move — not both.', fr: 'Standard OU Déplacement — pas les deux.' },

  // ==========================================================================
  // VARIANT RULES (Engine Extensions G + H — Phase 2.5a / 2.5b)
  // ==========================================================================
  'variant.title':                { en: 'Variant Rules', fr: 'Règles variantes' },
  'variant.gestalt':              { en: 'Gestalt Characters', fr: 'Personnages gestalts' },
  'variant.gestalt_desc':         { en: 'Characters advance in two classes simultaneously. BAB and saves use the best progression each level (not additive).', fr: 'Les personnages progressent simultanément dans deux classes. BBA et jets de sauvegarde utilisent la meilleure progression par niveau (non additive).' },
  'variant.vitality_wound':       { en: 'Vitality & Wound Points', fr: 'Points de vitalité et de blessure' },
  'variant.vitality_wound_desc':  { en: 'Replaces HP with Vitality Points (normal hits) and Wound Points (critical hits). Critical damage goes directly to Wound Points.', fr: 'Remplace les PV par des Points de vitalité (touches normales) et Points de blessure (coups critiques). Les dégâts critiques vont directement aux Points de blessure.' },

  // ==========================================================================
  // VITALITY / WOUND POINTS (Engine Extension H — Phase 2.5b)
  // ==========================================================================
  'vwp.vitality_label':           { en: 'Vitality', fr: 'Vitalité' },
  'vwp.wound_label':              { en: 'Wounds', fr: 'Blessures' },
  'vwp.wound_dc_note':            { en: 'Fort save DC {dc} or stunned', fr: 'Save Vig DD {dc} ou étourdi' },
  'vwp.fatigued_note':            { en: 'First wound damage → Fatigued', fr: 'Premiers dégâts de blessure → Fatigué' },
  'vwp.damage_to':                { en: 'Damage → {pool}', fr: 'Dégâts → {pool}' },
  'vwp.pool_vitality':            { en: 'Vitality Points', fr: 'Points de vitalité' },
  'vwp.pool_wounds':              { en: 'Wound Points', fr: 'Points de blessure' },
  'vwp.pool_hp':                  { en: 'Hit Points', fr: 'Points de vie' },
  'dice.damage_routes_to':        { en: 'Routes to:', fr: 'Affecte :' },
  'dice.critical_wound':          { en: '→ WOUND POINTS', fr: '→ POINTS DE BLESSURE' },
  'dice.normal_vitality':         { en: '→ Vitality Points', fr: '→ Points de vitalité' },

  // ==========================================================================
  // LANGUAGE SELECTOR
  // ==========================================================================
  'lang.label':                   { en: 'Language', fr: 'Langue' },
  'lang.select_tooltip':          { en: 'Switch display language', fr: 'Changer la langue d\'affichage' },

  // Built-in language names (en + fr translations).
  // Community files may provide language codes not listed here; those will use
  // the code itself (e.g. "es") as their display label in the dropdown.
  'lang.en':                      { en: 'English', fr: 'Anglais' },
  'lang.fr':                      { en: 'French', fr: 'Français' },
  'lang.de':                      { en: 'German', fr: 'Allemand' },
  'lang.es':                      { en: 'Spanish', fr: 'Espagnol' },
  'lang.it':                      { en: 'Italian', fr: 'Italien' },
  'lang.pt':                      { en: 'Portuguese', fr: 'Portugais' },
  'lang.nl':                      { en: 'Dutch', fr: 'Néerlandais' },
  'lang.pl':                      { en: 'Polish', fr: 'Polonais' },
  'lang.cs':                      { en: 'Czech', fr: 'Tchèque' },
  'lang.ja':                      { en: 'Japanese', fr: 'Japonais' },
  'lang.ko':                      { en: 'Korean', fr: 'Coréen' },
  'lang.zh':                      { en: 'Chinese', fr: 'Chinois' },
};

// ---------------------------------------------------------------------------
// HELPER FUNCTION
// ---------------------------------------------------------------------------

/**
 * Resolves a UI chrome string by its registry key.
 *
 * @param key  - The dot-separated key from UI_STRINGS (e.g., 'combat.hp.title').
 * @param lang - The target language. If omitted, returns the English string.
 * @returns The localised string, or the key itself if not found (for debug visibility).
 *
 * @example
 * ui('combat.hp.title', 'fr') // → "Points de vie"
 * ui('combat.hp.title', 'en') // → "Hit Points"
 */
export function ui(key: string, lang: string = 'en'): string {
  const entry = UI_STRINGS[key];
  if (!entry) {
    console.warn(`[i18n] Missing UI string key: "${key}"`);
    return key;
  }
  return t(entry, lang);
}
