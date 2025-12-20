"use client";

import { useReadContract } from "wagmi";
import { USDC_BASE_MAINNET } from "@/lib/constants";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface UseUSDCBalanceResult {
  balance: bigint | undefined;
  formattedBalance: string;
  refetch: () => void;
}

export function useUSDCBalance(address: string | null | undefined): UseUSDCBalanceResult {
  const { data: balance, refetch } = useReadContract({
    address: USDC_BASE_MAINNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  });

  const formattedBalance = balance
    ? (Number(balance) / 1e6).toFixed(2)
    : "0.00";

  return {
    balance,
    formattedBalance,
    refetch,
  };
}
