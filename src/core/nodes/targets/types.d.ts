import type { TargetCapability } from "../pipeline/capability"
import type { CanonicalNode } from "../types"

/**
 * One piece of a client's document: a line for the text formats, an object for the structured ones.
 * The pipeline never looks inside it — only the target that made it and the `assemble` that closes
 * the document around it know what it means.
 */
export type RenderUnit = string | Record<string, unknown>

/**
 * Everything this codebase knows about one output client: what it can carry, what it is called, what
 * its file looks like, how one node is written and how the file is closed around them.
 *
 * Absent is everything the pipeline does the same way for every client — iterating the nodes, gating
 * them against the capability lists, numbering duplicate names, collecting which ones came out,
 * phrasing the refusals. Adding a client is writing `renderNode` and `assemble` and registering it.
 */
export interface TargetSpec<Id extends string, Unit extends RenderUnit> extends TargetCapability {
  /** The value that appears in the API as `defaultTarget` and `?target=`. */
  id: Id
  /** The client's own name, written the way its own documentation writes it. */
  label: string
  /** Anything a user should know that the capability lists do not say. */
  notes?: string
  /**
   * Whether this is a client a user picks. Canonical JSON is the core's own model and an API
   * interchange format rather than something anyone runs, so it is the one that is not.
   */
  selectable?: boolean
  /**
   * Whether proxy names must be unique inside this client's document. A client that keys its policies
   * by name leaves one of two same-named proxies unreachable, and sing-box rejects the configuration
   * outright — a property of the client, not a courtesy.
   */
  uniqueNames: boolean
  /**
   * The names this client gives a node *besides* its own — tags `renderNode` mints by deriving them
   * from the name. Only sing-box has any: a Shadow-TLS proxy is two outbounds, the second one's tag
   * `${name}_shadowtls`.
   *
   * Declared here because uniqueness is the pipeline's job and the pipeline cannot see a derived name:
   * as node names `A` and `A_shadowtls` are distinct, so numbering the names alone hands out two
   * identical tags and sing-box refuses the whole configuration. Read off the node *after* it is
   * renamed, so the tag reserved is character-for-character the one `renderNode` mints — which keeps
   * `detour` pointing at an outbound that exists.
   *
   * Every name returned must vary with `node.name`, or the numbering search in `pipeline/render.ts`
   * cannot end: it finds a free candidate by changing the name and retesting the whole set, so a name
   * the rename cannot move collides against the same taken entry forever — an unbounded loop inside a
   * Worker request, not a wrong document. Nothing checks this at runtime, because a bound could only
   * give up silently (reintroducing the duplicate tags this prevents) or throw an error no caller has
   * behaviour for.
   */
  derivedNames?(node: CanonicalNode): string[]
  /**
   * The name this client's document actually carries, when writing it transforms the node's own name.
   * The line formats declare `policyName`: a node line has no escape for `=` or `,`, so both are
   * replaced with a space, and a name left empty by that becomes `${type}-${port}`.
   *
   * Declared here for the reason `derivedNames` is: a promise about `node.name` is worth nothing if
   * the document is keyed by something else. Two names differing only in a stripped character are
   * distinct as node names and identical as policy names, so numbering the node names alone certifies
   * two proxies apart and then writes them out as one, the client reaching only one of them.
   *
   * Same contract as `derivedNames`, including that it must vary with `node.name`. `policyName`
   * satisfies that: the number the search appends survives the stripping and the trim, including for
   * the names whose first candidate falls through to `${type}-${port}`.
   */
  renderedName?(node: CanonicalNode): string
  contentType: string
  fileExtension: string
  /**
   * One node in, the units it is written as out. `null` refuses it: a credential holding the line
   * separator, a transport with no syntax, a protocol version this client never implemented.
   * An array is for a node that expands — sing-box writes a Shadow-TLS proxy as two outbounds.
   */
  renderNode(node: CanonicalNode): Unit | Unit[] | null
  assemble(units: Unit[]): string
}

/**
 * The shape the registry holds: `Unit` erased, because the pipeline only ever feeds one node in,
 * takes the units back and hands them all to `assemble` at the end.
 */
export interface Target<Id extends string = string> extends Omit<
  TargetSpec<Id, RenderUnit>,
  "renderNode" | "assemble"
> {
  renderNode(node: CanonicalNode): RenderUnit[] | null
  assemble(units: RenderUnit[]): string
}
