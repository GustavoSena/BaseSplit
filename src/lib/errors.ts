/**
 * Database and API error codes
 */

// PostgreSQL error codes
export const PG_ERRORS = {
  UNIQUE_VIOLATION: "23505", // Duplicate key value violates unique constraint
  FOREIGN_KEY_VIOLATION: "23503", // Foreign key constraint violation
  NOT_NULL_VIOLATION: "23502", // Not-null constraint violation
  CHECK_VIOLATION: "23514", // Check constraint violation
} as const;

// PostgREST error codes
export const POSTGREST_ERRORS = {
  NO_ROWS_RETURNED: "PGRST116", // No rows returned when expecting at least one
  MULTIPLE_ROWS: "PGRST102", // Multiple rows returned when expecting one
  INVALID_PREFERENCE: "PGRST103", // Invalid preference header
} as const;

// Supabase Auth error codes
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: "invalid_credentials",
  EMAIL_NOT_CONFIRMED: "email_not_confirmed",
  USER_NOT_FOUND: "user_not_found",
  SESSION_EXPIRED: "session_expired",
} as const;

// Custom application error codes
export const APP_ERRORS = {
  WALLET_NOT_CONNECTED: "wallet_not_connected",
  SIGN_IN_FAILED: "sign_in_failed",
  INSUFFICIENT_BALANCE: "insufficient_balance",
  INVALID_ADDRESS: "invalid_address",
  INVALID_AMOUNT: "invalid_amount",
} as const;

/**
 * Check if an error is a PostgreSQL unique violation
 */
export function isUniqueViolation(errorCode: string | undefined): boolean {
  return errorCode === PG_ERRORS.UNIQUE_VIOLATION;
}

/**
 * Check if an error is a PostgREST "no rows returned" error
 */
export function isNoRowsError(errorCode: string | undefined): boolean {
  return errorCode === POSTGREST_ERRORS.NO_ROWS_RETURNED;
}

/**
 * Get a user-friendly error message
 */
export function getErrorMessage(errorCode: string | undefined): string {
  switch (errorCode) {
    case PG_ERRORS.UNIQUE_VIOLATION:
      return "This record already exists";
    case PG_ERRORS.FOREIGN_KEY_VIOLATION:
      return "Referenced record not found";
    case PG_ERRORS.NOT_NULL_VIOLATION:
      return "Required field is missing";
    case POSTGREST_ERRORS.NO_ROWS_RETURNED:
      return "Record not found";
    case APP_ERRORS.WALLET_NOT_CONNECTED:
      return "Please connect your wallet";
    case APP_ERRORS.INSUFFICIENT_BALANCE:
      return "Insufficient balance";
    case APP_ERRORS.INVALID_ADDRESS:
      return "Invalid wallet address";
    case APP_ERRORS.INVALID_AMOUNT:
      return "Invalid amount";
    default:
      return "An error occurred";
  }
}
