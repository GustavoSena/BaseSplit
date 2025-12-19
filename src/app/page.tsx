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

/**
 * Render the main BaseSplit application UI and orchestrate authentication, on‑chain balances, contacts, and payment request workflows.
 *
 * Handles user sign-in (wallet and CDP), reads USDC balances, provides tabbed views for Requests, Contacts, and Settings, and manages creating, listing, and paying payment requests with Supabase synchronization and optional paymaster‑sponsored transactions.
 *
 * @returns The React element for the Home page.
 */
export default function Home() {
  const [mounted, setMounted] = useState(false);
  
  const { address, isConnected } = useAccount();
  const { isSignedIn: isCDPSignedIn } = useIsSignedIn();
  
  const walletAuth = useSupabaseWeb3Auth();
  const cdpAuth = useCDPAuth();
  
  const currentWalletAddress = address || cdpAuth.walletAddress;
  
  // USDC Balance for current wallet with periodic refresh
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_BASE_MAINNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: currentWalletAddress ? [currentWalletAddress as `0x${string}`] : undefined,
    query: { 
      enabled: !!currentWalletAddress,
      refetchInterval: 10000,
    },
  });
  
  // USDC Balance for smart account
  const { data: smartAccountBalance } = useReadContract({
    address: USDC_BASE_MAINNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: cdpAuth.smartAccountAddress ? [cdpAuth.smartAccountAddress as `0x${string}`] : undefined,
    query: { 
      enabled: !!cdpAuth.smartAccountAddress,
      refetchInterval: 10000,
    },
  });
  
  // USDC Balance for EOA
  const { data: eoaBalance } = useReadContract({
    address: USDC_BASE_MAINNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: cdpAuth.eoaAddress ? [cdpAuth.eoaAddress as `0x${string}`] : undefined,
    query: { 
      enabled: !!cdpAuth.eoaAddress,
      refetchInterval: 10000,
    },
  });
  
  const formattedBalance = usdcBalance 
    ? (Number(usdcBalance) / 1e6).toFixed(2) 
    : "0.00";
  
  const formattedSmartBalance = smartAccountBalance 
    ? (Number(smartAccountBalance) / 1e6).toFixed(2) 
    : "0.00";
  
  const formattedEoaBalance = eoaBalance 
    ? (Number(eoaBalance) / 1e6).toFixed(2) 
    : "0.00";
  
  const isAuthenticated = walletAuth.isAuthenticated || cdpAuth.isAuthenticated;
  const user = walletAuth.user || cdpAuth.user;
  const authError = walletAuth.error || cdpAuth.error;
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<PaymentRequest[]>([]);
  const [paymentRequestsError, setPaymentRequestsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
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
  const [activeTab, setActiveTab] = useState<"requests" | "contacts" | "settings">("requests");
  
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

  const loadPaymentRequests = useCallback(async (showRefreshIndicator = false) => {
    if (!currentWalletAddress) return;

    if (showRefreshIndicator) setIsRefreshing(true);
    setPaymentRequestsError(null);
    
    try {
      // Load incoming requests (where current wallet is the payer)
      const { data: incoming, error: incomingError } = await supabase
        .from("payment_requests")
        .select("*, profiles!requester_id(wallet_address)")
        .eq("payer_wallet_address", currentWalletAddress.toLowerCase())
        .order("created_at", { ascending: false });

      if (incomingError) {
        setPaymentRequestsError(incomingError.message);
        setPaymentRequests([]);
      } else {
        setPaymentRequests(incoming || []);
      }

      // Load sent requests (where current wallet is the requester)
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .eq("wallet_address", currentWalletAddress.toLowerCase())
        .single();

      if (profileData) {
        const { data: sent, error: sentError } = await supabase
          .from("payment_requests")
          .select("*, profiles!requester_id(wallet_address)")
          .eq("requester_id", profileData.id)
          .order("created_at", { ascending: false });

        if (sentError) {
          setPaymentRequestsError(prev => 
            prev ? `${prev}; Failed to load sent requests` : "Failed to load sent requests"
          );
          setSentRequests([]);
        } else {
          setSentRequests(sent || []);
        }
      }
    } finally {
      if (showRefreshIndicator) setIsRefreshing(false);
    }
  }, [currentWalletAddress]);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Refetch balance when wallet address changes
  useEffect(() => {
    if (currentWalletAddress) {
      refetchBalance();
    }
  }, [currentWalletAddress, refetchBalance]);
  
  // Update payment request status when transaction is confirmed
  useEffect(() => {
    if (isConfirmed && txHash && payingRequestId) {
      updatePaymentRequestStatus(payingRequestId, txHash);
    }
  }, [isConfirmed, txHash, payingRequestId]);

  // Load payment requests on mount and when authenticated
  useEffect(() => {
    if (isAuthenticated && currentWalletAddress) {
      loadPaymentRequests();
    }
  }, [isAuthenticated, currentWalletAddress, loadPaymentRequests]);

  // Periodic refresh of payment requests (every 30 seconds)
  useEffect(() => {
    if (!isAuthenticated || !currentWalletAddress) return;
    
    const interval = setInterval(() => {
      loadPaymentRequests();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isAuthenticated, currentWalletAddress, loadPaymentRequests]);

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

  const createPaymentRequest = async () => {
    if (!currentWalletAddress || !newPayerAddress || !newAmount) return;
    
    // Validate amount
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
      // Look up profile ID by wallet address
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("wallet_address", currentWalletAddress.toLowerCase())
        .single();
      
      if (profileError || !profileData) {
        throw new Error("Profile not found. Please sign in again.");
      }
      
      const amountInMicroUnits = Math.floor(amount * 1e6);
      
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

  const cancelRequest = async (requestId: string, action: "reject" | "cancel") => {
    // Client-side authorization check
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
    // Note: "cancel" action authorization is enforced by RLS (requester must own the request)
    
    const { error } = await supabase
      .from("payment_requests")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    
    if (error) {
      setPaymentRequestsError(`Failed to ${action} request: ${error.message}`);
      return;
    }
    
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

  // Navigation items for the navbar
  const navItems = [
    { id: "requests" as const, label: "Requests", icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    )},
    { id: "contacts" as const, label: "Contacts", icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { id: "settings" as const, label: "Settings", icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
  ];

  // Not authenticated - show login screen
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black px-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-2">BaseSplit</h1>
            <p className="text-gray-400">Split expenses on Base</p>
          </div>

          <div className="space-y-4">
            {/* Social Login - CDP Embedded Wallet */}
            <div className="flex flex-col items-center gap-3">
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

            {/* Sign in to Supabase if wallet connected */}
            {isConnected && !walletAuth.isAuthenticated && (
              <button
                onClick={walletAuth.signIn}
                disabled={walletAuth.status === "signing_in"}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {walletAuth.status === "signing_in" ? "Signing in..." : "Continue"}
              </button>
            )}

            {authError && (
              <p className="text-red-400 text-sm text-center">{authError}</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Authenticated - show app
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex flex-col">
      {/* Desktop Header */}
      <header className="hidden md:block bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-bold text-white">BaseSplit</h1>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id === "requests") loadPaymentRequests();
                    if (item.id === "contacts") loadContacts();
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === item.id
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto pb-20 md:pb-8">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Balance Card */}
          <div className="bg-gray-800 rounded-2xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <p className="text-gray-400 font-mono text-sm">
                {currentWalletAddress?.slice(0, 6)}...{currentWalletAddress?.slice(-4)}
              </p>
              <button
                onClick={() => {
                  if (currentWalletAddress) navigator.clipboard.writeText(currentWalletAddress);
                }}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
                title="Copy address"
              >
                <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <p className="text-4xl font-bold text-white">${formattedBalance}</p>
            <p className="text-gray-500 text-sm">USDC Balance</p>
          </div>

          {/* Tab Content */}
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

          {/* Settings Tab */}
          {activeTab === "settings" && (
                <div className="space-y-4">
                  <h3 className="text-white font-medium">Wallet Settings</h3>
                  
                  {isCDPSignedIn && cdpAuth.smartAccountAddress && cdpAuth.eoaAddress ? (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400">Select which wallet to use:</p>
                      
                      {/* Smart Account Option */}
                      <button
                        onClick={() => cdpAuth.switchWalletType("smart")}
                        className={`w-full p-4 rounded-lg border-2 transition-colors text-left ${
                          cdpAuth.selectedWalletType === "smart"
                            ? "border-blue-500 bg-blue-900/20"
                            : "border-gray-700 bg-gray-900 hover:border-gray-600"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-white font-medium">Smart Account</p>
                            <p className="text-gray-500 font-mono text-xs">
                              {cdpAuth.smartAccountAddress.slice(0, 10)}...{cdpAuth.smartAccountAddress.slice(-8)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-bold">${formattedSmartBalance}</p>
                            <p className="text-gray-500 text-xs">USDC</p>
                          </div>
                        </div>
                        {cdpAuth.selectedWalletType === "smart" && (
                          <span className="inline-block mt-2 text-xs text-blue-400">✓ Active</span>
                        )}
                      </button>
                      
                      {/* EOA Option */}
                      <button
                        onClick={() => cdpAuth.switchWalletType("eoa")}
                        className={`w-full p-4 rounded-lg border-2 transition-colors text-left ${
                          cdpAuth.selectedWalletType === "eoa"
                            ? "border-blue-500 bg-blue-900/20"
                            : "border-gray-700 bg-gray-900 hover:border-gray-600"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-white font-medium">EOA Wallet</p>
                            <p className="text-gray-500 font-mono text-xs">
                              {cdpAuth.eoaAddress.slice(0, 10)}...{cdpAuth.eoaAddress.slice(-8)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-bold">${formattedEoaBalance}</p>
                            <p className="text-gray-500 text-xs">USDC</p>
                          </div>
                        </div>
                        {cdpAuth.selectedWalletType === "eoa" && (
                          <span className="inline-block mt-2 text-xs text-blue-400">✓ Active</span>
                        )}
                      </button>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">
                      {isCDPSignedIn 
                        ? "Only one wallet type available" 
                        : "Sign in with social login to manage wallet settings"}
                    </p>
                  )}
                  
                  {/* Sign Out Button */}
                  <button
                    onClick={walletAuth.isAuthenticated ? walletAuth.signOut : cdpAuth.signOut}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
          )}

          {/* Requests Tab */}
          {activeTab === "requests" && (
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
                      className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      {showCreateForm ? "Cancel" : "Create Request"}
                    </button>
                    <button
                      onClick={() => loadPaymentRequests(true)}
                      disabled={isRefreshing}
                      className="p-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 rounded-lg transition-colors"
                      title="Refresh requests"
                    >
                      <svg 
                        className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>

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

                  {/* Pending Incoming Requests */}
                  {(() => {
                    const pendingIncoming = paymentRequests.filter(pr => pr.status === "pending");
                    const pendingSent = sentRequests.filter(pr => pr.status === "pending");
                    const currentWallet = currentWalletAddress?.toLowerCase();
                    
                    return (
                      <>
                        {/* Pending Requests to Pay */}
                        {pendingIncoming.length > 0 && (
                          <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                            <p className="text-sm text-gray-400 font-medium">Requests to Pay</p>
                            {pendingIncoming.map((pr) => {
                              const canPay = currentWallet === pr.payer_wallet_address;
                              const isPaying = payingRequestId === pr.id;
                              
                              return (
                                <div key={pr.id} className="text-white text-sm border-b border-gray-700 pb-3 last:border-0">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium">{(Number(pr.amount) / 1e6).toFixed(2)} USDC</span>
                                    <span className="text-xs px-2 py-0.5 rounded bg-yellow-800 text-yellow-300">pending</span>
                                  </div>
                                  <p className="text-gray-500 font-mono text-xs mt-1">
                                    From: {pr.profiles?.wallet_address?.slice(0, 6)}...{pr.profiles?.wallet_address?.slice(-4)}
                                  </p>
                                  {pr.memo && <p className="text-gray-400 text-xs">{pr.memo}</p>}
                                  {canPay && (
                                    <div className="mt-2 flex gap-2">
                                      <button
                                        onClick={() => payPaymentRequest(pr)}
                                        disabled={isPaying || isSending || isConfirming}
                                        className="flex-1 py-1.5 px-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                                      >
                                        {isPaying && isSending ? "Sending..." : 
                                         isPaying && isConfirming ? "Confirming..." : 
                                         "Pay"}
                                      </button>
                                      <button
                                        onClick={() => cancelRequest(pr.id, "reject")}
                                        className="py-1.5 px-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium rounded-lg transition-colors border border-red-600/30"
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
                          <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                            <p className="text-sm text-gray-400 font-medium">Awaiting Payment</p>
                            {pendingSent.map((pr) => (
                              <div key={pr.id} className="text-white text-sm border-b border-gray-700 pb-3 last:border-0">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">{(Number(pr.amount) / 1e6).toFixed(2)} USDC</span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-blue-800 text-blue-300">sent</span>
                                </div>
                                <p className="text-gray-500 font-mono text-xs mt-1">
                                  To: {pr.payer_wallet_address?.slice(0, 6)}...{pr.payer_wallet_address?.slice(-4)}
                                </p>
                                {pr.memo && <p className="text-gray-400 text-xs">{pr.memo}</p>}
                                <button
                                  onClick={() => cancelRequest(pr.id, "cancel")}
                                  className="mt-2 py-1.5 px-3 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                                >
                                  Cancel Request
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {pendingIncoming.length === 0 && pendingSent.length === 0 && (
                          <p className="text-gray-500 text-sm text-center py-4">No pending requests</p>
                        )}

                        {/* History Toggle */}
                        <button
                          onClick={() => setShowHistory(!showHistory)}
                          className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <span>{showHistory ? "Hide History" : "Show History"}</span>
                          <svg 
                            className={`w-4 h-4 transition-transform ${showHistory ? "rotate-180" : ""}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* History Section */}
                        {showHistory && (
                          <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                            <p className="text-sm text-gray-400 font-medium">History</p>
                            {(() => {
                              const completedIncoming = paymentRequests.filter(pr => pr.status !== "pending");
                              const completedSent = sentRequests.filter(pr => pr.status !== "pending");
                              const allHistoryRaw = [
                                ...completedIncoming.map(pr => ({ ...pr, direction: "received" as const })),
                                ...completedSent.map(pr => ({ ...pr, direction: "sent" as const })),
                              ];
                              // Deduplicate by id (in case user sent request to themselves)
                              const seenIds = new Set<string>();
                              const allHistory = allHistoryRaw
                                .filter(pr => {
                                  if (seenIds.has(pr.id)) return false;
                                  seenIds.add(pr.id);
                                  return true;
                                })
                                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

                              if (allHistory.length === 0) {
                                return <p className="text-gray-500 text-sm text-center">No history yet</p>;
                              }

                              return allHistory.map((pr) => (
                                <div key={pr.id} className="text-white text-sm border-b border-gray-700 pb-3 last:border-0">
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs ${pr.direction === "sent" ? "text-blue-400" : "text-purple-400"}`}>
                                        {pr.direction === "sent" ? "↑ Sent" : "↓ Received"}
                                      </span>
                                      <span className="font-medium">{(Number(pr.amount) / 1e6).toFixed(2)} USDC</span>
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      pr.status === "paid" ? "bg-green-800 text-green-300" :
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
                  })()}
                </>
              )}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700 z-50">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (item.id === "requests") loadPaymentRequests();
                if (item.id === "contacts") loadContacts();
              }}
              className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
                activeTab === item.id
                  ? "text-blue-500"
                  : "text-gray-400"
              }`}
            >
              {item.icon}
              <span className="text-xs mt-1">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}