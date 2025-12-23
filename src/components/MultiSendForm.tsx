"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Contact } from "@/lib/supabase/queries";
import { TrashIcon } from "./Icons";

// Validate Ethereum address format
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

interface Recipient {
  id: string;
  address: string;
  label: string;
  amount: string;
  isValid: boolean;
}

interface MultiSendFormProps {
  contacts: Contact[];
  onSubmit: (params: {
    recipients: { address: string; amount: number }[];
    memo?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  isConfirming: boolean;
  onCancel: () => void;
}

export function MultiSendForm({
  contacts,
  onSubmit,
  isSubmitting,
  isConfirming,
  onCancel,
}: MultiSendFormProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [memo, setMemo] = useState("");
  const [sameAmount, setSameAmount] = useState(true);
  const [uniformAmount, setUniformAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Contact search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  const addRecipient = useCallback((address: string, label: string) => {
    const normalizedAddress = address.toLowerCase();
    
    if (recipients.some(r => r.address.toLowerCase() === normalizedAddress)) {
      setError("This address is already added");
      return;
    }
    
    setRecipients(prev => [...prev, {
      id: crypto.randomUUID(),
      address: normalizedAddress,
      label,
      amount: "",
      isValid: isValidEthereumAddress(address),
    }]);
    setSearchQuery("");
    setShowDropdown(false);
    setError(null);
  }, [recipients]);

  const removeRecipient = useCallback((id: string) => {
    setRecipients(prev => prev.filter(r => r.id !== id));
  }, []);

  const updateRecipientAmount = useCallback((id: string, amount: string) => {
    setRecipients(prev => prev.map(r => 
      r.id === id ? { ...r, amount } : r
    ));
  }, []);

  const handleAddFromSearch = () => {
    if (searchQuery.startsWith("0x") && isValidEthereumAddress(searchQuery)) {
      const contact = contacts.find(c => c.contact_wallet_address.toLowerCase() === searchQuery.toLowerCase());
      addRecipient(searchQuery, contact?.label || `${searchQuery.slice(0, 6)}...${searchQuery.slice(-4)}`);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    
    if (recipients.length === 0) {
      setError("Add at least one recipient");
      return;
    }
    
    // Check all addresses are valid
    const invalidRecipients = recipients.filter(r => !r.isValid);
    if (invalidRecipients.length > 0) {
      setError("Some addresses are invalid. Please fix them before submitting.");
      return;
    }
    
    // Validate amounts
    const recipientData: { address: string; amount: number }[] = [];
    
    if (sameAmount) {
      const trimmedAmount = uniformAmount.trim();
      if (!trimmedAmount) {
        setError("Please enter an amount");
        return;
      }
      const amount = parseFloat(trimmedAmount);
      if (isNaN(amount) || amount < 0.01) {
        setError("Minimum amount is $0.01 USDC per recipient");
        return;
      }
      if (amount > 10000) {
        setError("Maximum amount is $10,000 USDC per recipient");
        return;
      }
      
      for (const r of recipients) {
        recipientData.push({ address: r.address, amount });
      }
    } else {
      for (const r of recipients) {
        const trimmedAmount = r.amount.trim();
        if (!trimmedAmount) {
          setError(`Please enter an amount for ${r.label}`);
          return;
        }
        const amount = parseFloat(trimmedAmount);
        if (isNaN(amount) || amount < 0.01) {
          setError(`Minimum amount is $0.01 USDC for ${r.label}`);
          return;
        }
        if (amount > 10000) {
          setError(`Maximum amount is $10,000 USDC for ${r.label}`);
          return;
        }
        recipientData.push({ address: r.address, amount });
      }
    }
    
    try {
      await onSubmit({
        recipients: recipientData,
        memo: memo || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send transfers");
    }
  };

  const filteredContacts = contacts.filter(c =>
    searchQuery === "" ||
    c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contact_wallet_address.toLowerCase().includes(searchQuery.toLowerCase())
  ).filter(c => 
    !recipients.some(r => r.address.toLowerCase() === c.contact_wallet_address.toLowerCase())
  );

  // Calculate total
  let total = 0;
  if (sameAmount && uniformAmount) {
    const amount = parseFloat(uniformAmount) || 0;
    total = amount * recipients.length;
  } else {
    total = recipients.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  }

  const allValid = recipients.every(r => r.isValid);
  const allHaveAmount = sameAmount ? !!uniformAmount : recipients.every(r => !!r.amount);
  const isDisabled = isSubmitting || isConfirming || recipients.length === 0 || !allValid || !allHaveAmount;

  return (
    <div className="card">
      <p className="card-title">Send to Multiple Recipients</p>
      
      <div className="space-y-4">
        {/* Amount Mode Toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSameAmount(true)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm ${sameAmount ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            Same amount each
          </button>
          <button
            type="button"
            onClick={() => setSameAmount(false)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm ${!sameAmount ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            Custom amounts
          </button>
        </div>
        
        {/* Uniform Amount Input */}
        {sameAmount && (
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Amount per recipient (USDC)</label>
            <input
              type="number"
              placeholder="0.00"
              value={uniformAmount}
              onChange={(e) => setUniformAmount(e.target.value)}
              step="0.01"
              min="0"
              className="input"
            />
          </div>
        )}
        
        {/* Memo */}
        <div>
          <label className="text-sm text-gray-400 mb-1 block">Memo (optional)</label>
          <input
            type="text"
            placeholder="e.g., Team bonuses"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="input"
          />
        </div>
        
        {/* Recipients */}
        <div>
          <label className="text-sm text-gray-400 mb-1 block">
            Recipients ({recipients.length} added)
          </label>
          
          {/* Add recipient search */}
          <div className="relative" ref={dropdownRef}>
            <input
              type="text"
              placeholder="Search contacts or enter wallet address..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddFromSearch();
                }
              }}
              className="input"
            />
            
            {showDropdown && (filteredContacts.length > 0 || (searchQuery.startsWith("0x") && isValidEthereumAddress(searchQuery))) && (
              <div className="dropdown max-h-48 overflow-y-auto">
                {searchQuery.startsWith("0x") && isValidEthereumAddress(searchQuery) && (
                  <button
                    type="button"
                    onClick={handleAddFromSearch}
                    className="dropdown-item flex justify-between items-center text-blue-400"
                  >
                    <span>Add address</span>
                    <span className="text-xs font-mono truncate ml-2">
                      {searchQuery.slice(0, 6)}...{searchQuery.slice(-4)}
                    </span>
                  </button>
                )}
                {filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addRecipient(c.contact_wallet_address, c.label)}
                    className="dropdown-item flex justify-between items-center"
                  >
                    <span className="font-medium">{c.label}</span>
                    <span className="text-gray-500 text-xs font-mono truncate ml-2">
                      {c.contact_wallet_address.slice(0, 6)}...{c.contact_wallet_address.slice(-4)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Recipient list */}
          {recipients.length > 0 && (
            <div className="mt-2 space-y-2">
              {recipients.map((r) => (
                <div 
                  key={r.id} 
                  className={`flex items-center gap-2 p-2 rounded-lg ${r.isValid ? "bg-gray-800" : "bg-red-900/30"}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{r.label}</span>
                    {!r.isValid && (
                      <span className="text-xs text-red-400 ml-2">(invalid)</span>
                    )}
                  </div>
                  {!sameAmount && (
                    <input
                      type="number"
                      placeholder="0.00"
                      value={r.amount}
                      onChange={(e) => updateRecipientAmount(r.id, e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-24 px-2 py-1 text-sm rounded bg-gray-700 border border-gray-600"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeRecipient(r.id)}
                    className="text-gray-500 hover:text-red-400"
                    title="Remove"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Total Preview */}
        {recipients.length > 0 && total > 0 && (
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total to send:</span>
              <span className="font-bold text-green-400">${total.toFixed(2)} USDC</span>
            </div>
          </div>
        )}
        
        {error && (
          <p className="text-error">{error}</p>
        )}
        
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isDisabled}
            className="flex-1 btn-success"
          >
            {isSubmitting ? "Sending..." : isConfirming ? "Confirming..." : `Send to ${recipients.length} Recipient${recipients.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
