import type { CanonicalNode, NodeProcessor } from "../types"

type OfType<Type extends NodeProcessor["type"]> = Extract<NodeProcessor, { type: Type }>

/**
 * Everything this core knows about one processor: what a valid definition looks like and what it does
 * to a node list. What the rule is *called* is deliberately absent — a `type` is the whole vocabulary
 * this module owes anyone, and the interface owns the wording (`features/rules/processor-labels.ts`).
 *
 * `parse` and `apply` are methods on purpose: that is what lets a module written for one member of the
 * union sit in a registry typed over the whole of it.
 */
export interface ProcessorModule<Type extends NodeProcessor["type"] = NodeProcessor["type"]> {
  type: Type
  /**
   * The keys a definition of this rule may carry besides `type`.
   *
   * Typed against the rule's own union member, so a key that is not a field of it does not compile —
   * which is the point: the registry rejects an unknown key against this list before `parse` runs, so
   * no rule restates the set of names its own type already declares.
   *
   * The names alone, deliberately. What shape each one takes is `parse`'s answer, and stating it twice
   * — once as a schema and once as the checks — is the duplication this is meant to remove.
   */
  params: ReadonlyArray<Exclude<keyof OfType<Type>, "type">>
  /** Validates one definition, or throws a `ValidationError` naming the field that is wrong. */
  parse(input: Record<string, unknown>, name: string): OfType<Type>
  apply(nodes: CanonicalNode[], processor: OfType<Type>): CanonicalNode[]
}

/**
 * The shape the registry stores: the same contract stated over the whole union, which bivariant method
 * parameters let a single-member module be held under. The narrowing is real at run time — a module
 * only ever receives the processor whose `type` matched it in the lookup.
 */
export interface AnyProcessorModule {
  type: NodeProcessor["type"]
  params: readonly string[]
  parse(input: Record<string, unknown>, name: string): NodeProcessor
  apply(nodes: CanonicalNode[], processor: NodeProcessor): CanonicalNode[]
}
