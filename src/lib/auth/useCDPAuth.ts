"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsSignedIn, useSignOut, useEvmAccounts } from "@coinbase/cdp-hooks";
import { supabase } from "@/lib/supabase/client";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

type AuthStatus = "signed_out" | "signing_in" | "signed_in";

export function useCDPAuth() {
  const { isSignedIn: isCDPSignedIn } = useIsSignedIn();
  const { signOut: cdpSignOut } = useSignOut();
  const { evmAccounts } = useEvmAccounts();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("signed_out");
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        setStatus("signed_in");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const upsertProfile = useCallback(
    async (userId: string, walletAddr: string) => {
      const { error } = await supabase.from("profiles").upsert(
        {
          id: userId,
          wallet_address: walletAddr.toLowerCase(),
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

  useEffect(() => {
    const syncWithSupabase = async () => {
      if (isCDPSignedIn && evmAccounts && evmAccounts.length > 0) {
        const evmAccount = evmAccounts[0];
        if (evmAccount?.address) {
          setWalletAddress(evmAccount.address);
          setStatus("signing_in");
          setError(null);

          try {
            const { data, error: authError } = await supabase.auth.signInAnonymously({
              options: {
                data: {
                  wallet_address: evmAccount.address.toLowerCase(),
                  auth_provider: "cdp_embedded",
                },
              },
            });

            if (authError) throw authError;

            if (data.user) {
              await upsertProfile(data.user.id, evmAccount.address);
              setStatus("signed_in");
            }
          } catch (err) {
            console.error("Supabase sync error:", err);
            setError(err instanceof Error ? err.message : "Failed to sync with Supabase");
            setStatus("signed_out");
          }
        }
      }
    };

    syncWithSupabase();
  }, [isCDPSignedIn, evmAccounts, upsertProfile]);

  const signOut = useCallback(async () => {
    try {
      await cdpSignOut();
      await supabase.auth.signOut();
      setStatus("signed_out");
      setSession(null);
      setUser(null);
      setWalletAddress(null);
    } catch (err) {
      console.error("Sign out error:", err);
      setError(err instanceof Error ? err.message : "Sign out failed");
    }
  }, [cdpSignOut]);

  return {
    session,
    user,
    status,
    error,
    signOut,
    walletAddress,
    isCDPSignedIn,
    isAuthenticated: status === "signed_in" && isCDPSignedIn,
  };
}
