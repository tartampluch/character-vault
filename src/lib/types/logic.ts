/**
 * @file logic.ts
 * @description The Logic Engine type definitions: recursive boolean trees for
 *              prerequisites, conditional modifiers, and activation conditions.
 *
 * Design philosophy:
 *   All rules in D&D 3.5 that involve a "yes/no" decision are expressed as
 *   a `LogicNode` tree. This includes:
 *     - Feat prerequisites    (e.g., "Requires STR 13+ AND Power Attack")
 *     - Conditional modifiers (e.g., "Active only when not wearing armour")
 *     - Situational checks    (e.g., "Does the target have the 'orc' tag?")
 *     - Forbidden tag checks  (e.g., "Cannot be active if wearing metal armour")
 *
 *   WHY A RECURSIVE TREE?
 *   The D&D 3.5 feat system requires arbitrarily deep AND/OR/NOT logic.
 *   A flat list of conditions cannot express "A AND (B OR C) AND NOT D".
 *   A discriminated union of node types allows:
 *     1. JSON serialization/deserialization without custom parsers.
 *     2. TypeScript narrowing: each branch has distinct required fields.
 *     3. Recursive evaluation via a simple `evaluateLogicNode()` function.
 *
 * Evaluation contexts:
 *   - SHEET TIME:  The `logicEvaluator` resolves nodes against the character's
 *                  computed state (attributes, tags, skill ranks, class levels).
 *                  Used for prerequisites and `conditionNode` on Modifiers.
 *   - ROLL TIME:   The Dice Engine additionally provides `@targetTags` when
 *                  evaluating `situationalContext` checks. Only relevant for
 *                  modifiers that fire conditionally on the target's properties.
 *
 * @see src/lib/utils/logicEvaluator.ts  (Phase 2.3) for the recursive evaluator.
 * @see src/lib/types/primitives.ts      for `LogicOperator` definitions.
 */

import type { LogicOperator } from './primitives';

// =============================================================================
// LOGIC NODE — DISCRIMINATED UNION
// =============================================================================

/**
 * A recursive, serializable boolean expression tree.
 *
 * Four variants:
 *   - `AND`       : All child nodes must evaluate to `true`.
 *   - `OR`        : At least one child node must evaluate to `true`.
 *   - `NOT`       : The single child node must evaluate to `false`.
 *   - `CONDITION` : A leaf node. Compares a resolved value against a literal.
 *
 * @example Cleave prerequisite: "STR 13+ AND Power Attack feat"
 * ```json
 * {
 *   "logic": "AND",
 *   "nodes": [
 *     {
 *       "logic": "CONDITION",
 *       "targetPath": "@attributes.stat_str.totalValue",
 *       "operator": ">=",
 *       "value": 13,
 *       "errorMessage": "Requires Strength 13+"
 *     },
 *     {
 *       "logic": "CONDITION",
 *       "targetPath": "@activeTags",
 *       "operator": "has_tag",
 *       "value": "feat_power_attack",
 *       "errorMessage": "Requires the Power Attack feat"
 *     }
 *   ]
 * }
 * ```
 */
export type LogicNode =
  | LogicNodeAnd
  | LogicNodeOr
  | LogicNodeNot
  | LogicNodeCondition;

// =============================================================================
// COMPOUND NODES (Boolean combinators)
// =============================================================================

/**
 * Logical AND: ALL child nodes must evaluate to `true`.
 *
 * Short-circuit evaluation: the evaluator stops at the first failing node and
 * collects its `errorMessage(s)` to surface to the UI.
 */
export interface LogicNodeAnd {
  logic: 'AND';
  /**
   * The child nodes. All must be true for the AND to be true.
   * An empty array evaluates to `true` by convention (vacuous truth).
   */
  nodes: LogicNode[];
}

/**
 * Logical OR: AT LEAST ONE child node must evaluate to `true`.
 *
 * If ALL child nodes fail, the evaluator collects ALL error messages so the
 * UI can display them as alternatives ("requires A or B").
 */
