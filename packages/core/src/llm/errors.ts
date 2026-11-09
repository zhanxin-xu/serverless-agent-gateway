/**
 * A failed model call. `transient`: the same request may well succeed later
 * (it timed out, the network failed, the provider was rate limited or had a
 * server error), so the turn can carry on in a fresh function instead of failing.
 */
export class ModelCallError extends Error {
  override name = "ModelCallError";
  constructor(
    message: string,
    readonly transient: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * The model key has no money left: out of credits, or over the key's spending
 * limit. Retrying won't help until it resets or is topped up. `resetsAt`: when,
 * if the provider said.
 */
export class OutOfCreditError extends ModelCallError {
  override name = "OutOfCreditError";
  constructor(
    message: string,
    readonly resetsAt?: number,
  ) {
    super(message, false);
  }
}
