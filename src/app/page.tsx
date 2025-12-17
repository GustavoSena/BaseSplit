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
  
  // USDC Balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_BASE_MAINNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: currentWalletAddress ? [currentWalletAddress as `0x${string}`] : undefined,
    query: { enabled: !!currentWalletAddress },
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
  
  // Transaction state
  const [payingRequestId, setPayingRequestId] = useState<string | null>(null);
  
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
    if (!user) return;

    setContactsError(null);
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setContactsError(error.message);
      setContacts([]);
    } else {
      setContacts(data || []);
    }
  };

  const loadPaymentRequests = async () => {
    if (!user) return;

    setPaymentRequestsError(null);
    const { data, error } = await supabase
      .from("payment_requests")
      .select("*, profiles!requester_id(wallet_address)")
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
              <div className="text-center">
                <p className="text-sm text-gray-400">Wallet:</p>
                <p className="text-white font-mono text-sm break-all">
                  {address || cdpAuth.walletAddress}
                </p>
              </div>
              <div className="text-center border-t border-gray-700 pt-3">
                <p className="text-sm text-gray-400">USDC Balance:</p>
                <p className="text-2xl font-bold text-white">
                  ${formattedBalance}
                </p>
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
              <div className="text-center">
                <p className="text-sm text-gray-400">User ID:</p>
                <p className="text-white font-mono text-xs break-all">
                  {user.id}
                </p>
              </div>

              <button
                onClick={loadProfile}
                className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Load my profile
              </button>

              {profileError && (
                <p className="text-red-400 text-sm text-center">
                  {profileError}
                </p>
              )}

              {profile && (
                <div className="bg-gray-900 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-gray-400">Profile loaded:</p>
                  <p className="text-white text-sm">
                    <span className="text-gray-500">Wallet:</span>{" "}
                    <span className="font-mono">{profile.wallet_address}</span>
                  </p>
                  <p className="text-white text-sm">
                    <span className="text-gray-500">Created:</span>{" "}
                    {new Date(profile.created_at).toLocaleString()}
                  </p>
                  <p className="text-white text-sm">
                    <span className="text-gray-500">Last seen:</span>{" "}
                    {new Date(profile.last_seen_at).toLocaleString()}
                  </p>
                </div>
              )}

              <button
                onClick={loadContacts}
                className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
              >
                Load my contacts
              </button>

              {contactsError && (
                <p className="text-red-400 text-sm text-center">{contactsError}</p>
              )}

              {contacts.length > 0 ? (
                <div className="bg-gray-900 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-gray-400">Contacts ({contacts.length}):</p>
                  {contacts.map((c) => (
                    <div key={c.id} className="text-white text-sm border-b border-gray-700 pb-2">
                      <span className="font-medium">{c.label}</span>
                      <span className="text-gray-500 font-mono text-xs ml-2">{c.contact_wallet_address}</span>
                    </div>
                  ))}
                </div>
              ) : contacts.length === 0 && !contactsError && (
                <p className="text-gray-500 text-sm text-center">No contacts yet</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={loadPaymentRequests}
                  className="flex-1 py-2 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Load Requests
                </button>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                >
                  {showCreateForm ? "Cancel" : "Create Request"}
                </button>
              </div>

              {/* Create Payment Request Form */}
              {showCreateForm && (
                <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-gray-400 font-medium">New Payment Request</p>
                  <input
                    type="text"
                    placeholder="Payer wallet address (0x...)"
                    value={newPayerAddress}
                    onChange={(e) => setNewPayerAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
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
                  <p className="text-sm text-gray-400">Payment Requests ({paymentRequests.length}):</p>
                  {paymentRequests.map((pr) => {
                    const currentWallet = (address || cdpAuth.walletAddress)?.toLowerCase();
                    const canPay = pr.status === "pending" && currentWallet === pr.payer_wallet_address;
                    const isPaying = payingRequestId === pr.id;
                    
                    return (
                      <div key={pr.id} className="text-white text-sm border-b border-gray-700 pb-3">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{(Number(pr.amount) / 1e6).toFixed(2)} USDC</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            pr.status === "paid" ? "bg-green-800 text-green-300" :
                            pr.status === "pending" ? "bg-yellow-800 text-yellow-300" :
                            "bg-gray-700 text-gray-300"
                          }`}>{pr.status}</span>
                        </div>
                        <p className="text-gray-500 font-mono text-xs mt-1">To: {pr.payer_wallet_address}</p>
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
              ) : paymentRequests.length === 0 && !paymentRequestsError && (
                <p className="text-gray-500 text-sm text-center">No payment requests yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
