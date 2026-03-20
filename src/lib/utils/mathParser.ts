/**
 * @file mathParser.ts
 * @description Mathematical formula evaluator with @-path variable resolution and pipe operators.
 *
 * Design philosophy:
 *   In a Data-Driven ECS engine, formulas live in JSON files, not in TypeScript code.
 *   This parser is the bridge between those text-based formulas and computed numbers.
 *
 *   TWO MAIN RESPONSIBILITIES:
 *     1. VARIABLE RESOLUTION  (@-paths)
 *        Replaces `@`-prefixed dot-paths with values from the character context.
 *        Example: "@attributes.stat_str.derivedModifier" → 4 (if STR is 18)
 *
 *     2. MATH EVALUATION      (safe expression evaluation)
 *        Evaluates arithmetic expressions like "10 + floor(4 * 1.5)".
 *        NO eval() or Function() — uses a custom recursive descent parser for safety.
 *
 *   PIPE OPERATORS (|distance, |weight)
 *        After resolving a @-path, a pipe transforms the numeric result to a display string.
 *        Example: "@attributes.speed_land.totalValue|distance" → "30 ft." or "9 m"
 *        Pipes are used in JSON description strings for localised value display.
 *
 * IMPORTANT: This parser ONLY evaluates the mathematical result of a formula.
 *   It does NOT evaluate LogicNode conditions — that is handled by logicEvaluator.ts.
 *   It does NOT roll dice — that is handled by diceEngine.ts.
 *   When a formula contains dice notation like "1d8", it is returned AS-IS for the
 *   Dice Engine to consume later.
 *
 * CHARACTER CONTEXT:
 *   The parser receives a `CharacterContext` object containing all resolved pipeline
 *   values. This is built by the GameEngine (Phase 3) AFTER the DAG runs, then passed
 *   into formula evaluators for dynamic formulas. The context is a snapshot — it does
 *   not cause additional reactive updates when read.
 *
 * SAFETY:
 *   Uses a hand-written recursive descent parser instead of `eval()`.
 *   Supports: +, -, *, /, (), floor(), ceil(), round(), abs(), min(), max().
 *   Any unknown function or deeply nested expression returns 0 and logs a warning.
 *
 * @see src/lib/types/pipeline.ts     for Modifier.value (can be a formula string)
 * @see src/lib/utils/formatters.ts    for the formatDistance/formatWeight functions called by pipes
 * @see src/lib/utils/logicEvaluator.ts for LogicNode evaluation (separate concern)
 * @see src/lib/utils/diceEngine.ts    for dice rolling (separate concern)
 */

import { formatDistance, formatWeight } from './formatters';
import type { SupportedLanguage } from '../types/i18n';

// =============================================================================
// CHARACTER CONTEXT — The resolved state snapshot for formula evaluation
// =============================================================================

/**
 * A flat snapshot of all pipeline values available to the Math Parser.
 *
 * WHY A FLAT SNAPSHOT AND NOT THE FULL CHARACTER OBJECT?
 *   The GameEngine builds this object AFTER the reactive `$derived` phases run.
 *   It is a "frozen" snapshot passed to the parser so formulas don't trigger
 *   additional reactive reads mid-calculation — which would cause infinite loops.
 *
 *   It is also more performant: reading `context.attributes.stat_str.derivedModifier`
 *   from a plain object is O(1), vs traversing a reactive Svelte store graph.
 *
 * STRUCTURE:
 *   Mirrors the `Character` data structure but with computed (total) values.
 *   All pipeline fields are resolved by the time this context is built.
 *
 * OPTIONAL FIELDS:
 *   - `targetTags`: Only present at ROLL TIME (provided by the Dice Engine).
 *     Absent at sheet-computation time. Formulas referencing `@targetTags` in
 *     a sheet-time context receive an empty array and log a warning.
 *   - `master`: Only present for `LinkedEntity` formulas. Contains the master's
 *     classLevels and computed attributes for formulas like `@master.classLevels.class_wizard`.
 *
 * CONSTANTS:
 *   Named constants (e.g., `@constant.darkvision_range`) are static values loaded
 *   from config tables in the DataLoader. They are flattened into `constants` map.
 */
