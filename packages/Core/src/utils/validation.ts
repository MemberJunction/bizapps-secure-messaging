/**
 * Lightweight input-validation helpers shared across the Secure Messaging stores and handlers.
 *
 * These exist to keep untrusted, caller-supplied identifiers (route params, request-body fields)
 * from being interpolated into RunView `ExtraFilter` strings. A value that passes {@link isUuid}
 * cannot contain a quote, so it is safe to embed directly; anything else is rejected before it
 * reaches the query builder.
 */

/** Canonical 8-4-4-4-12 UUID shape (case-insensitive). */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * True when `value` is a string in canonical UUID form. Acts as a type guard so callers can use the
 * narrowed `string` directly. Use this to gate any caller-supplied ID before it is interpolated
 * into a SQL/filter expression.
 */
export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
}
