"use client";

import { useAccount } from "wagmi";
import { useCapabilities, useWriteContracts, useCallsStatus } from "wagmi/experimental";
import { useMemo } from "react";
import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { ClipboardIcon } from "@/components/Icons";
import { useSupabaseWeb3Auth } from "@/lib/auth/useSupabaseWeb3Auth";
import { useCDPAuth } from "@/lib/auth/useCDPAuth";
import { useState, useEffect, useCallback, useRef } from "react";
import { USDC_BASE_MAINNET } from "@/lib/constants";
import { LoginScreen } from "@/components/LoginScreen";
import { DesktopHeader, MobileNav, TabId } from "@/components/NavBar";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ContactsTab, useContacts } from "@/components/ContactsTab";
import { SettingsTab } from "@/components/SettingsTab";
import { RequestsTab } from "@/components/RequestsTab";
import { SendMoneyModal } from "@/components/SendMoneyModal";
import { RequestMoneyModal } from "@/components/RequestMoneyModal";
import { useUSDCBalance } from "@/hooks/useUSDCBalance";
import {
  Contact,
  PaymentRequest,
  updatePaymentRequestStatus as updatePaymentRequestStatusQuery,
  createDirectTransfer,
  getProfileIdByWallet,
  createContact,
  createPaymentRequest as createPaymentRequestQuery,
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
  
  // For CDP users, always use smart account. For external wallet users, use their address.
  // Prioritize smart account over wagmi address to prevent showing EOA first
  const currentWalletAddress = isCDPSignedIn 
    ? cdpAuth.smartAccountAddress 
    : (address || cdpAuth.walletAddress);
  
  // USDC Balances using custom hook
  const { formattedBalance, refetch: refetchBalance } = useUSDCBalance(currentWalletAddress);
  const { formattedBalance: formattedSmartBalance } = useUSDCBalance(cdpAuth.smartAccountAddress);
  const { formattedBalance: formattedEoaBalance } = useUSDCBalance(cdpAuth.eoaAddress);
  
  // Require both authentication AND a valid wallet address
  const isAuthenticated = (walletAuth.isAuthenticated || cdpAuth.isAuthenticated) && !!currentWalletAddress;
  const authError = walletAuth.error || cdpAuth.error;
  
  const { contacts, loadContacts } = useContacts(currentWalletAddress);
  
  const [payingRequestId, setPayingRequestId] = useState<string | null>(null);
  const payingRequestIdRef = useRef<string | null>(null);
  
  // Send money modal state
  const [sendMoneyContact, setSendMoneyContact] = useState<Contact | null>(null);
  
  // Request money modal state
  const [requestModalContact, setRequestModalContact] = useState<Contact | null>(null);
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);
  
  // Legacy - for prefilling RequestsTab (keeping for backwards compatibility)
  const [requestMoneyContact, setRequestMoneyContact] = useState<Contact | null>(null);
  
  // Copy address confirmation
  const [showCopied, setShowCopied] = useState(false);
  
  // Pending transfer state for recording to history
  const [pendingTransfer, setPendingTransfer] = useState<{
    toAddress: string;
    amount: number;
    memo?: string;
    saveAsContact?: boolean;
    contactLabel?: string;
  } | null>(null);
  const pendingTransferRef = useRef<typeof pendingTransfer>(null);
  const isRecordingTransferRef = useRef(false); // Guard against duplicate recording in strict mode
  
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
  const callsIdString = typeof callsId === "string" ? callsId : (callsId as { id?: string } | undefined)?.id;
  const { data: callsStatus } = useCallsStatus({
    id: callsIdString || "",
    query: { 
      enabled: !!callsIdString,
      // Poll every 2 seconds only while transaction is pending (stop after success/failure)
      refetchInterval: (query) => {
        if (!callsIdString) return false;
        const status = query.state.data?.status;
        if (status === "success" || status === "failure") return false;
        return 2000;
      },
    },
  });
  
  const isConfirming = callsStatus?.status === "pending";
  const isConfirmed = callsStatus?.status === "success";
  const txHash = callsStatus?.receipts?.[0]?.transactionHash;

  const updatePaymentRequestStatus = useCallback(async (requestId: string, hash: string) => {
    const result = await updatePaymentRequestStatusQuery({
      requestId,
      status: "paid",
      txHash: hash,
    });
    
    if (result.error) {
      console.error("[Payment] Failed to update payment status:", result.error);
    }
    
    setPayingRequestId(null);
    payingRequestIdRef.current = null;
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Refetch balance when wallet address changes
  useEffect(() => {
    if (currentWalletAddress) {
      refetchBalance();
    }
  }, [currentWalletAddress, refetchBalance]);

  // Load contacts eagerly when wallet address is available
  useEffect(() => {
    if (currentWalletAddress) {
      loadContacts();
    }
  }, [currentWalletAddress, loadContacts]);

  // Update payment request status when transaction is confirmed
  useEffect(() => {
    const requestId = payingRequestIdRef.current || payingRequestId;
    
    if (isConfirmed && txHash && requestId) {
      updatePaymentRequestStatus(requestId, txHash);
    }
  }, [isConfirmed, txHash, payingRequestId, updatePaymentRequestStatus]);

  // Handle tab change with refresh logic - must be before early returns
  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    const now = Date.now();
    const lastRefresh = lastTabRefresh[tabId] || 0;
    if (now - lastRefresh > TAB_REFRESH_GRACE_PERIOD) {
      if (tabId === "contacts") loadContacts();
      setLastTabRefresh(prev => ({ ...prev, [tabId]: now }));
    }
  }, [lastTabRefresh, loadContacts]);

  const payPaymentRequest = useCallback((request: PaymentRequest) => {
    if (!address) return;
    
    // Get requester's wallet address (the person to pay)
    const requesterWallet = request.profiles?.wallet_address;
    if (!requesterWallet) {
      console.error("No requester wallet found");
      return;
    }
    
    setPayingRequestId(request.id);
    payingRequestIdRef.current = request.id;
    
    console.log("[Payment] Initiating payment for request:", request.id);
    
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

  // Send money directly to a contact (from ContactsTab modal)
  const sendDirectMoney = useCallback((toAddress: string, amount: number) => {
    if (!address) return;
    
    const amountInMicroUnits = Math.floor(amount * 1e6);
    
    // Track pending transfer for history recording
    setPendingTransfer({ toAddress, amount: amountInMicroUnits });
    pendingTransferRef.current = { toAddress, amount: amountInMicroUnits };
    
    writeContracts({
      contracts: [
        {
          address: USDC_BASE_MAINNET as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [toAddress as `0x${string}`, BigInt(amountInMicroUnits)],
        },
      ],
      capabilities,
    });
  }, [address, writeContracts, capabilities]);

  // Send money from RequestsTab form (with optional save as contact)
  const sendMoneyFromRequests = useCallback((toAddress: string, amount: number, memo?: string, saveAsContact?: boolean, contactLabel?: string) => {
    if (!address) return;
    
    const amountInMicroUnits = Math.floor(amount * 1e6);
    
    // Track pending transfer for history recording
    setPendingTransfer({ toAddress, amount: amountInMicroUnits, memo, saveAsContact, contactLabel });
    pendingTransferRef.current = { toAddress, amount: amountInMicroUnits, memo, saveAsContact, contactLabel };
    
    writeContracts({
      contracts: [
        {
          address: USDC_BASE_MAINNET as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [toAddress as `0x${string}`, BigInt(amountInMicroUnits)],
        },
      ],
      capabilities,
    });
  }, [address, writeContracts, capabilities]);

// Record transfer to history and handle save as contact when transaction is confirmed
useEffect(() => {
  const recordTransfer = async () => {
    const transfer = pendingTransferRef.current || pendingTransfer;
    if (!isConfirmed || !txHash || !transfer || !currentWalletAddress) return;
    
    // Guard against duplicate recording in React Strict Mode
    if (isRecordingTransferRef.current) return;
    isRecordingTransferRef.current = true;
    
    try {
      const profileResult = await getProfileIdByWallet(currentWalletAddress);
      if (profileResult.data) {
        // Record transfer to history
        await createDirectTransfer({
          senderId: profileResult.data.id,
          recipientWalletAddress: transfer.toAddress,
          amount: transfer.amount,
          memo: transfer.memo,
          txHash,
        });
        
        // Save as contact if requested
        if (transfer.saveAsContact && transfer.contactLabel) {
          await createContact({
            ownerId: profileResult.data.id,
            contactWalletAddress: transfer.toAddress,
            label: transfer.contactLabel,
          });
          loadContacts();
        }
      }
    } catch (err) {
      console.error("Failed to record transfer:", err);
    }
    
    setPendingTransfer(null);
    pendingTransferRef.current = null;
    isRecordingTransferRef.current = false;
    refetchBalance();
  };
  
  recordTransfer();
}, [isConfirmed, txHash, pendingTransfer, currentWalletAddress, loadContacts, refetchBalance]);

// Close send money modal when transaction is confirmed
useEffect(() => {
  if (isConfirmed && sendMoneyContact) {
    setSendMoneyContact(null);
  }
}, [isConfirmed, sendMoneyContact]);

// Handle request money - show modal popup (like send money)
const handleRequestMoney = useCallback((contact: Contact) => {
  setRequestModalContact(contact);
}, []);

// Create payment request from modal
const createRequestFromModal = useCallback(async (address: string, amount: number, memo?: string): Promise<{ success: boolean; error?: string }> => {
  if (!currentWalletAddress) {
    return { success: false, error: "Wallet not connected" };
  }
  
  setIsCreatingRequest(true);
  try {
    const profileResult = await getProfileIdByWallet(currentWalletAddress);
    if (!profileResult.data) {
      return { success: false, error: "Profile not found. Please sign in again." };
    }
    
    const amountInMicroUnits = Math.floor(amount * 1e6);
    const result = await createPaymentRequestQuery({
      requesterId: profileResult.data.id,
      payerWalletAddress: address,
      amount: amountInMicroUnits,
      memo: memo || null,
    });
    
    if (result.error) {
      return { success: false, error: result.error };
    }
    
    setRequestModalContact(null);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to create request";
    return { success: false, error: errorMessage };
  } finally {
    setIsCreatingRequest(false);
  }
}, [currentWalletAddress]);

// Memoized callback for clearing prefilled contact (prevents effect re-runs)
const clearPrefilledContact = useCallback(() => {
  setRequestMoneyContact(null);
}, []);

if (!mounted) {
  return <LoadingScreen />;
}

// Not authenticated - show login screen
if (!isAuthenticated) {
  return <LoginScreen isConnected={isConnected} walletAuth={walletAuth} authError={authError} />;
}

// Authenticated - show app
return (
  <main className="main-container">
    <DesktopHeader activeTab={activeTab} onTabChange={handleTabChange} />

    <div className="content-area">
      <div className="content-wrapper">
        <div className="balance-card">
          <div className="flex items-center justify-center gap-2 mb-2 relative">
            <p className="wallet-address">
              {currentWalletAddress?.slice(0, 6)}...{currentWalletAddress?.slice(-4)}
            </p>
            <button
              onClick={() => {
                if (currentWalletAddress) {
                  navigator.clipboard.writeText(currentWalletAddress);
                  setShowCopied(true);
                  setTimeout(() => setShowCopied(false), 2000);
                }
              }}
              className="p-1 rounded transition-colors copy-btn"
              title="Copy address"
            >
              <ClipboardIcon />
            </button>
            {showCopied && (
              <span className="copy-toast">Copied!</span>
            )}
          </div>
          <p className="text-4xl font-bold text-foreground">${formattedBalance}</p>
          <p className="text-muted-foreground text-sm">USDC Balance</p>
        </div>

        {activeTab === "contacts" && (
          <ContactsTab 
            currentWalletAddress={currentWalletAddress}
            onSendMoney={(contact) => setSendMoneyContact(contact)}
            onRequestMoney={handleRequestMoney}
          />
        )}

        {activeTab === "settings" && (
          <SettingsTab
            isCDPSignedIn={isCDPSignedIn}
            cdpAuth={cdpAuth}
            walletAuth={walletAuth}
            formattedSmartBalance={formattedSmartBalance}
            formattedEoaBalance={formattedEoaBalance}
          />
        )}

        {activeTab === "requests" && (
          <RequestsTab
            currentWalletAddress={currentWalletAddress}
            contacts={contacts}
            loadContacts={loadContacts}
            payPaymentRequest={payPaymentRequest}
            payingRequestId={payingRequestId}
            isSending={isSending}
            isConfirming={isConfirming}
            prefilledContact={requestMoneyContact}
            onPrefilledContactUsed={clearPrefilledContact}
            onSendMoney={(toAddress: string, amount: number, memo?: string) => sendMoneyFromRequests(toAddress, amount, memo)}
          />
        )}
      </div>
    </div>

    <MobileNav activeTab={activeTab} onTabChange={handleTabChange} />

    {sendMoneyContact && (
      <SendMoneyModal
        contact={sendMoneyContact}
        onClose={() => setSendMoneyContact(null)}
        onSend={sendDirectMoney}
        isSending={isSending}
        isConfirming={isConfirming}
      />
    )}

    {requestModalContact && (
      <RequestMoneyModal
        contact={requestModalContact}
        onClose={() => setRequestModalContact(null)}
        onRequest={createRequestFromModal}
        isSubmitting={isCreatingRequest}
      />
    )}
  </main>
);
}