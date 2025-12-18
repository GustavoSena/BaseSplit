"use client";

import { ReactNode } from "react";
import { CDPHooksProvider } from "@coinbase/cdp-hooks";
import { CDPReactProvider, type Config } from "@coinbase/cdp-react";
import { createCDPEmbeddedWalletConnector } from "@coinbase/cdp-wagmi";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors";

const queryClient = new QueryClient();
const cdpConfig: Config = {
  projectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID || "",
  ethereum: {
    createOnLogin: "smart" as const,
  },
  appName: "BaseSplit",
  authMethods: ["email","oauth:google","oauth:apple","oauth:x"],
  showCoinbaseFooter:false
};

const cdpConnector = createCDPEmbeddedWalletConnector({
  cdpConfig,
  providerConfig: {
    chains: [base],
    transports: {
      [base.id]: http(),
    },
  },
});

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    cdpConnector,
    coinbaseWallet({
      appName: "BaseSplit",
      preference: "smartWalletOnly",
    }),
  ],
  transports: {
    [base.id]: http(),
  },
});

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <CDPReactProvider config={cdpConfig}>
      <CDPHooksProvider config={cdpConfig}>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <OnchainKitProvider
              chain={base}
              apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
            >
              {children}
            </OnchainKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </CDPHooksProvider>
    </CDPReactProvider>
  );
}
