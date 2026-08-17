/**
 * Booking Lock Utility
 * Pure logic for computing lock status and formatting time.
 */

export interface LockStatus {
  isValid: boolean;        // lock exists and not expired
  expiresAt: Date | null;
  secondsRemaining: number;
  isExpired: boolean;
  isExpiringSoon: boolean; // true if < 60 seconds remaining
}

/**
 * Compute lock status from expiry date.
 */
export function computeLockStatus(expiresAt: Date | null): LockStatus {
  if (!expiresAt) {
    return {
      isValid: false,
      expiresAt: null,
      secondsRemaining: 0,
      isExpired: true,
      isExpiringSoon: false
    };
  }

  const secondsRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );

  return {
    isValid: secondsRemaining > 0,
    expiresAt,
    secondsRemaining,
    isExpired: secondsRemaining === 0,
    isExpiringSoon: secondsRemaining > 0 && secondsRemaining < 60
  };
}

/**
 * Formats seconds as MM:SS (e.g., 590 → '9:50', 5 → '0:05').
 */
export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
