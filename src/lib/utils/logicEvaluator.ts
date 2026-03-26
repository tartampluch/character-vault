/**
 * @file logicEvaluator.ts
 * @description Recursive evaluator for LogicNode prerequisite and condition trees.
 *
 * Design philosophy:
 *   The LogicNode system (defined in logic.ts) allows ANY conditional rule in D&D 3.5
 *   to be expressed as a JSON tree. This evaluator is the "interpreter" for that tree.
 *
 *   WHEN IS THIS CALLED?
 *     1. SHEET TIME (prereqs & conditional modifiers):
 *        Called during GameEngine DAG Phase 0 (flattening) to:
 *          a. Validate `Feature.prerequisitesNode` — does the character meet the feat's requirements?
 *          b. Evaluate `Modifier.conditionNode` — is this modifier currently active?
 *        The `CharacterContext` is built from the computed attribute/skill/combat pipelines.
 *
 *     2. ROLL TIME (situational check):
 *        Called by the Dice Engine after populating `context.targetTags` with the
 *        target creature's tags. Evaluates whether a situational modifier applies.
 *
 *     3. FEAT CATALOG UI (Phase 11.4):
 *        Called for every feat in the list to determine display/disable state.
 *        The `EvaluationResult` provides exact `errorMessages` for red/green display.
 *
 *   RETURN VALUE:
 *     Returns an `EvaluationResult` with:
 *       - `passed: boolean`    — whether the overall tree evaluated to true
 *       - `errorMessages: string[]` — messages from FAILED conditions (for UI display)
 *       - `metMessages: string[]`   — messages from PASSED conditions (for green indicators)
 *
 *   WHY COLLECT BOTH ERRORS AND MET CONDITIONS?
 *     The feat catalog UI (Phase 11.4) shows:
 *       ✅ "Power Attack" (met prerequisite — green)
 *       ❌ "Requires Strength 13+" (unmet — red)
 *     Both require knowing which conditions passed and which failed.
 *
 *   OPERATOR SEMANTICS:
 *     `has_tag` / `missing_tag`: Only valid when `targetPath` resolves to a string[].
 *     They are semantic aliases for `includes` / `not_includes` for clarity in JSON.
 *
 *   DYNAMIC VALUE RESOLUTION:
 *     The `value` field in a CONDITION node can also be an `@`-path string.
 *     Example: `"value": "@selection.weapon_choice"` → resolved via `resolvePath()`.
 *     This enables self-referential conditions without hardcoded IDs.
 *
 * @see src/lib/types/logic.ts         for LogicNode type definition
 * @see src/lib/utils/mathParser.ts    for resolvePath and CharacterContext
 */

import type { LogicNode } from '../types/logic';
import type { LogicOperator } from '../types/primitives';
import type { CharacterContext } from './mathParser';
import { resolvePath } from './mathParser';

// =============================================================================
// EVALUATION RESULT
// =============================================================================

/**
 * The structured result of evaluating a LogicNode tree.
 *
 * Always returned (even for trivially true/false cases) to enable the UI
 * to display detailed prerequisite breakdowns in the feat catalog and
 * modifier condition panels.
 */
export interface EvaluationResult {
  /**
   * Whether the overall LogicNode tree evaluated to `true`.
   * For prerequisites: `true` means the character meets ALL requirements.
   * For conditional modifiers: `true` means the modifier is currently active.
   */
  passed: boolean;

  /**
   * Human-readable messages from FAILED conditions.
   * Collected from `LogicNodeCondition.errorMessage` fields of failing nodes.
   * May be empty even when `passed === false` if conditions lack `errorMessage` fields.
   *
   * Used by the feat catalog UI to display unmet requirements in red.
   * Example: ["Requires Strength 13+", "Requires the Power Attack feat"]
   */
  errorMessages: string[];

  /**
   * Human-readable messages from PASSED conditions.
   * Collected from `LogicNodeCondition.errorMessage` fields of PASSING nodes.
   * (The `errorMessage` field doubles as the "requirement label" whether met or not.)
   *
   * Used by the feat catalog UI to display met requirements in green/neutral.
   * Example: ["Requires Dexterity 13+"]
   */
  metMessages: string[];
}

// =============================================================================
// MAIN EVALUATOR
// =============================================================================

/**
 * Evaluates a `LogicNode` tree against a character context snapshot.
 *
 * This is the main entry point. It dispatches to the appropriate sub-evaluator
 * based on the node's `logic` discriminant.
 *
 * EVALUATION RULES BY NODE TYPE:
 *   AND: ALL children must pass. Short-circuits on first failure (collects all errors).
 *   OR:  At least ONE child must pass. Collects all errors if all fail.
 *   NOT: The single child must FAIL. Inverts the result.
 *   CONDITION: Leaf comparison. Resolves paths, applies operator, returns pass/fail.
 *
 * @param node    - The LogicNode tree to evaluate. May be `undefined` (returns passed:true).
 * @param context - The resolved character context from the GameEngine.
 * @returns An `EvaluationResult` with pass/fail status and detailed messages.
 *
 * @example Check if a character meets the Cleave prerequisites:
 * ```typescript
 * const result = evaluateLogicNode(feat_cleave.prerequisitesNode, characterContext);
 * if (!result.passed) {
 *   console.log("Missing:", result.errorMessages);
 * }
 * ```
 */
