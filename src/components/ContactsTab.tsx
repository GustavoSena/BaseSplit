"use client";

import { useState, useEffect, useCallback } from "react";
import { TrashIcon, SendIcon, RequestIcon } from "./Icons";
import {
  Contact,
  getProfileIdByWallet,
  getContactsByOwnerId,
  createContact,
  deleteContact as deleteContactQuery,
} from "@/lib/supabase/queries";

interface ContactsTabProps {
  currentWalletAddress: string | null;
  onSendMoney?: (contact: Contact) => void;
  onRequestMoney?: (contact: Contact) => void;
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

export function ContactsTab({ currentWalletAddress, onSendMoney, onRequestMoney }: ContactsTabProps) {
  const { contacts, contactsError, loadContacts } = useContacts(currentWalletAddress);
  
  // Form state - local to this component
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContactAddress, setNewContactAddress] = useState("");
  const [newContactLabel, setNewContactLabel] = useState("");
  const [newContactNote, setNewContactNote] = useState("");
  const [addContactError, setAddContactError] = useState<string | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  
  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteContact = async (contactId: string) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteContactQuery(contactId);
      if (result.error) {
        setDeleteError("Failed to delete contact. Please try again.");
      } else {
        await loadContacts();
        setDeleteConfirmId(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

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
        className="w-full btn-secondary"
      >
        {showAddContactForm ? "Cancel" : "Add Contact"}
      </button>

      {/* Add Contact Form */}
      {showAddContactForm && (
        <div className="card">
          <p className="card-title">Add New Contact</p>
          <input
            type="text"
            placeholder="Contact label (e.g., Alice)"
            value={newContactLabel}
            onChange={(e) => setNewContactLabel(e.target.value)}
            className="input"
          />
          <input
            type="text"
            placeholder="Wallet address (0x...)"
            value={newContactAddress}
            onChange={(e) => setNewContactAddress(e.target.value)}
            className="input"
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={newContactNote}
            onChange={(e) => setNewContactNote(e.target.value)}
            className="input"
          />
          {addContactError && (
            <p className="text-error">{addContactError}</p>
          )}
          <button
            onClick={addContact}
            disabled={isAddingContact || !newContactAddress || !newContactLabel}
            className="w-full btn-primary"
          >
            {isAddingContact ? "Adding..." : "Add Contact"}
          </button>
        </div>
      )}

      {contactsError && (
        <p className="text-error-center">{contactsError}</p>
      )}

      {contacts.length > 0 ? (
        <div className="card space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="list-item-compact">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.label}</span>
                    <span className="wallet-address-xs">
                      {c.contact_wallet_address.slice(0, 6)}...{c.contact_wallet_address.slice(-4)}
                    </span>
                  </div>
                  {c.note && <p className="text-gray-400 text-xs mt-1">{c.note}</p>}
                </div>
                
                {/* Action buttons */}
                <div className="flex items-center gap-1 ml-2">
                  {onSendMoney && (
                    <button
                      type="button"
                      onClick={() => onSendMoney(c)}
                      className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition-colors"
                      title="Send money"
                    >
                      <SendIcon size="sm" />
                    </button>
                  )}
                  {onRequestMoney && (
                    <button
                      type="button"
                      onClick={() => onRequestMoney(c)}
                      className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                      title="Request money"
                    >
                      <RequestIcon size="sm" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(c.id)}
                    className="p-1.5 text-red-400 hover:bg-red-900/30 rounded transition-colors"
                    title="Delete contact"
                  >
                    <TrashIcon size="sm" />
                  </button>
                </div>
              </div>
              
              {/* Delete confirmation */}
              {deleteConfirmId === c.id && (
                <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded">
                  <p className="text-sm text-red-300 mb-2">Delete "{c.label}"?</p>
                  {deleteError && (
                    <p className="text-red-400 text-xs mb-2">{deleteError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteContact(c.id)}
                      disabled={isDeleting}
                      className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }}
                      className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted">No contacts yet</p>
      )}
    </>
  );
}
