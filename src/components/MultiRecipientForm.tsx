"use client";

import { useState, useRef, useEffect } from "react";
import { Contact } from "@/lib/supabase/queries";

type SplitMode = "split" | "each";
type CustomSplitType = "equal" | "percentage" | "fixed";

interface Recipient {
  id: string;
  address: string;
  label: string;
  percentage?: number;
  fixedAmount?: number;
}

interface MultiRecipientFormProps {
  mode: "request" | "send";
  contacts: Contact[];
  onSubmit: (data: {
    recipients: { address: string; amount: number }[];
    memo?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  isConfirming?: boolean;
  onCancel: () => void;
}

function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function MultiRecipientForm({
  mode,
  contacts,
  onSubmit,
  isSubmitting,
  isConfirming = false,
  onCancel,
}: MultiRecipientFormProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [totalAmount, setTotalAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("split");
  const [customSplitType, setCustomSplitType] = useState<CustomSplitType>("equal");
  const [error, setError] = useState<string | null>(null);

  // Contact search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addRecipient = (address: string, label: string) => {
    if (!address) return;
    if (recipients.some(r => r.address.toLowerCase() === address.toLowerCase())) {
      setError("This address is already added");
      return;
    }
    if (!isValidEthereumAddress(address)) {
      setError("Invalid Ethereum address format");
      return;
    }
    setRecipients([
      ...recipients,
      {
        id: crypto.randomUUID(),
        address,
        label: label || `${address.slice(0, 6)}...${address.slice(-4)}`,
        percentage: 0,
        fixedAmount: 0,
      },
    ]);
    setSearchQuery("");
    setShowDropdown(false);
    setError(null);
  };

  const removeRecipient = (id: string) => {
    setRecipients(recipients.filter(r => r.id !== id));
  };

  const updateRecipientPercentage = (id: string, percentage: number) => {
    setRecipients(recipients.map(r => 
      r.id === id ? { ...r, percentage: Math.max(0, Math.min(100, percentage)) } : r
    ));
  };

  const updateRecipientFixedAmount = (id: string, amount: number) => {
    setRecipients(recipients.map(r => 
      r.id === id ? { ...r, fixedAmount: Math.max(0, amount) } : r
    ));
  };

  const distributeEqually = () => {
    if (recipients.length === 0) return;
    const equalPercentage = 100 / recipients.length;
    setRecipients(recipients.map(r => ({ ...r, percentage: equalPercentage })));
  };

  // Calculate amounts based on split mode and custom split type
  const calculateAmounts = (): { address: string; amount: number }[] => {
    const total = parseFloat(totalAmount) || 0;
    if (total <= 0 || recipients.length === 0) return [];

    if (splitMode === "each") {
      // Each person pays the full amount
      return recipients.map(r => ({ address: r.address, amount: total }));
    }

    // Split mode
    if (customSplitType === "equal") {
      const perPerson = total / recipients.length;
      return recipients.map(r => ({ address: r.address, amount: perPerson }));
    }

    if (customSplitType === "percentage") {
      return recipients.map(r => ({
        address: r.address,
        amount: (total * (r.percentage || 0)) / 100,
      }));
    }

    if (customSplitType === "fixed") {
      return recipients.map(r => ({
        address: r.address,
        amount: r.fixedAmount || 0,
      }));
    }

    return [];
  };

  // Validation
  const totalPercentage = recipients.reduce((sum, r) => sum + (r.percentage || 0), 0);
  const totalFixed = recipients.reduce((sum, r) => sum + (r.fixedAmount || 0), 0);
  const parsedTotal = parseFloat(totalAmount) || 0;

  const isPercentageValid = customSplitType !== "percentage" || Math.abs(totalPercentage - 100) < 0.01;
  const isFixedValid = customSplitType !== "fixed" || Math.abs(totalFixed - parsedTotal) < 0.01;

  const calculatedAmounts = calculateAmounts();
  const grandTotal = calculatedAmounts.reduce((sum, r) => sum + r.amount, 0);

  const canSubmit =
    recipients.length > 0 &&
    parsedTotal >= 0.01 &&
    isPercentageValid &&
    isFixedValid &&
    !isSubmitting &&
    !isConfirming;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await onSubmit({
        recipients: calculatedAmounts,
        memo: memo || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    }
  };

  const filteredContacts = contacts.filter(c =>
    searchQuery === "" ||
    c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contact_wallet_address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const title = mode === "request" ? "Request Money" : "Send Money";
  const submitLabel = mode === "request" 
    ? (isSubmitting ? "Creating..." : "Create Requests")
    : (isSubmitting ? "Sending..." : isConfirming ? "Confirming..." : "Send Money");

  return (
    <div className="card">
      <p className="card-title">{title}</p>

      {/* Add Recipients */}
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
            if (e.key === "Enter" && searchQuery.startsWith("0x")) {
              e.preventDefault();
              addRecipient(searchQuery, "");
            }
          }}
          className="input"
        />
        
        {showDropdown && (
          <div className="dropdown">
            {searchQuery.startsWith("0x") && searchQuery.length >= 10 && (
              <button
                type="button"
                onClick={() => addRecipient(searchQuery, "")}
                className="dropdown-item text-left w-full"
              >
                <span className="text-blue-400">+ Add address: </span>
                <span className="font-mono text-xs">{searchQuery.slice(0, 10)}...</span>
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
            {filteredContacts.length === 0 && !searchQuery.startsWith("0x") && (
              <p className="px-3 py-2 text-gray-500 text-sm">No matching contacts</p>
            )}
          </div>
        )}
      </div>

      {/* Recipients List */}
      {recipients.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Recipients ({recipients.length})</p>
          {recipients.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2 bg-gray-800 rounded">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.label}</p>
                <p className="text-xs text-gray-500 font-mono truncate">{r.address}</p>
              </div>
              
              {/* Custom split inputs */}
              {splitMode === "split" && customSplitType === "percentage" && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={r.percentage || ""}
                    onChange={(e) => updateRecipientPercentage(r.id, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-16 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-right"
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              )}
              
              {splitMode === "split" && customSplitType === "fixed" && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">$</span>
                  <input
                    type="number"
                    value={r.fixedAmount || ""}
                    onChange={(e) => updateRecipientFixedAmount(r.id, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-20 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-right"
                    step="0.01"
                    min="0"
                  />
                </div>
              )}
              
              <button
                type="button"
                onClick={() => removeRecipient(r.id)}
                className="p-1 text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Amount Input */}
      <input
        type="number"
        placeholder="Amount (USDC)"
        value={totalAmount}
        onChange={(e) => setTotalAmount(e.target.value)}
        step="0.01"
        min="0"
        className="input"
      />

      {/* Split Mode Toggle */}
      {recipients.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSplitMode("split")}
              className={`flex-1 py-2 px-3 text-sm rounded transition-colors ${
                splitMode === "split"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Split total
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("each")}
              className={`flex-1 py-2 px-3 text-sm rounded transition-colors ${
                splitMode === "each"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Each pays full
            </button>
          </div>

          {/* Custom Split Options (only in split mode) */}
          {splitMode === "split" && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Split method</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomSplitType("equal");
                    distributeEqually();
                  }}
                  className={`flex-1 py-1.5 px-2 text-xs rounded transition-colors ${
                    customSplitType === "equal"
                      ? "bg-green-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Equal
                </button>
                <button
                  type="button"
                  onClick={() => setCustomSplitType("percentage")}
                  className={`flex-1 py-1.5 px-2 text-xs rounded transition-colors ${
                    customSplitType === "percentage"
                      ? "bg-green-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  By %
                </button>
                <button
                  type="button"
                  onClick={() => setCustomSplitType("fixed")}
                  className={`flex-1 py-1.5 px-2 text-xs rounded transition-colors ${
                    customSplitType === "fixed"
                      ? "bg-green-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Fixed $
                </button>
              </div>

              {/* Validation messages */}
              {customSplitType === "percentage" && !isPercentageValid && (
                <p className="text-xs text-yellow-400">
                  Percentages total {totalPercentage.toFixed(1)}% (should be 100%)
                </p>
              )}
              {customSplitType === "fixed" && parsedTotal > 0 && !isFixedValid && (
                <p className="text-xs text-yellow-400">
                  Fixed amounts total ${totalFixed.toFixed(2)} (should be ${parsedTotal.toFixed(2)})
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Memo */}
      <input
        type="text"
        placeholder="Memo (optional)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        className="input"
      />

      {/* Preview */}
      {recipients.length > 0 && parsedTotal > 0 && (
        <div className="p-3 bg-gray-800 rounded space-y-1">
          <p className="text-xs text-gray-400 font-medium">Preview</p>
          {calculatedAmounts.map((r, i) => {
            const recipient = recipients.find(rec => rec.address === r.address);
            return (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-300 truncate">{recipient?.label}</span>
                <span className="text-white font-medium">${r.amount.toFixed(2)}</span>
              </div>
            );
          })}
          <div className="border-t border-gray-700 pt-1 mt-1 flex justify-between text-sm">
            <span className="text-gray-400">Total</span>
            <span className="text-green-400 font-medium">${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-error">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`flex-1 ${mode === "request" ? "btn-primary" : "btn-success"}`}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