export interface CharacterContext {
  /** Resolved attribute pipeline values (STR, DEX, CON, INT, WIS, CHA, and custom) */
  attributes: Record<string, {
    baseValue: number;
    totalValue: number;
    derivedModifier: number;
  }>;

  /** Resolved skill pipeline values */
  skills: Record<string, {
    ranks: number;
    totalValue: number;
  }>;

  /** Resolved combat stat pipeline values */
  combatStats: Record<string, {
    totalValue: number;
  }>;

  /** Resolved saving throw pipeline values */
  saves: Record<string, {
    totalValue: number;
  }>;

  /**
   * Sum of all class levels (character level).
   * Formula: Object.values(classLevels).reduce((a, b) => a + b, 0)
   */
  characterLevel: number;

  /**
   * Per-class level record.
   * Example: { "class_fighter": 5, "class_wizard": 3 }
   */
  classLevels: Record<string, number>;

  /**
   * ALL tags from ALL active Features, flattened into a single string array.
   * Used for `has_tag` / `missing_tag` logic evaluations.
   * Example: ["race_human", "class_fighter", "feat_power_attack", "wearing_armor"]
   */
  activeTags: string[];

  /**
   * Tags of the currently equipped (active) weapon.
   * Used for Weapon Focus conditional modifier evaluation.
   */
  equippedWeaponTags: string[];

  /**
   * Player's selections for FeatureChoice prompts.
   * Key: choiceId, Value: array of selected feature IDs.
   * Example: { "weapon_choice": ["item_longsword"] }
   */
  selection: Record<string, string[]>;

  /**
   * Target creature's tags. ONLY populated at ROLL TIME by the Dice Engine.
   * Absent (empty array) at sheet-computation time.
   */
  targetTags?: string[];

  /**
   * Master character context (for LinkedEntity familiar/companion formulas).
   * Only populated when evaluating a LinkedEntity's formulas.
   */
  master?: {
    classLevels: Record<string, number>;
    attributes: Record<string, { totalValue: number; derivedModifier: number }>;
  };

  /**
   * Named constants from config tables (e.g., darkvision_range = 60).
   * Example: { "darkvision_range": 60, "spell_resistance_cap": 25 }
   */
  constants: Record<string, number>;
}

// =============================================================================
// PATH RESOLUTION — Walking the context object via @-paths
// =============================================================================

/**
 * Resolves an `@`-prefixed dot-path against the character context.
 *
 * Path walked by splitting on `.` and descending into the context object.
 * Unknown paths return `0` with a console warning (no crash on missing data).
 *
 * SPECIAL CASES:
 *   - `@characterLevel`: Resolved directly from `context.characterLevel`.
 *   - `@activeTags`:     Resolved to the full string array (for `has_tag` checks).
 *   - `@targetTags`:     Returns empty array during sheet time; populated at roll time.
 *   - `@selection.<id>`: Returns the first selected value (string) or empty string.
 *   - `@constant.<id>`:  Returns the numeric constant or 0.
 *   - `@master.*`:       Accesses the master's sub-context for LinkedEntity formulas.
 *
 * @param path    - The full `@`-prefixed path string (e.g., "@attributes.stat_str.derivedModifier").
 * @param context - The resolved character context snapshot.
 * @returns The resolved value (number, string, string[], or 0 for missing paths).
 */
