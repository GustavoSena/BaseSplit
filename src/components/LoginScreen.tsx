"use client";

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

interface LoginScreenProps {
  isConnected: boolean;
  walletAuth: {
    isAuthenticated: boolean;
    status: string;
    signIn: () => void;
  };
  authError: string | null;
}

export function LoginScreen({ isConnected, walletAuth, authError }: LoginScreenProps) {
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
              className="w-full btn-primary py-3"
            >
              {walletAuth.status === "signing_in" ? "Signing in..." : "Continue"}
            </button>
          )}

          {authError && (
            <p className="text-error-center">{authError}</p>
          )}
        </div>
      </div>
    </main>
  );
}
