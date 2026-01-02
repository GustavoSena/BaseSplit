"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { base } from "viem/chains";
import { Name } from "@coinbase/onchainkit/identity";
import { RefreshIcon, ChevronDownIcon } from "./Icons";
import { MultiRecipientForm } from "./MultiRecipientForm";
import {
  Contact,
  PaymentRequest,
  HistoryFilterType,
  getProfileByWallet,
  getProfileIdByWallet,
  getIncomingPaymentRequests,
  getSentPaymentRequests,
  createPaymentRequest as createPaymentRequestQuery,
  updatePaymentRequestStatus as updatePaymentRequestStatusQuery,
  updateHistoryFilterPreference,
  createContact,
} from "@/lib/supabase/queries";
import { REQUESTS_CACHE_KEY, limitCacheSize } from "@/lib/cache";

interface RequestsTabProps {
  currentWalletAddress: string | null;
  contacts: Contact[];
  loadContacts: () => void;
  payPaymentRequest: (request: PaymentRequest) => void;
  payingRequestId: string | null;
  isSending: boolean;
  isConfirming: boolean;
  prefilledContact?: Contact | null;
  onPrefilledContactUsed?: () => void;
  onSendMoney?: (toAddress: string, amount: number, memo?: string) => void;
}

function getCachedRequests(walletAddress: string): { incoming: PaymentRequest[]; sent: PaymentRequest[] } {
  if (typeof window === "undefined") return { incoming: [], sent: [] };
  try {
    const cached = localStorage.getItem(`${REQUESTS_CACHE_KEY}-${walletAddress.toLowerCase()}`);
    return cached ? JSON.parse(cached) : { incoming: [], sent: [] };
  } catch {
    return { incoming: [], sent: [] };
  }
}