export function resolvePath(path: string, context: CharacterContext): unknown {
  // Strip the leading '@' character
  const cleanPath = path.startsWith('@') ? path.slice(1) : path;
  const parts = cleanPath.split('.');

  // Handle special top-level shortcuts
  if (parts[0] === 'characterLevel') {
    return context.characterLevel;
  }

  // Handle @constant.<id> → context.constants[id]
  // ARCHITECTURE.md section 4.3: `@constant.<id>` resolves named constants.
  // The context field is `constants` (plural) but the path prefix is `constant` (singular).
  if (parts[0] === 'constant' && parts.length >= 2) {
    const constantId = parts.slice(1).join('.');  // Rejoin in case constant ID has dots
    return context.constants?.[constantId] ?? 0;
  }

  // Walk the context object tree following the dot-path.
  // Using `Record<string, unknown>` deliberately: the path walker needs to traverse
  // an arbitrarily-nested object whose shape varies per resolution context.
  // Each segment indexes into the current level, descending until the leaf value.
  let current: unknown = context as Record<string, unknown>;
  for (const part of parts) {
    if (current === null || current === undefined) {
      console.warn(`[MathParser] Path resolution failed at segment "${part}" in "@${cleanPath}". Returning 0.`);
      return 0;
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (current === undefined) {
    console.warn(`[MathParser] Path "@${cleanPath}" resolved to undefined. Returning 0.`);
    return 0;
  }

  return current;
}

// =============================================================================
// SAFE MATH EVALUATOR — Recursive descent parser
// =============================================================================

/**
 * Internal tokenizer for the math expression parser.
 * Returns tokens as objects with type and value.
 */
type TokenType = 'NUMBER' | 'IDENT' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[pos])) { pos++; continue; }

    // Numbers (integer or decimal)
    if (/[\d.]/.test(expr[pos])) {
      let num = '';
      while (pos < expr.length && /[\d.]/.test(expr[pos])) {
        num += expr[pos++];
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // Identifiers (function names: floor, ceil, round, abs, min, max)
    if (/[a-zA-Z_]/.test(expr[pos])) {
      let ident = '';
      while (pos < expr.length && /[a-zA-Z_\d]/.test(expr[pos])) {
        ident += expr[pos++];
      }
      tokens.push({ type: 'IDENT', value: ident });
      continue;
    }

    // Single-character tokens
    switch (expr[pos]) {
      case '(': tokens.push({ type: 'LPAREN', value: '(' }); break;
      case ')': tokens.push({ type: 'RPAREN', value: ')' }); break;
      case ',': tokens.push({ type: 'COMMA', value: ',' }); break;
      case '+': tokens.push({ type: 'PLUS', value: '+' }); break;
      case '-': tokens.push({ type: 'MINUS', value: '-' }); break;
      case '*': tokens.push({ type: 'STAR', value: '*' }); break;
      case '/': tokens.push({ type: 'SLASH', value: '/' }); break;
      default:
        console.warn(`[MathParser] Unknown character "${expr[pos]}" in expression. Skipping.`);
    }
    pos++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

/**
 * Recursive descent parser for safe arithmetic expressions.
 *
 * Grammar:
 *   expression → term (('+' | '-') term)*
 *   term       → unary (('*' | '/') unary)*
 *   unary      → '-' unary | primary
 *   primary    → NUMBER | IDENT '(' args ')' | '(' expression ')'
 *   args       → expression (',' expression)*
 *
 * Supported functions: floor, ceil, round, abs, min, max
 */
class MathParser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const token = this.consume();
    if (token.type !== type) {
      console.warn(`[MathParser] Expected ${type} but got ${token.type} ("${token.value}")`);
    }
    return token;
  }

  parse(): number {
    const result = this.parseExpression();
    return result;
  }

  private parseExpression(): number {
    let left = this.parseTerm();

    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.consume().type;
      const right = this.parseTerm();
      left = op === 'PLUS' ? left + right : left - right;
    }

    return left;
  }

  private parseTerm(): number {
    let left = this.parseUnary();

    while (this.peek().type === 'STAR' || this.peek().type === 'SLASH') {
      const op = this.consume().type;
      const right = this.parseUnary();
      if (op === 'SLASH') {
        // Prevent division by zero
        left = right !== 0 ? left / right : 0;
      } else {
        left = left * right;
      }
    }

    return left;
  }

  private parseUnary(): number {
    if (this.peek().type === 'MINUS') {
      this.consume();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.peek();

    // Numeric literal
    if (token.type === 'NUMBER') {
      this.consume();
      return parseFloat(token.value);
    }

    // Function call (floor, ceil, round, abs, min, max)
    if (token.type === 'IDENT') {
      this.consume();
      this.expect('LPAREN');
      const args: number[] = [this.parseExpression()];
      while (this.peek().type === 'COMMA') {
        this.consume();
        args.push(this.parseExpression());
      }
      this.expect('RPAREN');

      switch (token.value) {
        case 'floor':  return Math.floor(args[0]);
        case 'ceil':   return Math.ceil(args[0]);
        case 'round':  return Math.round(args[0]);
        case 'abs':    return Math.abs(args[0]);
        case 'min':    return Math.min(...args);
        case 'max':    return Math.max(...args);
        default:
          console.warn(`[MathParser] Unknown function "${token.value}". Returning 0.`);
          return 0;
      }
    }

    // Parenthesised expression
    if (token.type === 'LPAREN') {
      this.consume();
      const result = this.parseExpression();
      this.expect('RPAREN');
      return result;
    }

    // Unexpected token
    console.warn(`[MathParser] Unexpected token ${token.type} ("${token.value}"). Returning 0.`);
    return 0;
  }
}

