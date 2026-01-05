/**
 * Shared validation utilities for forms
 */

export interface AmountValidationResult {
  isValid: boolean;
  error: string | null;
  amount: number;
}

/**
 * Validates a USDC amount string.
 * @param amountStr - The raw amount string from input
 * @param minAmount - Minimum allowed amount (default: 0.01)
 * @param maxAmount - Maximum allowed amount (default: 10000)
 * @returns Validation result with parsed amount
 */
export function validateUSDCAmount(
  amountStr: string,
  minAmount: number = 0.01,
  maxAmount: number = 10000
): AmountValidationResult {
  const trimmed = amountStr.trim();
  
  if (!trimmed) {
    return { isValid: false, error: "Please enter an amount", amount: 0 };
  }
  
  const amount = parseFloat(trimmed);
  
  if (isNaN(amount) || amount < minAmount) {
    return { 
      isValid: false, 
      error: `Minimum amount is $${minAmount.toFixed(2)} USDC`, 
      amount: 0 
    };
  }
  
  if (amount > maxAmount) {
    return { 
      isValid: false, 
      error: `Maximum amount is $${maxAmount.toLocaleString()} USDC`, 
      amount: 0 
    };
  }
  
  return { isValid: true, error: null, amount };
}
