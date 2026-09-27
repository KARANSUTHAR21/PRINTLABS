/**
 * Password policy — the single source of truth, shared by the client forms and
 * the server validators.
 *
 * Registration, password reset and any future "change password" surface all
 * call `passwordProblem()`, so the rule the UI promises can never drift from
 * the rule the API actually enforces.
 *
 * Rule: at least 8 characters, containing at least one letter and one number.
 * `MAX` exists because the password is fed to scrypt — an unbounded input is an
 * easy way to burn server CPU.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Human-readable reason `value` is not acceptable, or `null` when it is.
 * Messages are written to be shown directly to the user.
 */
export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(value)) return "Password must contain a letter (a–z).";
  if (!/[0-9]/.test(value)) return "Password must contain a number (0–9).";
  return null;
}

/** Convenience boolean form of {@link passwordProblem}. */
export function isAcceptablePassword(value: string): boolean {
  return passwordProblem(value) === null;
}

/** The hint shown under password fields. */
export const PASSWORD_HINT = "At least 8 characters, with letters and numbers.";
