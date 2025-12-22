"use client";

import { useState, useCallback } from "react";
import { Contact } from "@/lib/supabase/queries";

interface MoneyTransferFormProps {
  mode: "request" | "send";
  contacts: Contact[];
  isContact: (address: string) => boolean;
  onSubmit: (params: {
    address: string;
    amount: number;
    memo?: string;
    saveAsContact?: boolean;
    contactLabel?: string;
  }) => void;
  isSubmitting: boolean;
  isConfirming?: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

export function MoneyTransferForm({
  mode,
  contacts,
  isContact,
  onSubmit,
  isSubmitting,
  isConfirming = false,
  error,
  setError,
}: MoneyTransferFormProps) {
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [saveNewContact, setSaveNewContact] = useState(false);
  const [newContactLabel, setNewContactLabel] = useState("");

  const handleAddressChange = useCallback((value: string) => {
    setContactSearch(value);
    if (value === "") {
      setAddress("");
      setShowContactDropdown(contacts.length > 0);
    } else if (value.startsWith("0x")) {
      setAddress(value);
      setShowContactDropdown(false);
    } else {
      setShowContactDropdown(contacts.length > 0);
    }
  }, [contacts.length]);

  const handleContactSelect = useCallback((contact: Contact) => {
    setAddress(contact.contact_wallet_address);
    setContactSearch(contact.label);
    setShowContactDropdown(false);
  }, []);

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
    onSubmit({
      address,
      amount: amountNum,
      memo: memo || undefined,
      saveAsContact: saveNewContact && !isContact(address) ? true : undefined,
      contactLabel: saveNewContact ? newContactLabel.trim() : undefined,
    });
  };

  const filteredContacts = contacts.filter(c =>
    contactSearch === "" ||
    c.label.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.contact_wallet_address.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const title = mode === "request" ? "New Payment Request" : "Send Money";
  const submitLabel = mode === "request" 
    ? (isSubmitting ? "Creating..." : "Create Request")
    : (isSubmitting ? "Sending..." : isConfirming ? "Confirming..." : "Send Money");
  const buttonClass = mode === "request" ? "btn-primary" : "btn-success";
  const isDisabled = isSubmitting || isConfirming || !address || !amount || (saveNewContact && !newContactLabel.trim());

  return (
    <div className="card">
      <p className="card-title">{title}</p>
      
      <div className="relative">
        <input
          type="text"
          placeholder="Search contacts or enter wallet address..."
          value={contactSearch}
          onChange={(e) => handleAddressChange(e.target.value)}
          onFocus={() => {
            if (contacts.length > 0 && !contactSearch.startsWith("0x")) {
              setShowContactDropdown(true);
            }
          }}
          className="input"
        />
        
        {showContactDropdown && contacts.length > 0 && (
          <div className="dropdown">
            {filteredContacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleContactSelect(c)}
                className="dropdown-item flex justify-between items-center"
              >
                <span className="font-medium">{c.label}</span>
                <span className="text-gray-500 text-xs font-mono truncate ml-2">
                  {c.contact_wallet_address.slice(0, 6)}...{c.contact_wallet_address.slice(-4)}
                </span>
              </button>
            ))}
            {filteredContacts.length === 0 && (
              <p className="px-3 py-2 text-gray-500 text-sm">No matching contacts</p>
            )}
          </div>
        )}
      </div>
      
      {address && (
        <p className="text-xs text-gray-500 font-mono truncate">
          To: {address}
        </p>
      )}
      
      <input
        type="number"
        placeholder="Amount (USDC)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        step="0.01"
        min="0"
        className="input"
      />
      <input
        type="text"
        placeholder="Memo (optional)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        className="input"
      />
      
      {/* Save as contact option - show only if address is not already a contact */}
      {address && !isContact(address) && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={saveNewContact}
              onChange={(e) => setSaveNewContact(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500"
            />
            Save as contact
          </label>
          {saveNewContact && (
            <input
              type="text"
              placeholder="Contact name (e.g., Alice)"
              value={newContactLabel}
              onChange={(e) => setNewContactLabel(e.target.value)}
              className="input text-sm"
            />
          )}
        </div>
      )}
      
      {error && (
        <p className="text-error">{error}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={isDisabled}
        className={`w-full ${buttonClass}`}
      >
        {submitLabel}
      </button>
    </div>
  );
}