/**
 * Safely evaluates an arithmetic expression string.
 *
 * Only handles pure numeric math — no @-paths, no pipes.
 * Those are handled in `evaluateFormula()` before calling this function.
 *
 * @param expr - A clean arithmetic expression string (e.g., "10 + floor(4 * 1.5)")
 * @returns The numeric result, or 0 on parse error.
 */
export function evaluateMathExpression(expr: string): number {
  try {
    const tokens = tokenize(expr);
    const parser = new MathParser(tokens);
    return parser.parse();
  } catch (e) {
    console.warn(`[MathParser] Failed to evaluate expression "${expr}":`, e);
    return 0;
  }
}

// =============================================================================
// PIPE HANDLER — Post-processing transforms on resolved values
// =============================================================================

/**
 * Applies a pipe operator to a resolved numeric value, transforming it for display.
 *
 * Pipes are declared in JSON description strings using the `|` character.
 * Example in JSON: `"Your speed is {@attributes.speed_land.totalValue|distance}."`
 *
 * After the @-path is resolved to a number (e.g., 30), the pipe transforms it
 * to a display string (e.g., "30 ft." in English or "9 m" in French).
 *
 * @param value    - The resolved numeric value.
 * @param pipeName - The pipe operator name (without the `|` prefix).
 * @param lang     - The active display language for locale-sensitive pipes.
 * @returns The transformed display string.
 */
function applyPipe(value: number, pipeName: string, lang: SupportedLanguage): string {
  switch (pipeName) {
    case 'distance':
      return formatDistance(value, lang);
    case 'weight':
      return formatWeight(value, lang);
    default:
      console.warn(`[MathParser] Unknown pipe operator "|${pipeName}". Returning raw value.`);
      return String(value);
  }
}

// =============================================================================
// MAIN ENTRY POINT — evaluateFormula
// =============================================================================

/**
 * Evaluates a formula string, resolving @-path variables and applying pipe operators.
 *
 * PROCESSING PIPELINE:
 *   1. Scan the formula for `@`-prefixed variables.
 *   2. For each variable:
 *      a. Check for a pipe: `@attributes.speed_land.totalValue|distance`
 *         → Split on `|`, resolve the path, apply the pipe, substitute the string result.
 *      b. No pipe: resolve the path to a value, substitute inline.
 *         If the value is an array or object (like @activeTags), substitute as JSON string
 *         (used for display; not recommended in arithmetic formulas).
 *   3. After all substitutions, evaluate the remaining expression as arithmetic math.
 *   4. Return the numeric result (or the string result if a pipe was the only content).
 *
 * DICE NOTATION PASS-THROUGH:
 *   If the expression still contains dice notation (e.g., "1d8") after substitution,
 *   the function returns the string AS-IS — the Dice Engine handles dice notation.
 *   This handles modifier `value` fields that are damage formulas (e.g., "1d8 + 4").
 *
 * @param formula  - The formula string to evaluate.
 * @param context  - The resolved character context snapshot.
 * @param lang     - The active display language (for pipe operators).
 * @returns The evaluated result as a number if purely arithmetic, or as a string
 *          if the formula contained pipe operators or dice notation.
 *
 * @example Pure numeric formula:
 * evaluateFormula("floor(@attributes.stat_str.derivedModifier * 1.5)", context, "en") → 6
 *
 * @example Cross-stat reference:
 * evaluateFormula("@attributes.stat_wis.derivedModifier", context, "en") → 3
 *
 * @example With pipe operator (description interpolation):
 * evaluateFormula("@attributes.speed_land.totalValue|distance", context, "fr") → "9 m"
 *
 * @example Damage formula (passed through to Dice Engine):
 * evaluateFormula("1d8 + @attributes.stat_str.derivedModifier", context, "en") → "1d8 + 4"
 */
