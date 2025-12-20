"use client";

import { useState, useEffect, useCallback } from "react";
import { base } from "viem/chains";
import { Name } from "@coinbase/onchainkit/identity";
import { RefreshIcon, ChevronDownIcon } from "./Icons";
import {
  Contact,
  PaymentRequest,
  getProfileIdByWallet,
  getIncomingPaymentRequests,
  getSentPaymentRequests,
  createPaymentRequest as createPaymentRequestQuery,
  updatePaymentRequestStatus as updatePaymentRequestStatusQuery,
} from "@/lib/supabase/queries";

interface RequestsTabProps {
  currentWalletAddress: string | null;
  contacts: Contact[];
  loadContacts: () => void;
  payPaymentRequest: (request: PaymentRequest) => void;
  payingRequestId: string | null;
  isSending: boolean;
  isConfirming: boolean;
}

export function usePaymentRequests(currentWalletAddress: string | null) {
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<PaymentRequest[]>([]);
  const [paymentRequestsError, setPaymentRequestsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPaymentRequests = useCallback(async (showRefreshIndicator = false) => {
    if (!currentWalletAddress) return;

    if (showRefreshIndicator) setIsRefreshing(true);
    setPaymentRequestsError(null);
    
    try {
      const incomingResult = await getIncomingPaymentRequests(currentWalletAddress);
      if (incomingResult.error) {
        setPaymentRequestsError(incomingResult.error);
        setPaymentRequests([]);
      } else {
        setPaymentRequests(incomingResult.data || []);
      }

      const profileResult = await getProfileIdByWallet(currentWalletAddress);
      if (profileResult.error) {
        console.error("Failed to load profile:", profileResult.error);
        setSentRequests([]);
      } else if (profileResult.data) {
        const sentResult = await getSentPaymentRequests(profileResult.data.id);
        if (sentResult.error) {
          setPaymentRequestsError(prev => 
            prev ? `${prev}; Failed to load sent requests` : "Failed to load sent requests"
          );
          setSentRequests([]);
        } else {
          setSentRequests(sentResult.data || []);
        }
      } else {
        setSentRequests([]);
      }
    } finally {
      if (showRefreshIndicator) setIsRefreshing(false);
    }
  }, [currentWalletAddress]);

  useEffect(() => {
    if (currentWalletAddress) {
      loadPaymentRequests();
    }
  }, [currentWalletAddress, loadPaymentRequests]);

  // Periodic refresh every 30 seconds
  useEffect(() => {
    if (!currentWalletAddress) return;
    
    const interval = setInterval(() => {
      if (!isRefreshing) {
        loadPaymentRequests();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [currentWalletAddress, loadPaymentRequests, isRefreshing]);

  return {
    paymentRequests,
    sentRequests,
    paymentRequestsError,
    setPaymentRequestsError,
    isRefreshing,
    loadPaymentRequests,
  };
}

export function RequestsTab({
  currentWalletAddress,
  contacts,
  loadContacts,
  payPaymentRequest,
  payingRequestId,
  isSending,
  isConfirming,
}: RequestsTabProps) {
  const {
    paymentRequests,
    sentRequests,
    paymentRequestsError,
    setPaymentRequestsError,
    isRefreshing,
    loadPaymentRequests,
  } = usePaymentRequests(currentWalletAddress);

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPayerAddress, setNewPayerAddress] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const createPaymentRequest = async () => {
    if (!currentWalletAddress || !newPayerAddress || !newAmount) return;
    
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0.01) {
      setCreateError("Minimum amount is $0.01 USDC");
      return;
    }
    if (amount > 10000) {
      setCreateError("Maximum amount is $10,000 USDC");
      return;
    }
    
    setIsCreating(true);
    setCreateError(null);
    
    try {
      const profileResult = await getProfileIdByWallet(currentWalletAddress);
      if (!profileResult.data) {
        throw new Error("Profile not found. Please sign in again.");
      }
      
      const amountInMicroUnits = Math.floor(amount * 1e6);
      
      const result = await createPaymentRequestQuery({
        requesterId: profileResult.data.id,
        payerWalletAddress: newPayerAddress,
        amount: amountInMicroUnits,
        memo: newMemo || null,
      });
      
      if (result.error) throw new Error(result.error);
      
      setNewPayerAddress("");
      setNewAmount("");
      setNewMemo("");
      setContactSearch("");
      setShowContactDropdown(false);
      setShowCreateForm(false);
      await loadPaymentRequests();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create payment request");
    } finally {
      setIsCreating(false);
    }
  };

  const cancelRequest = async (requestId: string, action: "reject" | "cancel") => {
    const request = [...paymentRequests, ...sentRequests].find(r => r.id === requestId);
    if (!request) {
      setPaymentRequestsError("Request not found");
      return;
    }
    
    const walletLower = currentWalletAddress?.toLowerCase();
    if (action === "reject" && request.payer_wallet_address !== walletLower) {
      setPaymentRequestsError("You can only reject requests sent to you");
      return;
    }
    if (action === "cancel" && !sentRequests.some(r => r.id === requestId)) {
      setPaymentRequestsError("You can only cancel requests you created");
      return;
    }
    
    const result = await updatePaymentRequestStatusQuery({
      requestId,
      status: action === "reject" ? "rejected" : "cancelled",
    });
    
    if (result.error) {
      setPaymentRequestsError(`Failed to ${action} request: ${result.error}`);
      return;
    }
    
    await loadPaymentRequests();
  };

  const pendingIncoming = paymentRequests.filter(pr => pr.status === "pending");
  const pendingSent = sentRequests.filter(pr => pr.status === "pending");
  const currentWallet = currentWalletAddress?.toLowerCase();

  return (
    <>
      {/* Header with Create and Refresh */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            const newState = !showCreateForm;
            setShowCreateForm(newState);
            if (newState) {
              loadContacts();
            } else {
              setContactSearch("");
              setShowContactDropdown(false);
              setNewPayerAddress("");
            }
          }}
          className="flex-1 btn-success"
        >
          {showCreateForm ? "Cancel" : "Create Request"}
        </button>
        <button
          onClick={() => loadPaymentRequests(true)}
          disabled={isRefreshing}
          className="btn-icon"
          title="Refresh requests"
        >
          <RefreshIcon className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Create Payment Request Form */}
      {showCreateForm && (
        <div className="card">
          <p className="card-title">New Payment Request</p>
          
          <div className="relative">
            <input
              type="text"
              placeholder="Search contacts or enter wallet address..."
              value={contactSearch}
              onChange={(e) => {
                const value = e.target.value;
                setContactSearch(value);
                if (value === "") {
                  setNewPayerAddress("");
                  setShowContactDropdown(contacts.length > 0);
                } else if (value.startsWith("0x")) {
                  setNewPayerAddress(value);
                  setShowContactDropdown(false);
                } else {
                  setShowContactDropdown(contacts.length > 0);
                }
              }}
              onFocus={() => {
                if (contacts.length > 0 && !contactSearch.startsWith("0x")) {
                  setShowContactDropdown(true);
                }
              }}
              className="input"
            />
            
            {showContactDropdown && contacts.length > 0 && (
              <div className="dropdown">
                {contacts
                  .filter(c => 
                    contactSearch === "" ||
                    c.label.toLowerCase().includes(contactSearch.toLowerCase()) ||
                    c.contact_wallet_address.toLowerCase().includes(contactSearch.toLowerCase())
                  )
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setNewPayerAddress(c.contact_wallet_address);
                        setContactSearch(c.label);
                        setShowContactDropdown(false);
                      }}
                      className="dropdown-item flex justify-between items-center"
                    >
                      <span className="font-medium">{c.label}</span>
                      <span className="text-gray-500 text-xs font-mono truncate ml-2">
                        {c.contact_wallet_address.slice(0, 6)}...{c.contact_wallet_address.slice(-4)}
                      </span>
                    </button>
                  ))}
                {contacts.filter(c => 
                  contactSearch === "" ||
                  c.label.toLowerCase().includes(contactSearch.toLowerCase()) ||
                  c.contact_wallet_address.toLowerCase().includes(contactSearch.toLowerCase())
                ).length === 0 && (
                  <p className="px-3 py-2 text-gray-500 text-sm">No matching contacts</p>
                )}
              </div>
            )}
          </div>
          
          {newPayerAddress && (
            <p className="text-xs text-gray-500 font-mono truncate">
              To: {newPayerAddress}
            </p>
          )}
          
          <input
            type="number"
            placeholder="Amount (USDC)"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            step="0.01"
            min="0"
            className="input"
          />
          <input
            type="text"
            placeholder="Memo (optional)"
            value={newMemo}
            onChange={(e) => setNewMemo(e.target.value)}
            className="input"
          />
          {createError && (
            <p className="text-error">{createError}</p>
          )}
          <button
            onClick={createPaymentRequest}
            disabled={isCreating || !newPayerAddress || !newAmount}
            className="w-full btn-primary"
          >
            {isCreating ? "Creating..." : "Create Request"}
          </button>
        </div>
      )}

      {paymentRequestsError && (
        <p className="text-error-center">{paymentRequestsError}</p>
      )}

      {/* Pending Requests to Pay */}
      {pendingIncoming.length > 0 && (
        <div className="card">
          <p className="card-title">Requests to Pay</p>
          {pendingIncoming.map((pr) => {
            const canPay = currentWallet === pr.payer_wallet_address;
            const isPaying = payingRequestId === pr.id;
            
            return (
              <div key={pr.id} className="list-item">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{(Number(pr.amount) / 1e6).toFixed(2)} USDC</span>
                  <span className="badge-pending">pending</span>
                </div>
                <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                  From: <Name address={pr.profiles?.wallet_address as `0x${string}`} chain={base} className="font-mono" />
                </p>
                {pr.memo && <p className="text-gray-400 text-xs">{pr.memo}</p>}
                {canPay && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => payPaymentRequest(pr)}
                      disabled={isPaying || isSending || isConfirming}
                      className="flex-1 btn-success-sm"
                    >
                      {isPaying && isSending ? "Sending..." : 
                       isPaying && isConfirming ? "Confirming..." : 
                       "Pay"}
                    </button>
                    <button
                      onClick={() => cancelRequest(pr.id, "reject")}
                      className="btn-danger"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending Requests Sent */}
      {pendingSent.length > 0 && (
        <div className="card">
          <p className="card-title">Awaiting Payment</p>
          {pendingSent.map((pr) => (
            <div key={pr.id} className="list-item">
              <div className="flex justify-between items-center">
                <span className="font-medium">{(Number(pr.amount) / 1e6).toFixed(2)} USDC</span>
                <span className="badge-sent">sent</span>
              </div>
              <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                To: <Name address={pr.payer_wallet_address as `0x${string}`} chain={base} className="font-mono" />
              </p>
              {pr.memo && <p className="text-gray-400 text-xs">{pr.memo}</p>}
              <button
                onClick={() => cancelRequest(pr.id, "cancel")}
                className="mt-2 btn-ghost"
              >
                Cancel Request
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingIncoming.length === 0 && pendingSent.length === 0 && (
        <p className="text-muted py-4">No pending requests</p>
      )}

      {/* History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <span>{showHistory ? "Hide History" : "Show History"}</span>
        <ChevronDownIcon className={`transition-transform ${showHistory ? "rotate-180" : ""}`} />
      </button>

      {/* History Section */}
      {showHistory && (
        <div className="card">
          <p className="card-title">History</p>
          {(() => {
            const completedIncoming = paymentRequests.filter(pr => pr.status !== "pending");
            const completedSent = sentRequests.filter(pr => pr.status !== "pending");
            const allHistoryRaw = [
              ...completedIncoming.map(pr => ({ ...pr, direction: "received" as const })),
              ...completedSent.map(pr => ({ ...pr, direction: "sent" as const })),
            ];
            const seenIds = new Set<string>();
            const allHistory = allHistoryRaw
              .filter(pr => {
                if (seenIds.has(pr.id)) return false;
                seenIds.add(pr.id);
                return true;
              })
              .sort((a, b) => {
                const dateA = a.status === "paid" && a.paid_at ? a.paid_at : a.created_at;
                const dateB = b.status === "paid" && b.paid_at ? b.paid_at : b.created_at;
                return new Date(dateB).getTime() - new Date(dateA).getTime();
              });

            if (allHistory.length === 0) {
              return <p className="text-muted">No history yet</p>;
            }

            return allHistory.map((pr) => (
              <div key={pr.id} className="list-item">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${pr.direction === "sent" ? "text-blue-400" : "text-purple-400"}`}>
                      {pr.direction === "sent" ? "↑ Sent" : "↓ Received"}
                    </span>
                    <span className="font-medium">{(Number(pr.amount) / 1e6).toFixed(2)} USDC</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    pr.status === "paid" ? "bg-green-800 text-green-300" :
                    pr.status === "rejected" ? "bg-orange-800 text-orange-300" :
                    pr.status === "cancelled" ? "bg-red-800 text-red-300" :
                    "bg-gray-700 text-gray-300"
                  }`}>{pr.status}</span>
                </div>
                <p className="text-gray-500 font-mono text-xs mt-1">
                  {pr.direction === "sent" 
                    ? `To: ${pr.payer_wallet_address?.slice(0, 6)}...${pr.payer_wallet_address?.slice(-4)}`
                    : `From: ${pr.profiles?.wallet_address?.slice(0, 6)}...${pr.profiles?.wallet_address?.slice(-4)}`
                  }
                </p>
                {pr.memo && <p className="text-gray-400 text-xs">{pr.memo}</p>}
                {pr.tx_hash && (
                  <a 
                    href={`https://basescan.org/tx/${pr.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-xs hover:underline"
                  >
                    View transaction
                  </a>
                )}
              </div>
            ));
          })()}
        </div>
      )}
    </>
  );
}
