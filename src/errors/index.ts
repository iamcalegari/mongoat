/**
 * @public
 *
 * Base error class for all errors raised by Mongoat itself (config
 * conflicts, missing connection, missing dbName, etc.).
 *
 * Extends the native `Error` and preserves an optional `cause`
 * (the original error, if any) so consumers can inspect the root cause
 * without losing the original stack trace.
 *
 * Errors re-thrown from the underlying MongoDB driver (e.g. the
 * `JSON.stringify`-wrapped driver errors) are out of scope for this
 * class — see Phase 3 (SEC-04) for the driver error hierarchy.
 */
export class MongoatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MongoatError';
    Object.setPrototypeOf(this, MongoatError.prototype);
  }
}
