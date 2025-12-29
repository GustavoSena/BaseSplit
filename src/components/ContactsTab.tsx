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

const CONTACTS_CACHE_KEY = "basesplit-contacts";

/**
 * Loads and exposes contacts associated with the given wallet address.
 *
 * @param currentWalletAddress - Wallet address used to resolve the owner profile and fetch contacts; if `null`, no contacts are loaded.
 * @returns An object containing:
 *  - `contacts`: the list of fetched `Contact` items (empty array when none).
 *  - `contactsError`: an error message when loading fails, or `null` when there is no error.
 *  - `loadContacts`: a function to re-fetch the contacts for the current `currentWalletAddress`.
 */
export function useContacts(currentWalletAddress: string | null) {
  const [contacts, setContacts] = useState<Contact[]>(() => {
    // Initialize from localStorage cache
    if (typeof window !== "undefined" && currentWalletAddress) {
      try {
        const cached = localStorage.getItem(`${CONTACTS_CACHE_KEY}-${currentWalletAddress.toLowerCase()}`);
        return cached ? JSON.parse(cached) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadContacts = useCallback(async (forceRefresh = false) => {
    if (!currentWalletAddress) return;

    // Skip if already loaded and not forcing refresh
    if (hasLoadedOnce && !forceRefresh && contacts.length > 0) return;

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
        const newContacts = contactsResult.data || [];
        setContacts(newContacts);
        // Cache to localStorage
        try {
          localStorage.setItem(
            `${CONTACTS_CACHE_KEY}-${currentWalletAddress.toLowerCase()}`,
            JSON.stringify(newContacts)
          );
        } catch {
          // Ignore localStorage errors
        }
      }
      setHasLoadedOnce(true);
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : "Failed to load contacts");
      setContacts([]);
    }
  }, [currentWalletAddress, hasLoadedOnce, contacts.length]);

  // Load on mount or wallet change
  useEffect(() => {
    if (currentWalletAddress) {
      // Load from cache first
      try {
        const cached = localStorage.getItem(`${CONTACTS_CACHE_KEY}-${currentWalletAddress.toLowerCase()}`);
        if (cached) {
          setContacts(JSON.parse(cached));
        }
      } catch {
        // Ignore
      }
      // Then refresh from server
      loadContacts(true);
    }
  }, [currentWalletAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force refresh function for when contacts are added/deleted
  const refreshContacts = useCallback(() => {
    return loadContacts(true);
  }, [loadContacts]);

  return { contacts, contactsError, loadContacts: refreshContacts };
}

/**
 * Render the Contacts tab UI allowing the user to view, add, request, send, and delete contacts.
 *
 * This component loads contacts for the provided wallet, presents an add-contact form, per-contact
 * actions (send, request, delete), and displays loading/error states for add/delete operations.
 *
 * @param currentWalletAddress - The current user's wallet address used to load and manage contacts; pass `null` when not signed in.
 * @param onSendMoney - Optional callback invoked with a contact when the user chooses to send money.
 * @param onRequestMoney - Optional callback invoked with a contact when the user chooses to request money.
 * @returns The JSX element for the contacts management tab.
 */
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
                  {c.note && <p className="text-muted-foreground text-xs mt-1">{c.note}</p>}
                </div>
                
                {/* Action buttons */}
                <div className="flex items-center gap-1 ml-2">
                  {onSendMoney && (
                    <button
                      type="button"
                      onClick={() => onSendMoney(c)}
                      className="p-1.5 text-success-500 hover:bg-success-100 dark:hover:bg-success-900/30 rounded transition-colors"
                      title="Send money"
                    >
                      <SendIcon size="sm" />
                    </button>
                  )}
                  {onRequestMoney && (
                    <button
                      type="button"
                      onClick={() => onRequestMoney(c)}
                      className="p-1.5 text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                      title="Request money"
                    >
                      <RequestIcon size="sm" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(c.id)}
                    className="p-1.5 text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-900/30 rounded transition-colors"
                    title="Delete contact"
                  >
                    <TrashIcon size="sm" />
                  </button>
                </div>
              </div>
              
              {/* Delete confirmation */}
              {deleteConfirmId === c.id && (
                <div className="mt-2 p-2 bg-danger-100 dark:bg-danger-900/20 border border-danger-300 dark:border-danger-800 rounded">
                  <p className="text-sm text-danger-600 dark:text-danger-300 mb-2">Delete "{c.label}"?</p>
                  {deleteError && (
                    <p className="text-danger-500 text-xs mb-2">{deleteError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteContact(c.id)}
                      disabled={isDeleting}
                      className="btn-danger-sm"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }}
                      className="btn-secondary-sm"
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