"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Contact } from "@/lib/supabase/queries";
import { TrashIcon } from "./Icons";

// Validate Ethereum address format
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

interface Participant {
  id: string;
  address: string;
  label: string;
  isValid: boolean;
}

interface BillSplitFormProps {
  contacts: Contact[];
  currentWalletAddress: string;
  onSubmit: (params: {
    participants: { address: string; amount: number }[];
    memo?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  onCancel: () => void;
}

export function BillSplitForm({
  contacts,
  currentWalletAddress,
  onSubmit,
  isSubmitting,
  onCancel,
}: BillSplitFormProps) {
  const [totalAmount, setTotalAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [includeSelf, setIncludeSelf] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Contact search state for adding participants
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

  const addParticipant = useCallback((address: string, label: string) => {
    const normalizedAddress = address.toLowerCase();
    
    // Check if already added
    if (participants.some(p => p.address.toLowerCase() === normalizedAddress)) {
      setError("This address is already added");
      return;
    }
    
    // Check if it's the current user's address
    if (normalizedAddress === currentWalletAddress?.toLowerCase()) {
      setError("Use 'Include myself' option instead of adding your own address");
      return;
    }
    
    setParticipants(prev => [...prev, {
      id: crypto.randomUUID(),
      address: normalizedAddress,
      label,
      isValid: isValidEthereumAddress(address),
    }]);
    setSearchQuery("");
    setShowDropdown(false);
    setError(null);
  }, [participants, currentWalletAddress]);

  const removeParticipant = useCallback((id: string) => {
    setParticipants(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleAddFromSearch = () => {
    if (searchQuery.startsWith("0x") && isValidEthereumAddress(searchQuery)) {
      const contact = contacts.find(c => c.contact_wallet_address.toLowerCase() === searchQuery.toLowerCase());
      addParticipant(searchQuery, contact?.label || `${searchQuery.slice(0, 6)}...${searchQuery.slice(-4)}`);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    
    // Validate total amount
    const trimmedAmount = totalAmount.trim();
    if (!trimmedAmount) {
      setError("Please enter a total amount");
      return;
    }
    const total = parseFloat(trimmedAmount);
    if (isNaN(total) || total < 0.01) {
      setError("Minimum amount is $0.01 USDC");
      return;
    }
    if (total > 100000) {
      setError("Maximum total is $100,000 USDC");
      return;
    }
    
    // Calculate number of people splitting
    const splitCount = participants.length + (includeSelf ? 1 : 0);
    if (splitCount < 2) {
      setError("Add at least 2 participants to split the bill");
      return;
    }
    
    // Check all addresses are valid
    const invalidParticipants = participants.filter(p => !p.isValid);
    if (invalidParticipants.length > 0) {
      setError("Some addresses are invalid. Please fix them before submitting.");
      return;
    }
    
    // Calculate per-person amount (round to 2 decimal places for USDC)
    const perPersonAmount = Math.round((total / splitCount) * 100) / 100;
    
    // Create payment requests for each participant (excluding self)
    const requestParams = participants.map(p => ({
      address: p.address,
      amount: perPersonAmount,
    }));
    
    try {
      await onSubmit({
        participants: requestParams,
        memo: memo || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create split requests");
    }
  };

  const filteredContacts = contacts.filter(c =>
    searchQuery === "" ||
    c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contact_wallet_address.toLowerCase().includes(searchQuery.toLowerCase())
  ).filter(c => 
    !participants.some(p => p.address.toLowerCase() === c.contact_wallet_address.toLowerCase())
  );

  // Calculate preview
  const total = parseFloat(totalAmount) || 0;
  const splitCount = participants.length + (includeSelf ? 1 : 0);
  const perPerson = splitCount > 0 ? Math.round((total / splitCount) * 100) / 100 : 0;
  const allValid = participants.every(p => p.isValid);
  const isDisabled = isSubmitting || splitCount < 2 || total < 0.01 || !allValid;

  return (
    <div className="card">
      <p className="card-title">Split a Bill</p>
      
      <div className="space-y-4">
        {/* Total Amount */}
        <div>
          <label className="text-sm text-gray-400 mb-1 block">Total Bill Amount (USDC)</label>
          <input
            type="number"
            placeholder="0.00"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            step="0.01"
            min="0"
            className="input"
          />
        </div>
        
        {/* Memo */}
        <div>
          <label className="text-sm text-gray-400 mb-1 block">Description (optional)</label>
          <input
            type="text"
            placeholder="e.g., Dinner at Joe's"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="input"
          />
        </div>
        
        {/* Include Self Toggle */}
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeSelf}
            onChange={(e) => setIncludeSelf(e.target.checked)}
            className="rounded border-gray-600 bg-gray-700 text-blue-500"
          />
          Include myself in the split (I paid and want to split evenly)
        </label>
        
        {/* Participants */}
        <div>
          <label className="text-sm text-gray-400 mb-1 block">
            Participants ({participants.length} added)
          </label>
          
          {/* Add participant search */}
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
                    onClick={() => addParticipant(c.contact_wallet_address, c.label)}
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
          
          {/* Participant list */}
          {participants.length > 0 && (
            <div className="mt-2 space-y-1">
              {participants.map((p) => (
                <div 
                  key={p.id} 
                  className={`flex items-center justify-between p-2 rounded-lg ${p.isValid ? "bg-gray-800" : "bg-red-900/30"}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{p.label}</span>
                    {!p.isValid && (
                      <span className="text-xs text-red-400 ml-2">(invalid address)</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeParticipant(p.id)}
                    className="text-gray-500 hover:text-red-400 ml-2"
                    title="Remove"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Split Preview */}
        {splitCount >= 2 && total > 0 && (
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-sm text-gray-400">Split Preview</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Total amount:</span>
                <span className="font-medium">${total.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span>Split between:</span>
                <span className="font-medium">{splitCount} people</span>
              </div>
              <div className="flex justify-between text-blue-400">
                <span>Each person pays:</span>
                <span className="font-bold">${perPerson.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Requests to create:</span>
                <span>{participants.length}</span>
              </div>
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
            className="flex-1 btn-primary"
          >
            {isSubmitting ? "Creating..." : `Create ${participants.length} Request${participants.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