export function evaluateLogicNode(
  node: LogicNode | undefined,
  context: CharacterContext
): EvaluationResult {
  // An absent prerequisite node always passes (the feature has no requirements)
  if (!node) {
    return { passed: true, errorMessages: [], metMessages: [] };
  }

  switch (node.logic) {
    case 'AND':
      return evaluateAnd(node.nodes, context);
    case 'OR':
      return evaluateOr(node.nodes, context);
    case 'NOT':
      return evaluateNot(node.node, context);
    case 'CONDITION':
      return evaluateCondition(
        node.targetPath,
        node.operator,
        node.value,
        node.errorMessage,
        context
      );
    default:
      // TypeScript exhaustiveness check — should never happen with proper typing
      console.warn('[LogicEvaluator] Unknown logic node type encountered. Failing safely.');
      return { passed: false, errorMessages: ['Unknown prerequisite type'], metMessages: [] };
  }
}

// =============================================================================
// AND EVALUATION
// =============================================================================

/**
 * Evaluates an AND node: ALL children must pass.
 *
 * Does NOT short-circuit: all children are evaluated so we can collect ALL
 * error messages (important for the feat catalog showing multiple unmet prereqs).
 *
 * Passed messages are collected from all passing children.
 * Error messages are collected from all failing children.
 *
 * @param nodes  - Array of child LogicNode trees.
 * @param context - Character context snapshot.
 */
function evaluateAnd(nodes: LogicNode[], context: CharacterContext): EvaluationResult {
  // Vacuous truth: empty AND node always passes
  if (nodes.length === 0) {
    return { passed: true, errorMessages: [], metMessages: [] };
  }

  let overallPassed = true;
  const allErrors: string[] = [];
  const allMet: string[] = [];

  for (const child of nodes) {
    const result = evaluateLogicNode(child, context);
    if (!result.passed) {
      overallPassed = false;
      allErrors.push(...result.errorMessages);
    } else {
      allMet.push(...result.metMessages);
    }
    // Collect met messages from both passing and failing branches
    // (an AND can have some children pass and some fail)
  }

  return {
    passed: overallPassed,
    errorMessages: allErrors,
    metMessages: allMet,
  };
}

// =============================================================================
// OR EVALUATION
// =============================================================================

/**
 * Evaluates an OR node: AT LEAST ONE child must pass.
 *
 * If at least one child passes, the OR passes and we collect that child's
 * `metMessages`. If ALL children fail, we collect ALL error messages
 * (showing all alternatives as equally unmet).
 *
 * @param nodes   - Array of child LogicNode trees.
 * @param context - Character context snapshot.
 */
function evaluateOr(nodes: LogicNode[], context: CharacterContext): EvaluationResult {
  // Vacuous falsity: empty OR node always fails (no viable path)
  if (nodes.length === 0) {
    return { passed: false, errorMessages: [], metMessages: [] };
  }

  let overallPassed = false;
  const allErrors: string[] = [];
  const passingMet: string[] = [];

  for (const child of nodes) {
    const result = evaluateLogicNode(child, context);
    if (result.passed) {
      overallPassed = true;
      passingMet.push(...result.metMessages);
      // Don't break — collect all passing branch messages
    } else {
      allErrors.push(...result.errorMessages);
    }
  }

  return {
    passed: overallPassed,
    errorMessages: overallPassed ? [] : allErrors,
    metMessages: passingMet,
  };
}

// =============================================================================
// NOT EVALUATION
// =============================================================================

/**
 * Evaluates a NOT node: inverts the child's result.
 *
 * NOTE on messages:
 *   When the NOT passes (child failed), the child's errorMessages become
 *   metMessages (the prohibition is satisfied). When the NOT fails (child passed),
 *   the child's metMessages become errorMessages (the prohibition is violated).
 *
 * This inversion makes sense for the UI:
 *   NOT wearing_armor: child passes (IS wearing armor) → NOT fails → error: "Cannot wear armor"
 *   NOT wearing_armor: child fails (NOT wearing armor) → NOT passes → met: "Not wearing armor" ✓
 *
 * @param child   - The single child LogicNode.
 * @param context - Character context snapshot.
 */
function evaluateNot(child: LogicNode, context: CharacterContext): EvaluationResult {
  const result = evaluateLogicNode(child, context);

  // Invert the result
  return {
    passed: !result.passed,
    // When NOT passes (child failed), the "error messages" become met (requirement satisfied)
    metMessages: result.passed ? [] : result.errorMessages,
    // When NOT fails (child passed), the "met messages" become errors (condition violated)
    errorMessages: result.passed ? result.metMessages : [],
  };
}

// =============================================================================
// CONDITION EVALUATION
// =============================================================================

