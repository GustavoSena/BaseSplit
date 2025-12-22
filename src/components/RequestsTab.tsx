"use client";

import { useState, useEffect, useCallback } from "react";
import { base } from "viem/chains";
import { Name } from "@coinbase/onchainkit/identity";
import { RefreshIcon, ChevronDownIcon } from "./Icons";
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
  onSendMoney?: (toAddress: string, amount: number, memo?: string, saveAsContact?: boolean, contactLabel?: string) => void;
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

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [newPayerAddress, setNewPayerAddress] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterType>("all");
  const [isFilterLoaded, setIsFilterLoaded] = useState(false);
  
  // Save as contact state for request/send forms
  const [saveNewContact, setSaveNewContact] = useState(false);
  const [newContactLabel, setNewContactLabel] = useState("");

  // Handle prefilled contact from Contacts tab "Request Money" button
  useEffect(() => {
    if (prefilledContact) {
      setNewPayerAddress(prefilledContact.contact_wallet_address);
      setContactSearch(prefilledContact.label);
      setShowCreateForm(true);
      onPrefilledContactUsed?.();
    }
  }, [prefilledContact, onPrefilledContactUsed]);

  // Load user's filter preference from profile
  useEffect(() => {
    const loadFilterPreference = async () => {
      if (!currentWalletAddress) return;
      const result = await getProfileByWallet(currentWalletAddress);
      if (result.data?.history_filter_default) {
        setHistoryFilter(result.data.history_filter_default);
      }
      setIsFilterLoaded(true);
    };
    loadFilterPreference();
  }, [currentWalletAddress]);

  // Save filter preference when changed
  const handleFilterChange = async (newFilter: HistoryFilterType) => {
    const previousFilter = historyFilter;
    setHistoryFilter(newFilter);
    if (currentWalletAddress) {
      const result = await updateHistoryFilterPreference({
        walletAddress: currentWalletAddress,
        filterType: newFilter,
      });
      if (result.error) {
        // Revert to previous filter if persistence failed
        setHistoryFilter(previousFilter);
        console.error("Failed to save filter preference:", result.error);
      }
    }
  };

  // Helper to check if an address is a contact
  const isContact = useCallback((address: string | undefined) => {
    if (!address) return false;
    return contacts.some(c => c.contact_wallet_address.toLowerCase() === address.toLowerCase());
  }, [contacts]);

  // Save as contact state (for issue #12)
  const [saveAsContactId, setSaveAsContactId] = useState<string | null>(null);
  const [saveAsContactLabel, setSaveAsContactLabel] = useState("");
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [saveContactError, setSaveContactError] = useState<string | null>(null);

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
      
      // Save as contact if checkbox was checked and address is not already a contact
      if (saveNewContact && newContactLabel.trim() && !isContact(newPayerAddress)) {
        await createContact({
          ownerId: profileResult.data.id,
          contactWalletAddress: newPayerAddress,
          label: newContactLabel.trim(),
        });
        loadContacts();
      }
      
      setNewPayerAddress("");
      setNewAmount("");
      setNewMemo("");
      setContactSearch("");
      setShowContactDropdown(false);
      setShowCreateForm(false);
      setSaveNewContact(false);
      setNewContactLabel("");
      await loadPaymentRequests();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create payment request");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle sending money directly
  const handleSendMoney = () => {
    if (!currentWalletAddress || !newPayerAddress || !newAmount || !onSendMoney) return;
    
    const trimmedAmount = newAmount.trim();
    if (!trimmedAmount) {
      setCreateError("Please enter an amount");
      return;
    }
    const amount = parseFloat(trimmedAmount);
    if (isNaN(amount) || amount < 0.01) {
      setCreateError("Minimum amount is $0.01 USDC");
      return;
    }
    if (amount > 10000) {
      setCreateError("Maximum amount is $10,000 USDC");
      return;
    }
    
    setCreateError(null);
    onSendMoney(
      newPayerAddress, 
      amount, 
      newMemo || undefined,
      saveNewContact && !isContact(newPayerAddress) ? true : undefined,
      saveNewContact ? newContactLabel.trim() : undefined
    );
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
            const newState = !showCreateForm;
            setShowCreateForm(newState);
            setShowSendForm(false);
            if (newState) {
              loadContacts();
            } else {
              setContactSearch("");
              setShowContactDropdown(false);
              setNewPayerAddress("");
              setNewAmount("");
              setNewMemo("");
              setSaveNewContact(false);
              setNewContactLabel("");
            }
          }}
          className={`flex-1 ${showCreateForm ? "btn-secondary" : "btn-success"}`}
        >
          {showCreateForm ? "Cancel" : "Request"}
        </button>
        <button
          onClick={() => {
            const newState = !showSendForm;
            setShowSendForm(newState);
            setShowCreateForm(false);
            if (newState) {
              loadContacts();
            } else {
              setContactSearch("");
              setShowContactDropdown(false);
              setNewPayerAddress("");
              setNewAmount("");
              setNewMemo("");
              setSaveNewContact(false);
              setNewContactLabel("");
            }
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
            
            {showContactDropdown && contacts.length > 0 && (() => {
              const filteredContacts = contacts.filter(c => 
                contactSearch === "" ||
                c.label.toLowerCase().includes(contactSearch.toLowerCase()) ||
                c.contact_wallet_address.toLowerCase().includes(contactSearch.toLowerCase())
              );
              return (
                <div className="dropdown">
                  {filteredContacts.map((c) => (
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
                  {filteredContacts.length === 0 && (
                    <p className="px-3 py-2 text-gray-500 text-sm">No matching contacts</p>
                  )}
                </div>
              );
            })()}
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
          
          {/* Save as contact option - show only if address is not already a contact */}
          {newPayerAddress && !isContact(newPayerAddress) && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveNewContact}
                  onChange={(e) => setSaveNewContact(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500"
                />
                Save as contact
              </label>
              {saveNewContact && (
                <input
                  type="text"
                  placeholder="Contact name (e.g., Alice)"
                  value={newContactLabel}
                  onChange={(e) => setNewContactLabel(e.target.value)}
                  className="input text-sm"
                />
              )}
            </div>
          )}
          
          {createError && (
            <p className="text-error">{createError}</p>
          )}
          <button
            onClick={createPaymentRequest}
            disabled={isCreating || !newPayerAddress || !newAmount || (saveNewContact && !newContactLabel.trim())}
            className="w-full btn-primary"
          >
            {isCreating ? "Creating..." : "Create Request"}
          </button>
        </div>
      )}

      {/* Send Money Form */}
      {showSendForm && (
        <div className="card">
          <p className="card-title">Send Money</p>
          
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
            
            {showContactDropdown && contacts.length > 0 && (() => {
              const filteredContacts = contacts.filter(c => 
                contactSearch === "" ||
                c.label.toLowerCase().includes(contactSearch.toLowerCase()) ||
                c.contact_wallet_address.toLowerCase().includes(contactSearch.toLowerCase())
              );
              return (
                <div className="dropdown">
                  {filteredContacts.map((c) => (
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
                  {filteredContacts.length === 0 && (
                    <p className="px-3 py-2 text-gray-500 text-sm">No matching contacts</p>
                  )}
                </div>
              );
            })()}
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
          
          {/* Save as contact option - show only if address is not already a contact */}
          {newPayerAddress && !isContact(newPayerAddress) && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveNewContact}
                  onChange={(e) => setSaveNewContact(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500"
                />
                Save as contact
              </label>
              {saveNewContact && (
                <input
                  type="text"
                  placeholder="Contact name (e.g., Alice)"
                  value={newContactLabel}
                  onChange={(e) => setNewContactLabel(e.target.value)}
                  className="input text-sm"
                />
              )}
            </div>
          )}
          
          {createError && (
            <p className="text-error">{createError}</p>
          )}
          <button
            onClick={handleSendMoney}
            disabled={isSending || isConfirming || !newPayerAddress || !newAmount || (saveNewContact && !newContactLabel.trim())}
            className="w-full btn-success"
          >
            {isSending ? "Sending..." : isConfirming ? "Confirming..." : "Send Money"}
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
                  From: {pr.profiles?.wallet_address ? (
                    <Name address={pr.profiles.wallet_address as `0x${string}`} chain={base} className="font-mono" />
                  ) : (
                    <span className="font-mono">Unknown</span>
                  )}
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
                
                {/* Save as Contact option - show if requester is not already a contact */}
                {pr.profiles?.wallet_address && !isContact(pr.profiles.wallet_address) && (
                  <>
                    {saveAsContactId === pr.id ? (
                      <div className="mt-2 p-2 bg-blue-900/20 border border-blue-800 rounded">
                        <p className="text-xs text-blue-300 mb-2">Save as contact</p>
                        <input
                          type="text"
                          placeholder="Contact name (e.g., Alice)"
                          value={saveAsContactLabel}
                          onChange={(e) => setSaveAsContactLabel(e.target.value)}
                          className="w-full text-sm px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white mb-2"
                        />
                        {saveContactError && (
                          <p className="text-red-400 text-xs mb-2">{saveContactError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveAsContact(pr.profiles!.wallet_address)}
                            disabled={isSavingContact || !saveAsContactLabel.trim()}
                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                          >
                            {isSavingContact ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSaveAsContactId(null); setSaveAsContactLabel(""); setSaveContactError(null); }}
                            className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSaveAsContactId(pr.id)}
                        className="mt-2 text-xs text-blue-400 hover:text-blue-300"
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
              <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                To: {pr.payer_wallet_address ? (
                  <Name address={pr.payer_wallet_address as `0x${string}`} chain={base} className="font-mono" />
                ) : (
                  <span className="font-mono">Unknown</span>
                )}
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
          <div className="flex justify-between items-center mb-3">
            <p className="card-title mb-0">History</p>
            <select
              value={historyFilter}
              onChange={(e) => handleFilterChange(e.target.value as HistoryFilterType)}
              className="text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="contacts-only">Contacts Only</option>
              <option value="external-only">External Only</option>
            </select>
          </div>
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
              .filter(pr => {
                // Apply contact filter
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

            if (allHistory.length === 0) {
              return <p className="text-muted">No history yet</p>;
            }

            return allHistory.map((pr) => {
              const amountUSDC = (Number(pr.amount) / 1e6).toFixed(2);
              // Balance change indicator:
              // - "sent" = user CREATED the request (requesting payment FROM someone else)
              //   → When paid, user's balance INCREASES (+) because they received money
              // - "received" = user was ASKED to pay (someone requested payment FROM user)
              //   → When paid, user's balance DECREASES (-) because they sent money
              const balanceChange = pr.direction === "sent" ? `+$${amountUSDC}` : `-$${amountUSDC}`;
              const balanceColor = pr.direction === "sent" ? "text-green-400" : "text-red-400";

              return (
                <div key={pr.id} className="list-item">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${pr.direction === "sent" ? "text-blue-400" : "text-purple-400"}`}>
                        {pr.direction === "sent" ? "↑ Sent Request" : "↓ Received Request"}
                      </span>
                      <span className="font-medium">{amountUSDC} USDC</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {pr.status === "paid" && (
                        <span className={`text-xs font-medium ${balanceColor}`}>
                          {balanceChange}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        pr.status === "paid" ? "bg-green-800 text-green-300" :
                        pr.status === "rejected" ? "bg-orange-800 text-orange-300" :
                        pr.status === "cancelled" ? "bg-red-800 text-red-300" :
                        "bg-gray-700 text-gray-300"
                      }`}>{pr.status}</span>
                    </div>
                  </div>
                  <p className="text-gray-500 font-mono text-xs mt-1">
                    {pr.direction === "sent" 
                      ? `To: ${pr.payer_wallet_address ? `${pr.payer_wallet_address.slice(0, 6)}...${pr.payer_wallet_address.slice(-4)}` : "Unknown"}`
                      : `From: ${pr.profiles?.wallet_address ? `${pr.profiles.wallet_address.slice(0, 6)}...${pr.profiles.wallet_address.slice(-4)}` : "Unknown"}`
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
              );
            });
          })()}
        </div>
      )}
    </>
  );
}