export function evaluateFormula(
  formula: string,
  context: CharacterContext,
  lang: SupportedLanguage
): number | string {
  // --- Regex to find all @-path tokens, optionally followed by a |pipe ---
  // Matches: @word.word.word|pipe  OR  @word.word.word
  // Character class [\w.\-] supports:
  //   \w  → a-z, A-Z, 0-9, underscore (handles snake_case IDs like "stat_str", "class_fighter")
  //   \.  → dot separator (handles "attributes.stat_str.totalValue")
  //   \-  → hyphen (handles kebab-case IDs like "class-dragon-disciple", "@constant.darkvision-range")
  // Per ARCHITECTURE.md section 2: ID = string (kebab-case format). Both conventions appear in JSON.
  const AT_PATH_REGEX = /@([\w.\-]+)(?:\|([\w\-]+))?/g;

  let result = formula;
  let lastPipeResult: string | null = null;

  // --- Step 1: Replace all @-path tokens ---
  result = formula.replace(AT_PATH_REGEX, (fullMatch, pathStr, pipeName) => {
    const resolvedValue = resolvePath('@' + pathStr, context);

    // If a pipe is present, apply transformation → returns a string, not a number
    if (pipeName) {
      const numericValue = typeof resolvedValue === 'number' ? resolvedValue : 0;
      lastPipeResult = applyPipe(numericValue, pipeName, lang);
      // Substitute a placeholder that won't interfere with math parsing
      // (The full formula BECOMES the pipe result if this is the only content)
      return lastPipeResult;
    }

    // No pipe: substitute the resolved numeric value (or stringify arrays for display)
    if (typeof resolvedValue === 'number') {
      // Negative numbers get parenthesised to avoid "floor(-1 * -1)" parsing issues
      return resolvedValue < 0 ? `(${resolvedValue})` : String(resolvedValue);
    }
    if (typeof resolvedValue === 'string') {
      return resolvedValue;
    }
    if (Array.isArray(resolvedValue)) {
      // Arrays (like @activeTags) are not arithmetic values.
      // Return 0 and warn — arrays should only appear in LogicNode conditions.
      console.warn(`[MathParser] "@${pathStr}" resolved to an array. In arithmetic formulas, this returns 0. Use logicEvaluator for array checks.`);
      return '0';
    }

    console.warn(`[MathParser] "@${pathStr}" resolved to unsupported type: ${typeof resolvedValue}. Returning 0.`);
    return '0';
  });

  // --- Step 2: If the entire formula was a single piped expression, return the string ---
  // Check if we have a pipe result and the result string matches it
  if (lastPipeResult !== null && result === lastPipeResult) {
    return lastPipeResult;
  }

  // --- Step 3: Check for dice notation (pass-through to Dice Engine) ---
  // Pattern: <number>d<number> (e.g., "1d8", "2d6", "1d20")
  if (/\d+d\d+/i.test(result)) {
    // Return the substituted formula as a string for the Dice Engine to consume
    return result.trim();
  }

  // --- Step 4: Evaluate as pure arithmetic ---
  return evaluateMathExpression(result);
}

/**
 * Interpolates @-path variables inside a prose description string.
 *
 * Unlike `evaluateFormula` which processes a pure formula, this function processes
 * a human-readable description that may contain embedded expressions in `{...}` blocks.
 *
 * Example input:
 *   "Your speed increases to {@attributes.speed_land.totalValue|distance}."
 * Example output (English):
 *   "Your speed increases to 30 ft."
 * Example output (French):
 *   "Votre vitesse passe à 9 m."
 *
 * @param description - A localised description string with optional embedded expressions.
 * @param context     - The resolved character context snapshot.
 * @param lang        - The active display language.
 * @returns The description with all embedded expressions evaluated and substituted.
 */
export function interpolateDescription(
  description: string,
  context: CharacterContext,
  lang: SupportedLanguage
): string {
  // Matches: {<formula>} blocks inside a description string
  return description.replace(/\{([^}]+)\}/g, (_match, formulaStr) => {
    const result = evaluateFormula(formulaStr.trim(), context, lang);
    return String(result);
  });
}