export interface LogicNodeOr {
  logic: 'OR';
  /**
   * The child nodes. At least one must be true for the OR to be true.
   * An empty array evaluates to `false` by convention (no viable path).
   */
  nodes: LogicNode[];
}

/**
 * Logical NOT: The single child node must evaluate to `false`.
 *
 * Used for "forbidden" conditions such as:
 *   - "Cannot wear heavy armour" (NOT has_tag "heavy_armor")
 *   - "Cannot be used while raging" (NOT has_tag "raging")
 */
export interface LogicNodeNot {
  logic: 'NOT';
  /**
   * The child node. The NOT evaluates to `true` when this node is `false`.
   */
  node: LogicNode;
}

// =============================================================================
// LEAF NODE (Actual comparison)
// =============================================================================

/**
 * A leaf-level comparison node.
 *
 * Evaluation flow:
 *   1. Resolve `targetPath` against the character context (Math Parser walks
 *      the `@`-prefixed dot-path).
 *   2. Apply `operator` to compare the resolved value with `value`.
 *   3. Return `true` if the comparison passes, `false` otherwise.
 *   4. If `false`, the `errorMessage` is surfaced to the UI.
 *
 * @example Check BAB ≥ 6:
 * ```json
 * {
 *   "logic": "CONDITION",
 *   "targetPath": "@combatStats.bab.totalValue",
 *   "operator": ">=",
 *   "value": 6,
 *   "errorMessage": "Base Attack Bonus +6 required"
 * }
 * ```
 *
 * @example Check active tag:
 * ```json
 * {
 *   "logic": "CONDITION",
 *   "targetPath": "@activeTags",
 *   "operator": "has_tag",
 *   "value": "feat_dodge",
 *   "errorMessage": "Requires the Dodge feat"
 * }
 * ```
 *
 * @example Dynamic value (resolved at evaluation time):
 * ```json
 * {
 *   "logic": "CONDITION",
 *   "targetPath": "@equippedWeaponTags",
 *   "operator": "includes",
 *   "value": "@selection.weapon_choice",
 *   "errorMessage": "Weapon must match the chosen Weapon Focus type"
 * }
 * ```
 *
 * Note on `value`:
 *   `value` can be a literal (number, string, boolean) OR a `@`-prefixed path
 *   string. If it starts with `@`, the Math Parser resolves it dynamically at
 *   evaluation time (e.g., `"@selection.weapon_choice"` reads the player's
 *   selection from the `ActiveFeatureInstance.selections` record).
 *   This enables data-driven cross-references without hard-coded IDs in engine code.
 */
export interface LogicNodeCondition {
  logic: 'CONDITION';

  /**
   * A dot-path string prefixed with `@` that the Math Parser resolves against
   * the character's computed context.
   *
   * Standard paths (always available):
   *   @attributes.<id>.totalValue
   *   @attributes.<id>.derivedModifier
   *   @skills.<id>.ranks
   *   @combatStats.<id>.totalValue
   *   @saves.<id>.totalValue
   *   @characterLevel
   *   @classLevels.<classId>
   *   @activeTags                    ← flat string[] of all active feature tags
   *   @equippedWeaponTags            ← tags of the currently active weapon
   *   @selection.<choiceId>          ← player's selection on the parent feature
   *
   * Roll-time only paths (only available when called from the Dice Engine):
   *   @targetTags                    ← the target creature's tag array
   */
  targetPath: string;

  /**
   * The comparison operator to apply.
   * See `LogicOperator` in primitives.ts for full semantics.
   */
  operator: LogicOperator;

  /**
   * The right-hand side of the comparison.
   * Can be a literal (number | string | boolean) or a `@`-prefixed dynamic path.
   */
  value: unknown;

  /**
   * Human-readable error message displayed when this condition fails.
   *
   * Best practice: write it as a statement of the requirement, not as a failure.
   *   Good: "Requires Strength 13+"
   *   Bad:  "Strength is too low"
   *
   * The UI (Phase 11.4) shows these in red for unmet prerequisites and
   * neutral/green for met ones, so the message should read as a requirement.
   *
   * Optional: if absent, the UI will display a generic "Prerequisite not met" message.
   */
  errorMessage?: string;
}
