"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsSignedIn, useSignOut, useCurrentUser } from "@coinbase/cdp-hooks";
import { supabase } from "@/lib/supabase/client";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

type AuthStatus = "signed_out" | "signing_in" | "signed_in";

export function useCDPAuth() {
  const { isSignedIn: isCDPSignedIn } = useIsSignedIn();
  const { signOut: cdpSignOut } = useSignOut();
  const { currentUser } = useCurrentUser();

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
      const normalizedWallet = walletAddr.toLowerCase();
      
      // Try to insert first, if duplicate wallet_address, just update last_seen
      const { error: insertError } = await supabase.from("profiles").insert({
        id: userId,
        wallet_address: normalizedWallet,
        last_seen_at: new Date().toISOString(),
      });

      if (insertError) {
        // If duplicate wallet_address, update last_seen_at on existing profile
        if (insertError.code === "23505") {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", userId);
          
          if (updateError && updateError.code !== "PGRST116") {
            console.error("Error updating profile:", updateError);
          }
        } else {
          console.error("Error inserting profile:", insertError);
          throw insertError;
        }
      }
    },
    []
  );

  useEffect(() => {
    const syncWithSupabase = async () => {
      if (isCDPSignedIn && currentUser) {
        // Prefer smart account, fallback to EOA
        const smartAccount = currentUser.evmSmartAccounts?.[0];
        const eoaAccount = currentUser.evmAccounts?.[0];
        const accountAddress = smartAccount || eoaAccount;
        
        if (accountAddress) {
          setWalletAddress(accountAddress);
          setStatus("signing_in");
          setError(null);

          try {
            const { data, error: authError } = await supabase.auth.signInAnonymously({
              options: {
                data: {
                  wallet_address: accountAddress.toLowerCase(),
                  auth_provider: "cdp_embedded",
                },
              },
            });

            if (authError) throw authError;

            if (data.user) {
              await upsertProfile(data.user.id, accountAddress);
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
  }, [isCDPSignedIn, currentUser, upsertProfile]);

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
