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

export type PaymentRequestType = "request" | "transfer";

export interface PaymentRequest {
  id: string;
  requester_id: string;
  type: PaymentRequestType;
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

/**
 * Creates a new contact record for the given owner.
 *
 * @param params.contactWalletAddress - Wallet address of the contact; it will be lowercased before storage.
 * @param params.note - Optional note for the contact; `null` will be stored when omitted.
 * @returns The inserted contact record in `data` on success; on failure `data` is `null` and `error` and `errorCode` contain the error message and code.
 */
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

/**
 * Deletes a contact row by its id.
 *
 * @param contactId - The contact's unique identifier
 * @returns `data` is `null`. `error` contains the database error message and `errorCode` contains the database error code when deletion fails; otherwise `error` is `null`.
 */
export async function deleteContact(contactId: string): Promise<QueryResult<null>> {
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId);

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data: null, error: null };
}

/**
 * Fetches payment requests where the specified wallet is the payer.
 * Only returns records of type 'request' (not direct transfers).
 *
 * @param payerWalletAddress - Wallet address of the payer; lookup is performed using the lowercased address.
 * @returns The matching payment requests, each including the requester's profile `wallet_address` when available; returns an empty array if no requests are found.
 */
export async function getIncomingPaymentRequests(payerWalletAddress: string): Promise<QueryResult<PaymentRequest[]>> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, profiles!requester_id(wallet_address)")
    .eq("payer_wallet_address", payerWalletAddress.toLowerCase())
    .eq("type", "request")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data: data || [], error: null };
}

/**
 * Fetches payment requests sent by the specified requester.
 * Only returns records of type 'request' (not direct transfers).
 */
export async function getSentPaymentRequests(requesterId: string): Promise<QueryResult<PaymentRequest[]>> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, profiles!requester_id(wallet_address)")
    .eq("requester_id", requesterId)
    .eq("type", "request")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data: data || [], error: null };
}

/**
 * Fetches direct transfers sent by the specified sender.
 * Only returns records of type 'transfer'.
 */
export async function getSentTransfers(senderId: string): Promise<QueryResult<PaymentRequest[]>> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, profiles!requester_id(wallet_address)")
    .eq("requester_id", senderId)
    .eq("type", "transfer")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data: data || [], error: null };
}

/**
 * Fetches direct transfers received by the specified wallet.
 * Only returns records of type 'transfer'.
 */
export async function getReceivedTransfers(recipientWalletAddress: string): Promise<QueryResult<PaymentRequest[]>> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*, profiles!requester_id(wallet_address)")
    .eq("payer_wallet_address", recipientWalletAddress.toLowerCase())
    .eq("type", "transfer")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data: data || [], error: null };
}

/**
 * Creates a new payment request record.
 *
 * @param params.requesterId - The ID of the requester.
 * @param params.payerWalletAddress - The wallet address of the payer; it will be lowercased before storage.
 * @param params.amount - The amount of the payment request.
 * @param params.memo - Optional memo for the payment request; `null` will be stored when omitted.
 * @returns The inserted payment request record in `data` on success; on failure `data` is `null` and `error` and `errorCode` contain the error message and code.
 */
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
 * Create a direct transfer record for history tracking.
 * This creates a "paid" payment request to represent a direct transfer.
 */
export async function createDirectTransfer(params: {
  senderId: string;
  recipientWalletAddress: string;
  amount: number;
  memo?: string | null;
  txHash: string;
}): Promise<QueryResult<PaymentRequest>> {
  const { data, error } = await supabase
    .from("payment_requests")
    .insert({
      requester_id: params.senderId,
      type: "transfer",
      payer_wallet_address: params.recipientWalletAddress.toLowerCase(),
      amount: params.amount,
      memo: params.memo || null,
      status: "paid",
      tx_hash: params.txHash,
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message, errorCode: error.code };
  }
  return { data, error: null };
}

/**
 * Set a profile's default history filter.
 *
 * Updates the profile record matching the provided wallet address (compared case-insensitively)
 * to use the given history filter type and returns the updated profile.
 *
 * @param params.walletAddress - The wallet address of the profile to update (any case).
 * @param params.filterType - The desired default history filter value.
 * @returns The updated Profile on success, or `null` with an `error` and optional `errorCode` on failure.
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