function setCachedRequests(walletAddress: string, incoming: PaymentRequest[], sent: PaymentRequest[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${REQUESTS_CACHE_KEY}-${walletAddress.toLowerCase()}`,
      JSON.stringify({ 
        incoming: limitCacheSize(incoming), 
        sent: limitCacheSize(sent) 
      })
    );
  } catch {
    // Ignore localStorage errors
  }
}

export function usePaymentRequests(currentWalletAddress: string | null) {
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>(() => {
    if (currentWalletAddress) {
      return getCachedRequests(currentWalletAddress).incoming;
    }
    return [];
  });
  const [sentRequests, setSentRequests] = useState<PaymentRequest[]>(() => {
    if (currentWalletAddress) {
      return getCachedRequests(currentWalletAddress).sent;
    }
    return [];
  });
  const [paymentRequestsError, setPaymentRequestsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPaymentRequests = useCallback(async (showRefreshIndicator = false) => {
    if (!currentWalletAddress) return;

    if (showRefreshIndicator) setIsRefreshing(true);
    setPaymentRequestsError(null);
    
    let newIncoming: PaymentRequest[] = [];
    let newSent: PaymentRequest[] = [];
    
    try {
      const incomingResult = await getIncomingPaymentRequests(currentWalletAddress);
      if (incomingResult.error) {
        setPaymentRequestsError(incomingResult.error);
      } else {
        newIncoming = incomingResult.data || [];
        setPaymentRequests(newIncoming);
      }

      const profileResult = await getProfileIdByWallet(currentWalletAddress);
      if (profileResult.error) {
        console.error("Failed to load profile:", profileResult.error);
      } else if (profileResult.data) {
        const sentResult = await getSentPaymentRequests(profileResult.data.id);
        if (sentResult.error) {
          setPaymentRequestsError(prev => 
            prev ? `${prev}; Failed to load sent requests` : "Failed to load sent requests"
          );
        } else {
          newSent = sentResult.data || [];
          setSentRequests(newSent);
        }
      }
      
      // Cache the results
      setCachedRequests(currentWalletAddress, newIncoming, newSent);
    } finally {
      if (showRefreshIndicator) setIsRefreshing(false);
    }
  }, [currentWalletAddress]);

  // Hydrate from cache on mount/wallet change for instant UI
  useEffect(() => {
    if (currentWalletAddress) {
      const cached = getCachedRequests(currentWalletAddress);
      if (cached.incoming.length > 0 || cached.sent.length > 0) {
        setPaymentRequests(cached.incoming);
        setSentRequests(cached.sent);
      }
    }
  }, [currentWalletAddress]);

  // Refresh from server after cache hydration
  useEffect(() => {
    if (currentWalletAddress) {
      loadPaymentRequests();
    }
  }, [currentWalletAddress, loadPaymentRequests]);

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
  prefilledContact,
  onPrefilledContactUsed,
  onSendMoney,
}: RequestsTabProps) {
  const {
    paymentRequests,
    sentRequests,
    paymentRequestsError,
    setPaymentRequestsError,
    isRefreshing,
    loadPaymentRequests,
  } = usePaymentRequests(currentWalletAddress);

  // Form visibility state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterType>("all");
  const [historyDisplayCount, setHistoryDisplayCount] = useState(20);

  // Save as contact state (for pending requests)
  const [saveAsContactId, setSaveAsContactId] = useState<string | null>(null);
  const [saveAsContactLabel, setSaveAsContactLabel] = useState("");
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [saveContactError, setSaveContactError] = useState<string | null>(null);

  // Handle prefilled contact
  useEffect(() => {
    if (prefilledContact) {
      setShowRequestForm(true);
      loadContacts();
      onPrefilledContactUsed?.();
    }
  }, [prefilledContact, onPrefilledContactUsed, loadContacts]);

  // Load user's filter preference
  useEffect(() => {
    const loadFilterPreference = async () => {
      if (!currentWalletAddress) return;
      const result = await getProfileByWallet(currentWalletAddress);
      if (result.error) {
        console.error("Failed to load filter preference:", result.error);
        return;
      }
      if (result.data?.history_filter_default) {
        setHistoryFilter(result.data.history_filter_default);
      }
    };
    loadFilterPreference();
  }, [currentWalletAddress]);

  const handleFilterChange = async (newFilter: HistoryFilterType) => {
    const previousFilter = historyFilter;
    setHistoryFilter(newFilter);
    if (currentWalletAddress) {
      const result = await updateHistoryFilterPreference({
        walletAddress: currentWalletAddress,
        filterType: newFilter,
      });
      if (result.error) {
        setHistoryFilter(previousFilter);
        console.error("Failed to save filter preference:", result.error);
      }
    }
  };

  const isContact = useCallback((address: string | undefined) => {
    if (!address) return false;
    return contacts.some(c => c.contact_wallet_address.toLowerCase() === address.toLowerCase());
  }, [contacts]);

  const getContactLabel = useCallback((address: string | undefined) => {
    if (!address) return null;
    const contact = contacts.find(c => c.contact_wallet_address.toLowerCase() === address.toLowerCase());
    return contact?.label || null;
  }, [contacts]);

  // Memoize history computation for performance
  const allHistory = useMemo(() => {
    const completedIncoming = paymentRequests.filter(pr => pr.status !== "pending");
    const completedSent = sentRequests.filter(pr => pr.status !== "pending");
    const allHistoryRaw = [
      ...completedIncoming.map(pr => ({ ...pr, direction: "received" as const })),
      ...completedSent.map(pr => ({ ...pr, direction: "sent" as const })),
    ];
    const seenIds = new Set<string>();
    return allHistoryRaw
      .filter(pr => {
        if (seenIds.has(pr.id)) return false;
        seenIds.add(pr.id);
        return true;
      })
      .filter(pr => {
        if (historyFilter === "all") return true;
        const otherAddress = pr.direction === "sent" 
          ? pr.payer_wallet_address 
          : pr.profiles?.wallet_address;
        const isContactAddress = isContact(otherAddress);
        if (historyFilter === "contacts-only") return isContactAddress;
        if (historyFilter === "external-only") return !isContactAddress;
        return true;
      })
      .sort((a, b) => {
        const dateA = a.status === "paid" && a.paid_at ? a.paid_at : a.created_at;
        const dateB = b.status === "paid" && b.paid_at ? b.paid_at : b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
  }, [paymentRequests, sentRequests, historyFilter, isContact]);

  const handleSaveAsContact = async (walletAddress: string) => {
    if (!currentWalletAddress || !saveAsContactLabel.trim()) return;
    
    setIsSavingContact(true);
    setSaveContactError(null);
    try {
      const profileResult = await getProfileIdByWallet(currentWalletAddress);
      if (!profileResult.data) {
        setSaveContactError("Profile not found. Please sign in again.");
        return;
      }
      
      const result = await createContact({
        ownerId: profileResult.data.id,
        contactWalletAddress: walletAddress,
        label: saveAsContactLabel.trim(),
      });
      
      if (result.error) {
        setSaveContactError("Failed to save contact. Please try again.");
      } else {
        loadContacts();
        setSaveAsContactId(null);
        setSaveAsContactLabel("");
      }
    } finally {
      setIsSavingContact(false);
    }
  };

  // Handle request form submission
  const handleRequestSubmit = async (data: { recipients: { address: string; amount: number }[]; memo?: string }) => {
    if (!currentWalletAddress) return;
    
    setIsCreating(true);
    setPaymentRequestsError(null);
    
    try {
      const profileResult = await getProfileIdByWallet(currentWalletAddress);
      if (!profileResult.data) {
        setPaymentRequestsError("Profile not found. Please sign in again.");
        return;
      }
      
      const results: { address: string; success: boolean; error?: string }[] = [];
      
      for (const recipient of data.recipients) {
        try {
          const amountInMicroUnits = Math.floor(recipient.amount * 1e6);
          await createPaymentRequestQuery({
            requesterId: profileResult.data.id,
            payerWalletAddress: recipient.address,
            amount: amountInMicroUnits,
            memo: data.memo || null,
          });
          results.push({ address: recipient.address, success: true });
        } catch (err) {
          results.push({ 
            address: recipient.address, 
            success: false, 
            error: err instanceof Error ? err.message : "Unknown error" 
          });
        }
      }
      
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        const failedAddresses = failures.map(f => `${f.address.slice(0, 6)}...`).join(", ");
        setPaymentRequestsError(`Failed to create ${failures.length} request(s) for: ${failedAddresses}`);
      }
      
      if (results.some(r => r.success)) {
        await loadPaymentRequests();
      }
      
      if (failures.length === 0) {
        setShowRequestForm(false);
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Handle send form submission
  const handleSendSubmit = async (data: { recipients: { address: string; amount: number }[]; memo?: string }) => {
    if (!onSendMoney) return;
    
    for (const recipient of data.recipients) {
      onSendMoney(recipient.address, recipient.amount, data.memo);
    }
    setShowSendForm(false);
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
      {/* Header with Request, Send, and Refresh */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setShowRequestForm(!showRequestForm);
            setShowSendForm(false);
            if (!showRequestForm) loadContacts();
          }}
          className={`flex-1 ${showRequestForm ? "btn-secondary" : "btn-success"}`}
        >
          {showRequestForm ? "Cancel" : "Request"}
        </button>
        <button
          onClick={() => {
            setShowSendForm(!showSendForm);
            setShowRequestForm(false);
            if (!showSendForm) loadContacts();
          }}
          className={`flex-1 ${showSendForm ? "btn-secondary" : "btn-primary"}`}
        >
          {showSendForm ? "Cancel" : "Send"}
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

      {/* Request Money Form */}
      {showRequestForm && (
        <MultiRecipientForm
          mode="request"
          contacts={contacts}
          onSubmit={handleRequestSubmit}
          isSubmitting={isCreating}
          onCancel={() => setShowRequestForm(false)}
        />
      )}

      {/* Send Money Form */}
      {showSendForm && onSendMoney && (
        <MultiRecipientForm
          mode="send"
          contacts={contacts}
          onSubmit={handleSendSubmit}
          isSubmitting={isSending}
          isConfirming={isConfirming}
          onCancel={() => setShowSendForm(false)}
        />
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
                <p className="text-muted-foreground text-xs mt-1 flex items-center gap-1">
                  From: {pr.profiles?.wallet_address ? (
                    getContactLabel(pr.profiles.wallet_address) || (
                      <Name address={pr.profiles.wallet_address as `0x${string}`} chain={base} className="font-mono" />
                    )
                  ) : (
                    <span className="font-mono">Unknown</span>
                  )}
                </p>
                {pr.memo && <p className="text-muted-foreground text-xs">{pr.memo}</p>}
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
                
                {/* Save as Contact option */}
                {pr.profiles?.wallet_address && !isContact(pr.profiles.wallet_address) && (
                  <>
                    {saveAsContactId === pr.id ? (
                      <div className="mt-2 p-2 bg-primary-100 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-800 rounded">
                        <p className="text-xs text-primary-600 dark:text-primary-300 mb-2">Save as contact</p>
                        <input
                          type="text"
                          placeholder="Contact name (e.g., Alice)"
                          value={saveAsContactLabel}
                          onChange={(e) => setSaveAsContactLabel(e.target.value)}
                          className="input text-sm mb-2"
                        />
                        {saveContactError && (
                          <p className="text-danger-500 text-xs mb-2">{saveContactError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveAsContact(pr.profiles!.wallet_address)}
                            disabled={isSavingContact || !saveAsContactLabel.trim()}
                            className="btn-primary-sm"
                          >
                            {isSavingContact ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSaveAsContactId(null); setSaveAsContactLabel(""); setSaveContactError(null); }}
                            className="btn-secondary-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSaveAsContactId(pr.id)}
                        className="mt-2 text-xs text-primary-500 hover:text-primary-400"
                      >
                        + Save as contact
                      </button>
                    )}
                  </>
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
              <p className="text-muted-foreground text-xs mt-1 flex items-center gap-1">
                To: {pr.payer_wallet_address ? (
                  getContactLabel(pr.payer_wallet_address) || (
                    <Name address={pr.payer_wallet_address as `0x${string}`} chain={base} className="font-mono" />
                  )
                ) : (
                  <span className="font-mono">Unknown</span>
                )}
              </p>
              {pr.memo && <p className="text-muted-foreground text-xs">{pr.memo}</p>}
              <button
                onClick={() => cancelRequest(pr.id, "cancel")}
                className="mt-2 btn-danger"
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
        className="w-full py-2 px-4 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 history-toggle-btn"
      >
        <span>{showHistory ? "Hide History" : "Show History"}</span>
        <ChevronDownIcon className={`transition-transform ${showHistory ? "rotate-180" : ""}`} />
      </button>

      {/* History Section */}
      {showHistory && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <p className="card-title mb-0">History</p>
            <select
              value={historyFilter}
              onChange={(e) => handleFilterChange(e.target.value as HistoryFilterType)}
              className="text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 history-filter-select"
            >
              <option value="all">All</option>
              <option value="contacts-only">Contacts Only</option>
              <option value="external-only">External Only</option>
            </select>
          </div>
          {allHistory.length === 0 ? (
            <p className="text-muted">No history yet</p>
          ) : (
            <>
              {allHistory.slice(0, historyDisplayCount).map((pr) => {
                const amountUSDC = (Number(pr.amount) / 1e6).toFixed(2);
                const balanceChange = pr.direction === "sent" ? `+$${amountUSDC}` : `-$${amountUSDC}`;
                const balanceColor = pr.direction === "sent" ? "text-success-500" : "text-danger-500";
                const otherAddress = pr.direction === "sent" ? pr.payer_wallet_address : pr.profiles?.wallet_address;
                const contactLabel = getContactLabel(otherAddress);
                const displayName = contactLabel || (otherAddress ? `${otherAddress.slice(0, 6)}...${otherAddress.slice(-4)}` : "Unknown");

                return (
                  <HistoryItem
                    key={pr.id}
                    pr={pr}
                    amountUSDC={amountUSDC}
                    balanceChange={balanceChange}
                    balanceColor={balanceColor}
                    contactLabel={contactLabel}
                    displayName={displayName}
                    otherAddress={otherAddress}
                  />
                );
              })}
              {allHistory.length > historyDisplayCount && (
                <button
                  onClick={() => setHistoryDisplayCount(prev => prev + 20)}
                  className="w-full py-2 text-sm text-primary-500 hover:text-primary-400 transition-colors"
                >
                  Load More ({allHistory.length - historyDisplayCount} remaining)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

// Extracted history item component for better maintainability
interface HistoryItemProps {
  pr: PaymentRequest & { direction: "sent" | "received" };
  amountUSDC: string;
  balanceChange: string;
  balanceColor: string;
  contactLabel: string | null;
  displayName: string;
  otherAddress: string | undefined;
}

function HistoryItem({ pr, amountUSDC, balanceChange, balanceColor, contactLabel, displayName, otherAddress }: HistoryItemProps) {
  return (
    <div className="list-item">
      {/* Main row with grid layout */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 items-start">
        {/* Row 1, Column 1: Direction */}
        <div className="min-w-0">
          <span className={`text-xs whitespace-nowrap ${pr.direction === "sent" ? "text-primary-500" : "text-primary-400"}`}>
            {pr.direction === "sent" ? "↑ Sent Request" : "↓ Received Request"}
          </span>
        </div>
        
        {/* Row 1, Column 2: Amount */}
        <div className="text-right whitespace-nowrap">
          <span className="font-medium">{amountUSDC} USDC</span>
        </div>
        
        {/* Row 1, Column 3: Status */}
        <div className="w-20 text-right">
          <span className={
            pr.status === "paid" ? "badge-paid" :
            pr.status === "rejected" ? "badge-rejected" :
            pr.status === "cancelled" ? "badge-cancelled" :
            "badge-pending"
          }>{pr.status}</span>
        </div>
        
        {/* Row 2, Column 1: Address/Contact */}
        <div className="min-w-0 truncate text-sm flex items-center">
          <span className="text-muted-foreground w-12 flex-shrink-0">
            {pr.direction === "sent" ? "To:" : "From:"}
          </span>
          <span className={contactLabel ? "font-medium" : "font-mono text-muted-foreground"}>
            {displayName}
          </span>
          {contactLabel && otherAddress && (
            <span className="text-xs text-muted-foreground ml-1 font-mono">
              ({otherAddress.slice(0, 6)}...{otherAddress.slice(-4)})
            </span>
          )}
        </div>
        
        {/* Row 2, Column 2: Empty */}
        <div></div>
        
        {/* Row 2, Column 3: Balance change (under status) */}
        <div className="w-20 text-right">
          {pr.status === "paid" && (
            <span className={`text-xs font-medium ${balanceColor}`}>
              {balanceChange}
            </span>
          )}
        </div>
      </div>
      
      {/* Memo and transaction link row */}
      {(pr.memo || pr.tx_hash) && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {pr.memo && <span>{pr.memo}</span>}
          {pr.tx_hash && (
            <a 
              href={`https://basescan.org/tx/${pr.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 hover:underline"
            >
              View transaction
            </a>
          )}
        </div>
      )}
    </div>
  );
}
