"use client";

import { useAccount, useReadContract } from "wagmi";
import { useCapabilities, useWriteContracts, useCallsStatus } from "wagmi/experimental";
import { useMemo } from "react";
import { parseUnits, encodeFunctionData } from "viem";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
  Address,
  Avatar,
  Name,
  Identity,
} from "@coinbase/onchainkit/identity";
import { AuthButton } from "@coinbase/cdp-react";
import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { useSupabaseWeb3Auth } from "@/lib/auth/useSupabaseWeb3Auth";
import { useCDPAuth } from "@/lib/auth/useCDPAuth";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { USDC_BASE_MAINNET } from "@/lib/constants";

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface Profile {
  id: string;
  wallet_address: string;
  created_at: string;
  last_seen_at: string;
}

interface Contact {
  id: string;
  owner_id: string;
  contact_wallet_address: string;
  label: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface PaymentRequest {
  id: string;
  requester_id: string;
  payer_wallet_address: string;
  token_address: string;
  chain_id: number;
  amount: number;
  memo: string | null;
  status: "pending" | "paid" | "cancelled" | "expired";
  tx_hash: string | null;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { wallet_address: string };
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  
  const { address, isConnected } = useAccount();
  const { isSignedIn: isCDPSignedIn } = useIsSignedIn();
  
  const walletAuth = useSupabaseWeb3Auth();
  const cdpAuth = useCDPAuth();
  
  const currentWalletAddress = address || cdpAuth.walletAddress;
  
  // USDC Balance with periodic refresh
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_BASE_MAINNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: currentWalletAddress ? [currentWalletAddress as `0x${string}`] : undefined,
    query: { 
      enabled: !!currentWalletAddress,
      refetchInterval: 10000, // Refresh every 10 seconds
    },
  });
  
  const formattedBalance = usdcBalance 
    ? (Number(usdcBalance) / 1e6).toFixed(2) 
    : "0.00";
  
  const isAuthenticated = walletAuth.isAuthenticated || cdpAuth.isAuthenticated;
  const user = walletAuth.user || cdpAuth.user;
  const authError = walletAuth.error || cdpAuth.error;
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [paymentRequestsError, setPaymentRequestsError] = useState<string | null>(null);
  
  // Payment request form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPayerAddress, setNewPayerAddress] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  
  // Contact form state
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContactAddress, setNewContactAddress] = useState("");
  const [newContactLabel, setNewContactLabel] = useState("");
  const [newContactNote, setNewContactNote] = useState("");
  const [addContactError, setAddContactError] = useState<string | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  
  // Transaction state
  const [payingRequestId, setPayingRequestId] = useState<string | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<"requests" | "contacts">("requests");
  
  // Paymaster capabilities
  const { data: availableCapabilities } = useCapabilities({
    account: address,
  });
  
  const capabilities = useMemo(() => {
    if (!availableCapabilities || !address) return {};
    const capabilitiesForChain = availableCapabilities[8453]; // Base mainnet
    if (
      capabilitiesForChain?.paymasterService &&
      capabilitiesForChain.paymasterService.supported
    ) {
      return {
        paymasterService: {
          url: `https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}`,
        },
      };
    }
    return {};
  }, [availableCapabilities, address]);
  
  // Sponsored transaction with useWriteContracts
  const { writeContracts, data: callsId, isPending: isSending } = useWriteContracts();
  const callsIdString = typeof callsId === "string" ? callsId : callsId?.id;
  const { data: callsStatus } = useCallsStatus({
    id: callsIdString || "",
    query: { enabled: !!callsIdString },
  });
  
  const isConfirming = callsStatus?.status === "pending";
  const isConfirmed = callsStatus?.status === "success";
  const txHash = callsStatus?.receipts?.[0]?.transactionHash;

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Update payment request status when transaction is confirmed
  useEffect(() => {
    if (isConfirmed && txHash && payingRequestId) {
      updatePaymentRequestStatus(payingRequestId, txHash);
    }
  }, [isConfirmed, txHash, payingRequestId]);

  const loadProfile = async () => {
    if (!user) return;

    setProfileError(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      setProfileError(error.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
  };

  const loadContacts = async () => {
    if (!currentWalletAddress) return;

    setContactsError(null);
    try {
      // Get profile ID by wallet
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .eq("wallet_address", currentWalletAddress.toLowerCase())
        .single();
      
      if (!profileData) {
        setContacts([]);
        return;
      }
      
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("owner_id", profileData.id)
        .order("created_at", { ascending: false });

      if (error) {
        setContactsError(error.message);
        setContacts([]);
      } else {
        setContacts(data || []);
      }
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : "Failed to load contacts");
      setContacts([]);
    }
  };
  
  const addContact = async () => {
    if (!currentWalletAddress || !newContactAddress || !newContactLabel) return;
    
    setIsAddingContact(true);
    setAddContactError(null);
    
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("wallet_address", currentWalletAddress.toLowerCase())
        .single();
      
      if (profileError || !profileData) {
        throw new Error("Profile not found. Please sign in again.");
      }
      
      const { error } = await supabase.from("contacts").insert({
        owner_id: profileData.id,
        contact_wallet_address: newContactAddress.toLowerCase(),
        label: newContactLabel,
        note: newContactNote || null,
      });
      
      if (error) throw error;
      
      // Reset form and reload
      setNewContactAddress("");
      setNewContactLabel("");
      setNewContactNote("");
      setShowAddContactForm(false);
      await loadContacts();
    } catch (err) {
      setAddContactError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setIsAddingContact(false);
    }
  };

  const loadPaymentRequests = async () => {
    if (!currentWalletAddress) return;

    setPaymentRequestsError(null);
    // Only load payment requests where current wallet is the payer (received requests)
    const { data, error } = await supabase
      .from("payment_requests")
      .select("*, profiles!requester_id(wallet_address)")
      .eq("payer_wallet_address", currentWalletAddress.toLowerCase())
      .order("created_at", { ascending: false });

    if (error) {
      setPaymentRequestsError(error.message);
      setPaymentRequests([]);
    } else {
      setPaymentRequests(data || []);
    }
  };

  const createPaymentRequest = async () => {
    if (!currentWalletAddress || !newPayerAddress || !newAmount) return;
    
    setIsCreating(true);
    setCreateError(null);
    
    try {
      // Look up profile ID by wallet address
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("wallet_address", currentWalletAddress.toLowerCase())
        .single();
      
      if (profileError || !profileData) {
        throw new Error("Profile not found. Please sign in again.");
      }
      
      const amountInMicroUnits = Math.floor(parseFloat(newAmount) * 1e6);
      
      const { error } = await supabase.from("payment_requests").insert({
        requester_id: profileData.id,
        payer_wallet_address: newPayerAddress.toLowerCase(),
        amount: amountInMicroUnits,
        memo: newMemo || null,
      });
      
      if (error) throw error;
      
      // Reset form and reload
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

  const updatePaymentRequestStatus = async (requestId: string, hash: string) => {
    await supabase
      .from("payment_requests")
      .update({
        status: "paid",
        tx_hash: hash,
        paid_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    
    setPayingRequestId(null);
    await loadPaymentRequests();
  };

  const payPaymentRequest = useCallback((request: PaymentRequest) => {
    if (!address) return;
    
    // Get requester's wallet address (the person to pay)
    const requesterWallet = request.profiles?.wallet_address;
    if (!requesterWallet) {
      console.error("No requester wallet found");
      return;
    }
    
    setPayingRequestId(request.id);
    
    // Use writeContracts with paymaster for gasless transaction
    writeContracts({
      contracts: [
        {
          address: USDC_BASE_MAINNET as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [requesterWallet as `0x${string}`, BigInt(request.amount)],
        },
      ],
      capabilities,
    });
  }, [address, writeContracts, capabilities]);

  if (!mounted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">BaseSplit</h1>
            <p className="text-gray-400">Split expenses on Base</p>
          </div>
          <div className="flex justify-center">
            <div className="animate-pulse text-gray-400">Loading...</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">BaseSplit</h1>
          <p className="text-gray-400">Split expenses on Base</p>
        </div>

        <div className="space-y-6">
          {/* Show login options only if not authenticated */}
          {!isAuthenticated && (
            <>
              {/* Social Login - CDP Embedded Wallet */}
              <div className="flex flex-col items-center gap-3">
                <p className="text-gray-400 text-sm text-center">
                  Sign in with email or social
                </p>
                <AuthButton />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-gray-500 text-sm">or</span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>

              {/* Connect Wallet - OnchainKit */}
              <div className="flex justify-center">
                <Wallet>
                  <ConnectWallet>
                    <Avatar className="h-6 w-6" />
                    <Name />
                  </ConnectWallet>
                  <WalletDropdown>
                    <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                      <Avatar />
                      <Name />
                      <Address />
                    </Identity>
                    <WalletDropdownDisconnect />
                  </WalletDropdown>
                </Wallet>
              </div>
            </>
          )}

          {/* Show connected wallet info and balance */}
          {(isConnected || isCDPSignedIn) && (
            <div className="bg-gray-900 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-center gap-2">
                <p className="text-white font-mono text-sm">
                  {(address || cdpAuth.walletAddress)?.slice(0, 6)}...{(address || cdpAuth.walletAddress)?.slice(-4)}
                </p>
                <button
                  onClick={() => {
                    const wallet = address || cdpAuth.walletAddress;
                    if (wallet) navigator.clipboard.writeText(wallet);
                  }}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                  title="Copy address"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <div className="text-center border-t border-gray-700 pt-3">
                <p className="text-3xl font-bold text-white">
                  ${formattedBalance}
                </p>
                <p className="text-xs text-gray-500">USDC</p>
              </div>
            </div>
          )}

          {/* Sign in to Supabase if wallet connected but not authenticated */}
          {isConnected && !walletAuth.isAuthenticated && !isCDPSignedIn && (
            <button
              onClick={walletAuth.signIn}
              disabled={walletAuth.status === "signing_in"}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {walletAuth.status === "signing_in" ? "Signing in..." : "Sign in to Supabase"}
            </button>
          )}

          {/* Auth Status */}
          <div className="border-t border-gray-700 pt-6">
            <div className="text-center mb-4">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  isAuthenticated
                    ? "bg-green-900 text-green-300"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                Supabase: {isAuthenticated ? "authenticated" : "signed out"}
              </span>
            </div>

            {authError && (
              <p className="text-red-400 text-sm text-center mb-4">{authError}</p>
            )}

            {isAuthenticated && (
              <button
                onClick={walletAuth.isAuthenticated ? walletAuth.signOut : cdpAuth.signOut}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                Sign out
              </button>
            )}
          </div>

          {isAuthenticated && user && (
            <div className="border-t border-gray-700 pt-6 space-y-4">
              {/* Tab Navigation */}
              <div className="flex rounded-lg bg-gray-900 p-1">
                <button
                  onClick={() => {
                    setActiveTab("requests");
                    loadPaymentRequests();
                  }}
                  className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "requests"
                      ? "bg-gray-700 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Requests
                </button>
                <button
                  onClick={() => {
                    setActiveTab("contacts");
                    loadContacts();
                  }}
                  className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "contacts"
                      ? "bg-gray-700 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Contacts
                </button>
              </div>

              {/* Contacts Tab */}
              {activeTab === "contacts" && (
                <>
                  <button
                    onClick={() => setShowAddContactForm(!showAddContactForm)}
                    className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
                  >
                    {showAddContactForm ? "Cancel" : "Add Contact"}
                  </button>

                  {/* Add Contact Form */}
                  {showAddContactForm && (
                    <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                      <p className="text-sm text-gray-400 font-medium">Add New Contact</p>
                      <input
                        type="text"
                        placeholder="Contact label (e.g., Alice)"
                        value={newContactLabel}
                        onChange={(e) => setNewContactLabel(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Wallet address (0x...)"
                        value={newContactAddress}
                        onChange={(e) => setNewContactAddress(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        value={newContactNote}
                        onChange={(e) => setNewContactNote(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      {addContactError && (
                        <p className="text-red-400 text-xs">{addContactError}</p>
                      )}
                      <button
                        onClick={addContact}
                        disabled={isAddingContact || !newContactAddress || !newContactLabel}
                        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                      >
                        {isAddingContact ? "Adding..." : "Add Contact"}
                      </button>
                    </div>
                  )}

                  {contactsError && (
                    <p className="text-red-400 text-sm text-center">{contactsError}</p>
                  )}

                  {contacts.length > 0 ? (
                    <div className="bg-gray-900 rounded-lg p-4 space-y-2">
                      {contacts.map((c) => (
                        <div key={c.id} className="text-white text-sm border-b border-gray-700 pb-2 last:border-0">
                          <span className="font-medium">{c.label}</span>
                          <span className="text-gray-500 font-mono text-xs ml-2">
                            {c.contact_wallet_address.slice(0, 6)}...{c.contact_wallet_address.slice(-4)}
                          </span>
                          {c.note && <p className="text-gray-400 text-xs mt-1">{c.note}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm text-center">No contacts yet</p>
                  )}
                </>
              )}

              {/* Requests Tab */}
              {activeTab === "requests" && (
                <>
                  <button
                    onClick={() => {
                      const newState = !showCreateForm;
                      setShowCreateForm(newState);
                      if (newState) {
                        loadContacts(); // Load contacts when opening form
                      } else {
                        setContactSearch("");
                        setShowContactDropdown(false);
                        setNewPayerAddress("");
                      }
                    }}
                    className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                  >
                    {showCreateForm ? "Cancel" : "Create Request"}
                  </button>

                  {/* Create Payment Request Form */}
                  {showCreateForm && (
                    <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                      <p className="text-sm text-gray-400 font-medium">New Payment Request</p>
                      
                      {/* Contact Search / Payer Address */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search contacts or enter wallet address..."
                          value={contactSearch || newPayerAddress}
                          onChange={(e) => {
                            const value = e.target.value;
                            setContactSearch(value);
                            if (value.startsWith("0x")) {
                              setNewPayerAddress(value);
                            }
                            setShowContactDropdown(value.length > 0 && !value.startsWith("0x"));
                          }}
                          onFocus={() => {
                            if (contacts.length > 0 && !newPayerAddress.startsWith("0x")) {
                              setShowContactDropdown(true);
                            }
                          }}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        
                        {/* Contact Dropdown */}
                        {showContactDropdown && contacts.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
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
                                  className="w-full px-3 py-2 text-left hover:bg-gray-700 text-white text-sm flex justify-between items-center"
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
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Memo (optional)"
                        value={newMemo}
                        onChange={(e) => setNewMemo(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      {createError && (
                        <p className="text-red-400 text-xs">{createError}</p>
                      )}
                      <button
                        onClick={createPaymentRequest}
                        disabled={isCreating || !newPayerAddress || !newAmount}
                        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                      >
                        {isCreating ? "Creating..." : "Create Request"}
                      </button>
                    </div>
                  )}

                  {paymentRequestsError && (
                    <p className="text-red-400 text-sm text-center">{paymentRequestsError}</p>
                  )}

                  {paymentRequests.length > 0 ? (
                    <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                      {paymentRequests.map((pr) => {
                        const currentWallet = (address || cdpAuth.walletAddress)?.toLowerCase();
                        const canPay = pr.status === "pending" && currentWallet === pr.payer_wallet_address;
                        const isPaying = payingRequestId === pr.id;
                        
                        return (
                          <div key={pr.id} className="text-white text-sm border-b border-gray-700 pb-3 last:border-0">
                            <div className="flex justify-between items-center">
                              <span className="font-medium">{(Number(pr.amount) / 1e6).toFixed(2)} USDC</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                pr.status === "paid" ? "bg-green-800 text-green-300" :
                                pr.status === "pending" ? "bg-yellow-800 text-yellow-300" :
                                "bg-gray-700 text-gray-300"
                              }`}>{pr.status}</span>
                            </div>
                            <p className="text-gray-500 font-mono text-xs mt-1">
                              From: {pr.profiles?.wallet_address?.slice(0, 6)}...{pr.profiles?.wallet_address?.slice(-4)}
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
                            {canPay && (
                              <button
                                onClick={() => payPaymentRequest(pr)}
                                disabled={isPaying || isSending || isConfirming}
                                className="mt-2 w-full py-1.5 px-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                              >
                                {isPaying && isSending ? "Sending..." : 
                                 isPaying && isConfirming ? "Confirming..." : 
                                 "Pay Now"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm text-center">No payment requests yet</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
