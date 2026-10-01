/** Signup account choices are distinct from privileged application roles. */
export const ACCOUNT_TYPES = ["CUSTOMER", "VENDOR"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === "string" && ACCOUNT_TYPES.includes(value as AccountType);
}
