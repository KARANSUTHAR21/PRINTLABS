/**
 * Password-reset link lifetime — the single source of truth.
 *
 * Shared by the server (which stamps `expires_at` and enforces it) and by the
 * copy the customer reads in the email and on both reset screens, so the window
 * we promise can never drift from the window we enforce.
 *
 * Ten minutes: long enough to switch to an inbox and come back, short enough
 * that a leaked or forwarded email stops being a way in almost immediately.
 */
export const RESET_LINK_TTL_MINUTES = 10;

/** {@link RESET_LINK_TTL_MINUTES} in milliseconds. */
export const RESET_LINK_TTL_MS = RESET_LINK_TTL_MINUTES * 60_000;
