"use client";

import { useState } from "react";
import { Contact } from "@/lib/supabase/queries";

interface RequestMoneyModalProps {
  contact: Contact;
  onClose: () => void;
  onRequest: (address: string, amount: number, memo?: string) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * Modal UI for requesting USDC from a contact.
 *
 * Validates the entered amount (must be at least $0.01 and at most $10,000) and invokes `onRequest` with
 * the contact's wallet address, the parsed numeric amount, and optional memo when submission is valid.
 */
export function RequestMoneyModal({
  contact,
  onClose,
  onRequest,
  isSubmitting,
}: RequestMoneyModalProps) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmedAmount = amount.trim();
    if (!trimmedAmount) {
      setError("Please enter an amount");
      return;
    }
    const amountNum = parseFloat(trimmedAmount);
    if (isNaN(amountNum) || amountNum < 0.01) {
      setError("Minimum amount is $0.01 USDC");
      return;
    }
    if (amountNum > 10000) {
      setError("Maximum amount is $10,000 USDC");
      return;
    }
    setError(null);
    await onRequest(contact.contact_wallet_address, amountNum, memo || undefined);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Request Money</h2>
        
        <div className="mb-4">
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Requesting from</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{contact.label}</p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {contact.contact_wallet_address.slice(0, 10)}...{contact.contact_wallet_address.slice(-8)}
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Amount (USDC)</label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
            min="0.01"
            step="0.01"
            disabled={isSubmitting}
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Memo (optional)</label>
          <input
            type="text"
            placeholder="What's this for?"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="input"
            disabled={isSubmitting}
          />
        </div>

        {error && <p className="text-sm mb-4" style={{ color: 'var(--danger-400)' }}>{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !amount}
            className="flex-1 btn-success"
          >
            {isSubmitting ? "Creating..." : "Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
