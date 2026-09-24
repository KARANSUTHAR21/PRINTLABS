export const PAYMENT_STATUSES = [
  "CREATED",
  "PAYMENT_INITIATED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_PROCESSING",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ["PAYMENT_INITIATED", "CANCELLED", "EXPIRED"],
  PAYMENT_INITIATED: ["PROCESSING", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["PAID", "FAILED", "EXPIRED"],
  PAID: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["PAYMENT_PROCESSING", "CANCELLED"],
  PAYMENT_PROCESSING: ["CONFIRMED", "PENDING_PAYMENT", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const TERMINAL_PAYMENT = new Set<PaymentStatus>([
  "PAID",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus) {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`Illegal payment transition ${from} → ${to}`);
  }
}

export function isActivePayment(status: PaymentStatus): boolean {
  return status === "CREATED" || status === "PAYMENT_INITIATED" || status === "PROCESSING";
}

export function isPaid(status: PaymentStatus): boolean {
  return status === "PAID";
}
