"use client";

import { PaymentRequest } from "@/lib/supabase/queries";

export interface HistoryItemProps {
  pr: PaymentRequest & { direction: "sent" | "received" };
  amountUSDC: string;
  balanceChange: string;
  balanceColor: string;
  contactLabel: string | null;
  displayName: string;
  otherAddress: string | undefined;
}

export function HistoryItem({ pr, amountUSDC, balanceChange, balanceColor, contactLabel, displayName, otherAddress }: HistoryItemProps) {
  return (
    <div className="list-item">
      {/* Main row with grid layout */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 items-start">
        {/* Row 1, Column 1: Direction */}
        <div className="min-w-0">
          <span className={`text-xs whitespace-nowrap ${pr.direction === "sent" ? "text-primary-500" : "text-primary-400"}`}>
            {pr.direction === "sent" ? "↑ Sent Request" : "↓ Received Request"}
          </span>
        </div>
        
        {/* Row 1, Column 2: Amount */}
        <div className="text-right whitespace-nowrap">
          <span className="font-medium">{amountUSDC} USDC</span>
        </div>
        
        {/* Row 1, Column 3: Status */}
        <div className="w-20 text-right">
          <span className={
            pr.status === "paid" ? "badge-paid" :
            pr.status === "rejected" ? "badge-rejected" :
            pr.status === "cancelled" ? "badge-cancelled" :
            "badge-pending"
          }>{pr.status}</span>
        </div>
        
        {/* Row 2, Column 1: Address/Contact */}
        <div className="min-w-0 truncate text-sm flex items-center">
          <span className="text-muted-foreground w-12 flex-shrink-0">
            {pr.direction === "sent" ? "To:" : "From:"}
          </span>
          <span className={contactLabel ? "font-medium" : "font-mono text-muted-foreground"}>
            {displayName}
          </span>
          {contactLabel && otherAddress && (
            <span className="text-xs text-muted-foreground ml-1 font-mono">
              ({otherAddress.slice(0, 6)}...{otherAddress.slice(-4)})
            </span>
          )}
        </div>
        
        {/* Row 2, Column 2: Empty */}
        <div></div>
        
        {/* Row 2, Column 3: Balance change (under status) */}
        <div className="w-20 text-right">
          {pr.status === "paid" && (
            <span className={`text-xs font-medium ${balanceColor}`}>
              {balanceChange}
            </span>
          )}
        </div>
      </div>
      
      {/* Memo and transaction link row */}
      {(pr.memo || pr.tx_hash) && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {pr.memo && <span>{pr.memo}</span>}
          {pr.tx_hash && (
            <a 
              href={`https://basescan.org/tx/${pr.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 hover:underline"
            >
              View transaction
            </a>
          )}
        </div>
      )}
    </div>
  );
}
