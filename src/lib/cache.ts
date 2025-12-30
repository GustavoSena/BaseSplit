// Cache management utilities for BaseSplit
// Handles localStorage caching with size limits and cleanup

export const CONTACTS_CACHE_KEY = "basesplit-contacts";
export const REQUESTS_CACHE_KEY = "basesplit-requests";

const MAX_CACHED_ITEMS = 20;

/**
 * Clear all BaseSplit cache entries from localStorage
 */
export function clearAllCache(): void {
  if (typeof window === "undefined") return;
  
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(CONTACTS_CACHE_KEY) || key.startsWith(REQUESTS_CACHE_KEY))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Clear cache for a specific wallet address
 */
export function clearWalletCache(walletAddress: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const normalizedAddress = walletAddress.toLowerCase();
    localStorage.removeItem(`${CONTACTS_CACHE_KEY}-${normalizedAddress}`);
    localStorage.removeItem(`${REQUESTS_CACHE_KEY}-${normalizedAddress}`);
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Limit array to max cached items (most recent first)
 */
export function limitCacheSize<T>(items: T[]): T[] {
  return items.slice(0, MAX_CACHED_ITEMS);
}

export { MAX_CACHED_ITEMS };
