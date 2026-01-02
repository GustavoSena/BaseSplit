"use client";

import { useState } from "react";
import { Contact } from "@/lib/supabase/queries";
import { validateUSDCAmount } from "@/lib/validation";

interface RequestMoneyModalProps {
  contact: Contact;
  onClose: () => void;
  onRequest: (address: string, amount: number, memo?: string) => Promise<{ success: boolean; error?: string }>;
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
    const validation = validateUSDCAmount(amount);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    
    setError(null);
    const result = await onRequest(contact.contact_wallet_address, validation.amount, memo || undefined);
    if (!result.success && result.error) {
      setError(result.error);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 className="modal-title">Request Money</h2>
        
        <div className="mb-4">
          <p className="modal-label">Requesting from</p>
          <p className="modal-text">{contact.label}</p>
          <p className="modal-subtext">
            {contact.contact_wallet_address.slice(0, 10)}...{contact.contact_wallet_address.slice(-8)}
          </p>
        </div>

        <div className="mb-4">
          <label className="modal-label">Amount (USDC)</label>
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
          <label className="modal-label">Memo (optional)</label>
          <input
            type="text"
            placeholder="What's this for?"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="input"
            disabled={isSubmitting}
          />
        </div>

        {error && <p className="text-sm mb-4 text-theme-danger">{error}</p>}

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
