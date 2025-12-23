"use client";

import { useState } from "react";
import { Contact } from "@/lib/supabase/queries";

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
 *
 * @param contact - Recipient contact whose label and wallet address are displayed
 * @param onClose - Callback invoked to close the modal
 * @param onSend - Callback invoked as `onSend(address, amount)` when a valid send is submitted
 * @param isSending - When true, the UI shows the sending state and disables inputs/actions
 * @param isConfirming - When true, the UI shows the confirming state and disables inputs/actions
 * @returns The modal's JSX element
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
    onSend(contact.contact_wallet_address, amountNum);
  };

  const isProcessing = isSending || isConfirming;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">Send Money</h2>
        
        <div className="mb-4">
          <p className="text-gray-400 text-sm mb-1">Sending to</p>
          <p className="font-medium text-white">{contact.label}</p>
          <p className="text-gray-500 text-xs font-mono">
            {contact.contact_wallet_address.slice(0, 10)}...{contact.contact_wallet_address.slice(-8)}
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-1">Amount (USDC)</label>
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

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

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