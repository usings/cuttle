/** A representability failure skips this node; unexpected renderer failures still propagate. */
export class TargetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TargetValidationError"
  }
}
