import { supabase } from "./client";
import { isNoRowsError } from "../errors";

export type HistoryFilterType = "all" | "contacts-only" | "external-only";

export interface Profile {
  id: string;
  wallet_address: string;
  created_at: string;
  last_seen_at: string;
  history_filter_default: HistoryFilterType;
}

export interface Contact {
  id: string;
  owner_id: string;
  contact_wallet_address: string;
  label: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRequest {
  id: string;
  requester_id: string;
  payer_wallet_address: string;
  token_address: string;
  chain_id: number;
  amount: number;
  memo: string | null;
  status: "pending" | "paid" | "cancelled" | "rejected" | "expired";
  tx_hash: string | null;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { wallet_address: string };
}

export interface QueryResult<T> {
  data: T | null;
  error: string | null;
  errorCode?: string;
}

// Profile queries
export async function getProfileByWallet(walletAddress: string): Promise<QueryResult<Profile>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .single();

  if (error) {
    // No rows is expected for new users
    if (isNoRowsError(error.code)) {
      return { data: null, error: null };
    }
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data, error: null };
}

export async function getProfileIdByWallet(walletAddress: string): Promise<QueryResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("wallet_address", walletAddress.toLowerCase())
    .single();

  if (error) {
    if (isNoRowsError(error.code)) {
      return { data: null, error: null };
    }
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data, error: null };
}

// Contact queries
export async function getContactsByOwnerId(ownerId: string): Promise<QueryResult<Contact[]>> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data: data || [], error: null };
}

export async function createContact(params: {
  ownerId: string;
  contactWalletAddress: string;
  label: string;
  note?: string | null;
}): Promise<QueryResult<Contact>> {
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      owner_id: params.ownerId,
      contact_wallet_address: params.contactWalletAddress.toLowerCase(),
      label: params.label,
      note: params.note || null,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data, error: null };
}

// Payment request queries
export async function getIncomingPaymentRequests(payerWalletAddress: string): Promise<QueryResult<PaymentRequest[]>> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, profiles!requester_id(wallet_address)")
    .eq("payer_wallet_address", payerWalletAddress.toLowerCase())
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data: data || [], error: null };
}

export async function getSentPaymentRequests(requesterId: string): Promise<QueryResult<PaymentRequest[]>> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, profiles!requester_id(wallet_address)")
    .eq("requester_id", requesterId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data: data || [], error: null };
}

export async function createPaymentRequest(params: {
  requesterId: string;
  payerWalletAddress: string;
  amount: number;
  memo?: string | null;
}): Promise<QueryResult<PaymentRequest>> {
  const { data, error } = await supabase
    .from("payment_requests")
    .insert({
      requester_id: params.requesterId,
      payer_wallet_address: params.payerWalletAddress.toLowerCase(),
      amount: params.amount,
      memo: params.memo || null,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data, error: null };
}

/**
 * Update a payment request's status and persist timestamps and transaction hash when applicable.
 *
 * When `status` is `"paid"` and `txHash` is provided, the request's `tx_hash` and `paid_at` are set; `updated_at` is always updated.
 *
 * @param params.requestId - The payment request ID to update
 * @param params.status - The new status: `"paid"`, `"cancelled"`, or `"rejected"`
 * @param params.txHash - Optional transaction hash to record when marking the request as paid
 * @returns The updated payment request record on success, `null` on error (see `error`/`errorCode`)
 */
export async function updatePaymentRequestStatus(params: {
  requestId: string;
  status: "paid" | "cancelled" | "rejected";
  txHash?: string;
}): Promise<QueryResult<PaymentRequest>> {
  const updateData: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
  };

  if (params.status === "paid" && params.txHash) {
    updateData.tx_hash = params.txHash;
    updateData.paid_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("payment_requests")
    .update(updateData)
    .eq("id", params.requestId)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data, error: null };
}

/**
 * Update a user's history filter preference.
 */
export async function updateHistoryFilterPreference(params: {
  walletAddress: string;
  filterType: HistoryFilterType;
}): Promise<QueryResult<Profile>> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ history_filter_default: params.filterType })
    .eq("wallet_address", params.walletAddress.toLowerCase())
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data, error: null };
}