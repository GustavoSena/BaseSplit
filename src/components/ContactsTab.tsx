"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Contact,
  getProfileIdByWallet,
  getContactsByOwnerId,
  createContact,
} from "@/lib/supabase/queries";

interface ContactsTabProps {
  currentWalletAddress: string | null;
}

export function useContacts(currentWalletAddress: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    if (!currentWalletAddress) return;

    setContactsError(null);
    try {
      const profileResult = await getProfileIdByWallet(currentWalletAddress);
      if (!profileResult.data) {
        setContacts([]);
        return;
      }

      const contactsResult = await getContactsByOwnerId(profileResult.data.id);
      if (contactsResult.error) {
        setContactsError(contactsResult.error);
        setContacts([]);
      } else {
        setContacts(contactsResult.data || []);
      }
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : "Failed to load contacts");
      setContacts([]);
    }
  }, [currentWalletAddress]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  return { contacts, contactsError, loadContacts };
}

export function ContactsTab({ currentWalletAddress }: ContactsTabProps) {
  const { contacts, contactsError, loadContacts } = useContacts(currentWalletAddress);
  
  // Form state - local to this component
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContactAddress, setNewContactAddress] = useState("");
  const [newContactLabel, setNewContactLabel] = useState("");
  const [newContactNote, setNewContactNote] = useState("");
  const [addContactError, setAddContactError] = useState<string | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);

  const addContact = async () => {
    if (!currentWalletAddress || !newContactAddress || !newContactLabel) return;

    setIsAddingContact(true);
    setAddContactError(null);

    try {
      const profileResult = await getProfileIdByWallet(currentWalletAddress);
      if (!profileResult.data) {
        throw new Error("Profile not found. Please sign in again.");
      }

      const result = await createContact({
        ownerId: profileResult.data.id,
        contactWalletAddress: newContactAddress,
        label: newContactLabel,
        note: newContactNote || null,
      });

      if (result.error) throw new Error(result.error);

      // Reset form and reload
      setNewContactAddress("");
      setNewContactLabel("");
      setNewContactNote("");
      setShowAddContactForm(false);
      await loadContacts();
    } catch (err) {
      setAddContactError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setIsAddingContact(false);
    }
  };
  return (
    <>
      <button
        onClick={() => setShowAddContactForm(!showAddContactForm)}
        className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
      >
        {showAddContactForm ? "Cancel" : "Add Contact"}
      </button>

      {/* Add Contact Form */}
      {showAddContactForm && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-400 font-medium">Add New Contact</p>
          <input
            type="text"
            placeholder="Contact label (e.g., Alice)"
            value={newContactLabel}
            onChange={(e) => setNewContactLabel(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Wallet address (0x...)"
            value={newContactAddress}
            onChange={(e) => setNewContactAddress(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={newContactNote}
            onChange={(e) => setNewContactNote(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {addContactError && (
            <p className="text-red-400 text-xs">{addContactError}</p>
          )}
          <button
            onClick={addContact}
            disabled={isAddingContact || !newContactAddress || !newContactLabel}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {isAddingContact ? "Adding..." : "Add Contact"}
          </button>
        </div>
      )}

      {contactsError && (
        <p className="text-red-400 text-sm text-center">{contactsError}</p>
      )}

      {contacts.length > 0 ? (
        <div className="bg-gray-900 rounded-lg p-4 space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="text-white text-sm border-b border-gray-700 pb-2 last:border-0">
              <span className="font-medium">{c.label}</span>
              <span className="text-gray-500 font-mono text-xs ml-2">
                {c.contact_wallet_address.slice(0, 6)}...{c.contact_wallet_address.slice(-4)}
              </span>
              {c.note && <p className="text-gray-400 text-xs mt-1">{c.note}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm text-center">No contacts yet</p>
      )}
    </>
  );
}
