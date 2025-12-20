export const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// Donation/contribution settings
export const DONATION_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc9e7595f5bE21" as const; // TODO: Replace with actual donation address
export const DONATION_AMOUNTS = [0.01, 0.02, 0.05] as const;
export const DEFAULT_DONATION_AMOUNT = 0.02;

// LocalStorage keys
export const STORAGE_KEYS = {
  DONATION_PREFERENCE: "basesplit_donation_preference",
  DONATION_AMOUNT: "basesplit_donation_amount",
  DONATION_POPUP_DISMISSED: "basesplit_donation_popup_dismissed",
} as const;
