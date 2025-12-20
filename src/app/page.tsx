"use client";

import { useAccount } from "wagmi";
import { useCapabilities, useWriteContracts, useCallsStatus } from "wagmi/experimental";
import { useMemo } from "react";
import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { ClipboardIcon } from "@/components/Icons";
import { useSupabaseWeb3Auth } from "@/lib/auth/useSupabaseWeb3Auth";
import { useCDPAuth } from "@/lib/auth/useCDPAuth";
import { useState, useEffect, useCallback } from "react";
import { USDC_BASE_MAINNET } from "@/lib/constants";
import { LoginScreen } from "@/components/LoginScreen";
import { DesktopHeader, MobileNav, TabId } from "@/components/NavBar";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ContactsTab, useContacts } from "@/components/ContactsTab";
import { SettingsTab } from "@/components/SettingsTab";
import { RequestsTab } from "@/components/RequestsTab";
import { useUSDCBalance } from "@/hooks/useUSDCBalance";
import {
  PaymentRequest,
  updatePaymentRequestStatus as updatePaymentRequestStatusQuery,
} from "@/lib/supabase/queries";

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
  
  // USDC Balances using custom hook
  const { formattedBalance, refetch: refetchBalance } = useUSDCBalance(currentWalletAddress);
  const { formattedBalance: formattedSmartBalance } = useUSDCBalance(cdpAuth.smartAccountAddress);
  const { formattedBalance: formattedEoaBalance } = useUSDCBalance(cdpAuth.eoaAddress);
  
  const isAuthenticated = walletAuth.isAuthenticated || cdpAuth.isAuthenticated;
  const authError = walletAuth.error || cdpAuth.error;
  
  const { contacts, loadContacts } = useContacts(currentWalletAddress);
  
  const [payingRequestId, setPayingRequestId] = useState<string | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<"requests" | "contacts" | "settings">("requests");
  
  // Tab refresh grace period (7 seconds per tab to prevent redundant reloads)
  const [lastTabRefresh, setLastTabRefresh] = useState<Record<string, number>>({});
  const TAB_REFRESH_GRACE_PERIOD = 7000; // 7 seconds
  
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

  const updatePaymentRequestStatus = async (requestId: string, hash: string) => {
    const result = await updatePaymentRequestStatusQuery({
      requestId,
      status: "paid",
      txHash: hash,
    });
    
    if (result.error) {
      console.error("Failed to update payment status:", result.error);
    }
    
    setPayingRequestId(null);
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
    return <LoadingScreen />;
  }

  // Handle tab change with refresh logic
  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    const now = Date.now();
    const lastRefresh = lastTabRefresh[tabId] || 0;
    if (now - lastRefresh > TAB_REFRESH_GRACE_PERIOD) {
      if (tabId === "contacts") loadContacts();
      setLastTabRefresh(prev => ({ ...prev, [tabId]: now }));
    }
  }, [lastTabRefresh, loadContacts]);

  // Not authenticated - show login screen
  if (!isAuthenticated) {
    return <LoginScreen isConnected={isConnected} walletAuth={walletAuth} authError={authError} />;
  }

  // Authenticated - show app
  return (
    <main className="main-container">
      <DesktopHeader activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Main Content */}
      <div className="content-area">
        <div className="content-wrapper">
          {/* Balance Card */}
          <div className="balance-card">
            <div className="flex items-center justify-center gap-2 mb-2">
              <p className="wallet-address">
                {currentWalletAddress?.slice(0, 6)}...{currentWalletAddress?.slice(-4)}
              </p>
              <button
                onClick={() => {
                  if (currentWalletAddress) navigator.clipboard.writeText(currentWalletAddress);
                }}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
                title="Copy address"
              >
                <ClipboardIcon className="text-gray-500" />
              </button>
            </div>
            <p className="text-4xl font-bold text-white">${formattedBalance}</p>
            <p className="text-gray-500 text-sm">USDC Balance</p>
          </div>

          {/* Tab Content */}
          {/* Contacts Tab */}
          {activeTab === "contacts" && (
            <ContactsTab currentWalletAddress={currentWalletAddress} />
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <SettingsTab
              isCDPSignedIn={isCDPSignedIn}
              cdpAuth={cdpAuth}
              walletAuth={walletAuth}
              formattedSmartBalance={formattedSmartBalance}
              formattedEoaBalance={formattedEoaBalance}
            />
          )}

          {/* Requests Tab */}
          {activeTab === "requests" && (
            <RequestsTab
              currentWalletAddress={currentWalletAddress}
              contacts={contacts}
              loadContacts={loadContacts}
              payPaymentRequest={payPaymentRequest}
              payingRequestId={payingRequestId}
              isSending={isSending}
              isConfirming={isConfirming}
            />
          )}
        </div>
      </div>  

      <MobileNav activeTab={activeTab} onTabChange={handleTabChange} />
    </main>
  );
}