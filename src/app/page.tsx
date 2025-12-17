"use client";

import { useAccount } from "wagmi";
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
import { useSupabaseWeb3Auth } from "@/lib/auth/useSupabaseWeb3Auth";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface Profile {
  id: string;
  wallet_address: string;
  created_at: string;
  last_seen_at: string;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { status, user, signIn, signOut, isAuthenticated, error } =
    useSupabaseWeb3Auth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">BaseSplit</h1>
          <p className="text-gray-400">Split expenses on Base</p>
        </div>

        <div className="space-y-6">
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

          {isConnected && address && (
            <div className="text-center">
              <p className="text-sm text-gray-400">Connected:</p>
              <p className="text-white font-mono text-sm break-all">{address}</p>
            </div>
          )}

          <div className="border-t border-gray-700 pt-6">
            <div className="text-center mb-4">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  isAuthenticated
                    ? "bg-green-900 text-green-300"
                    : status === "signing_in"
                    ? "bg-yellow-900 text-yellow-300"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                Supabase:{" "}
                {isAuthenticated
                  ? "authenticated"
                  : status === "signing_in"
                  ? "signing in..."
                  : "signed out"}
              </span>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center mb-4">{error}</p>
            )}

            {!isAuthenticated && (
              <button
                onClick={signIn}
                disabled={!isConnected || status === "signing_in"}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {status === "signing_in"
                  ? "Signing in..."
                  : "Sign in to Supabase"}
              </button>
            )}

            {isAuthenticated && (
              <button
                onClick={signOut}
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
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
