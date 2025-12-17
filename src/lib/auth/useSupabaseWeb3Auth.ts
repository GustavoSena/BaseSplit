"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import { supabase } from "@/lib/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type AuthStatus = "signed_out" | "signing_in" | "signed_in";

export function useSupabaseWeb3Auth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("signed_out");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setStatus(session ? "signed_in" : "signed_out");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setStatus(session ? "signed_in" : "signed_out");
    });

    return () => subscription.unsubscribe();
  }, []);

  const upsertProfile = useCallback(
    async (userId: string, walletAddress: string) => {
      const { error } = await supabase.from("profiles").upsert(
        {
          id: userId,
          wallet_address: walletAddress.toLowerCase(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error("Error upserting profile:", error);
        throw error;
      }
    },
    []
  );

  const generateNonce = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 16; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  };

  const signIn = useCallback(async () => {
    if (!address || !isConnected) {
      setError("Wallet not connected");
      return;
    }

    setStatus("signing_in");
    setError(null);

    try {
      const nonce = generateNonce();

      const message = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: "Sign in to BaseSplit with your wallet.",
        uri: window.location.origin,
        version: "1",
        chainId: 8453,
        nonce: nonce,
      });

      const messageToSign = message.prepareMessage();
      const signature = await signMessageAsync({ message: messageToSign });

      const { data, error: authError } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            wallet_address: address.toLowerCase(),
            siwe_message: messageToSign,
            siwe_signature: signature,
          },
        },
      });

      if (authError) throw authError;

      if (data.user) {
        await upsertProfile(data.user.id, address);
        setStatus("signed_in");
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError(err instanceof Error ? err.message : "Sign in failed");
      setStatus("signed_out");
    }
  }, [address, isConnected, signMessageAsync, upsertProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out error:", error);
      setError(error.message);
    } else {
      setStatus("signed_out");
      setSession(null);
      setUser(null);
    }
  }, []);

  return {
    session,
    user,
    status,
    error,
    signIn,
    signOut,
    isAuthenticated: status === "signed_in",
  };
}