/**
 * Evaluates a leaf CONDITION node: resolves the target path and applies the operator.
 *
 * DYNAMIC VALUE RESOLUTION:
 *   If `value` is a string starting with `@`, it is resolved as a path against
 *   the character context before the comparison. This allows conditions like:
 *   `"value": "@selection.weapon_choice"` (for Weapon Focus conditional modifiers).
 *
 * OPERATOR IMPLEMENTATIONS:
 *   - `"=="`, `"!="`: Strict equality using JavaScript's `===` and `!==`.
 *   - `">="`, `"<="`: Numeric comparison (non-numeric operands → false with warning).
 *   - `"includes"`, `"not_includes"`: Array membership (non-array target → false).
 *   - `"has_tag"`, `"missing_tag"`: Aliases for includes/not_includes for string arrays.
 *     Semantically identical but named for clarity in JSON prerequisites.
 *
 * EDGE CASES:
 *   - Path not found: resolves to `0` (from resolvePath). Compared against value.
 *   - Non-numeric operands for `>=`/`<=`: logs warning, returns false.
 *   - Non-array target for `includes`: returns false, logs warning.
 *
 * @param targetPath   - The `@`-prefixed path to resolve in the context.
 * @param operator     - The comparison operator (must be a valid `LogicOperator` value).
 *                       Using the `LogicOperator` type instead of `string` enables
 *                       TypeScript's exhaustiveness checker on the `switch` below —
 *                       any missing case branch becomes a compile-time error.
 * @param rawValue     - The right-hand side (literal or `@`-prefixed path).
 * @param errorMessage - The message logged if this condition fails.
 * @param context      - Character context snapshot.
 */
function evaluateCondition(
  targetPath: string,
  operator: LogicOperator,
  rawValue: unknown,
  errorMessage: string | undefined,
  context: CharacterContext
): EvaluationResult {
  // Resolve the left-hand side path
  const resolvedTarget = resolvePath(targetPath, context);

  // Resolve the right-hand side (may also be a dynamic path)
  let resolvedValue: unknown = rawValue;
  if (typeof rawValue === 'string' && rawValue.startsWith('@')) {
    resolvedValue = resolvePath(rawValue, context);
  }

  // --- Apply the operator ---
  let passed = false;

  switch (operator) {
    case '==':
      passed = resolvedTarget === resolvedValue;
      break;

    case '!=':
      passed = resolvedTarget !== resolvedValue;
      break;

    case '>=': {
      const left = Number(resolvedTarget);
      const right = Number(resolvedValue);
      if (isNaN(left) || isNaN(right)) {
        console.warn(`[LogicEvaluator] Operator ">=" requires numbers. Got: ${typeof resolvedTarget} >= ${typeof resolvedValue}. Returning false.`);
        passed = false;
      } else {
        passed = left >= right;
      }
      break;
    }

    case '<=': {
      const left = Number(resolvedTarget);
      const right = Number(resolvedValue);
      if (isNaN(left) || isNaN(right)) {
        console.warn(`[LogicEvaluator] Operator "<=" requires numbers. Got: ${typeof resolvedTarget} <= ${typeof resolvedValue}. Returning false.`);
        passed = false;
      } else {
        passed = left <= right;
      }
      break;
    }

    case 'includes':
    case 'has_tag': {
      if (!Array.isArray(resolvedTarget)) {
        console.warn(`[LogicEvaluator] Operator "${operator}" requires an array target. Got: ${typeof resolvedTarget}. Returning false.`);
        passed = false;
      } else {
        passed = (resolvedTarget as unknown[]).includes(resolvedValue);
      }
      break;
    }

    case 'not_includes':
    case 'missing_tag': {
      if (!Array.isArray(resolvedTarget)) {
        console.warn(`[LogicEvaluator] Operator "${operator}" requires an array target. Got: ${typeof resolvedTarget}. Returning false.`);
        passed = false;
      } else {
        passed = !(resolvedTarget as unknown[]).includes(resolvedValue);
      }
      break;
    }

    default:
      console.warn(`[LogicEvaluator] Unknown operator "${operator}". Failing safely.`);
      passed = false;
  }

  // --- Build the result ---
  const message = errorMessage ?? `Condition: ${targetPath} ${operator} ${String(resolvedValue)}`;

  return {
    passed,
    errorMessages: passed ? [] : [message],
    metMessages: passed ? [message] : [],
  };
}

// =============================================================================
// CONVENIENCE HELPER — Simple boolean check
// =============================================================================

/**
 * Convenience wrapper that returns just `true` or `false`.
 *
 * Used internally by the GameEngine DAG phases that only need a pass/fail answer
 * and don't need the detailed breakdown (e.g., checking `conditionNode` on a modifier
 * during flattening — the UI doesn't display modifier condition breakdowns inline).
 *
 * For the feat catalog UI, use `evaluateLogicNode()` directly instead to get
 * the full breakdown of met/unmet prerequisites.
 *
 * @param node    - The LogicNode tree to evaluate (undefined = always passes).
 * @param context - The resolved character context.
 * @returns `true` if the tree passes, `false` otherwise.
 */
export function checkCondition(
  node: LogicNode | undefined,
  context: CharacterContext
): boolean {
  return evaluateLogicNode(node, context).passed;
}
