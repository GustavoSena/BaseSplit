"use client";

import { useState } from "react";
import { Contact } from "@/lib/supabase/queries";
import { validateUSDCAmount } from "@/lib/validation";

interface SendMoneyModalProps {
  contact: Contact;
  onClose: () => void;
  onSend: (address: string, amount: number) => void;
  isSending: boolean;
  isConfirming: boolean;
}

/**
 * Modal UI for sending USDC to a contact.
 *
 * Validates the entered amount (must be at least $0.01 and at most $10,000) and invokes `onSend` with
 * the contact's wallet address and the parsed numeric amount when submission is valid.
 */
export function SendMoneyModal({
  contact,
  onClose,
  onSend,
  isSending,
  isConfirming,
}: SendMoneyModalProps) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const validation = validateUSDCAmount(amount);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    setError(null);
    onSend(contact.contact_wallet_address, validation.amount);
  };

  const isProcessing = isSending || isConfirming;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 className="modal-title">Send Money</h2>
        
        <div className="mb-4">
          <p className="modal-label">Sending to</p>
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
            disabled={isProcessing}
          />
        </div>

        {error && <p className="text-sm mb-4 text-theme-danger">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing || !amount}
            className="flex-1 btn-primary"
          >
            {isSending ? "Sending..." : isConfirming ? "Confirming..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}