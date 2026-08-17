export const BOOKING_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
} as const;

export type BookingStatus = typeof BOOKING_STATUS[keyof typeof BOOKING_STATUS];

export const ACTIVE_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE
];

export const TERMINAL_STATUSES = [
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED
];

/**
 * Validates whether a booking can transition from its current status to a new one.
 * Follows the standard flow: "pending" -> "confirmed" -> "active" -> "completed" | "cancelled"
 */
export const isValidTransition = (
  from: BookingStatus,
  to: BookingStatus
): boolean => {
  const validTransitions: Record<string, string[]> = {
    pending: ["confirmed", "active", "cancelled"],
    confirmed: ["active", "cancelled"],
    active: ["completed", "cancelled"],
    completed: [],
    cancelled: []
  };
  return validTransitions[from]?.includes(to) ?? false;
};
