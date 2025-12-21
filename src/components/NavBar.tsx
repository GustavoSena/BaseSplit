"use client";

import { ReactNode } from "react";
import { RequestsIcon, ContactsIcon, SettingsIcon } from "./Icons";

export type TabId = "requests" | "contacts" | "settings";

interface NavItem {
  id: TabId;
  label: string;
  icon: ReactNode;
}

interface NavBarProps {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
}

const navItems: NavItem[] = [
  { id: "requests", label: "Requests", icon: <RequestsIcon /> },
  { id: "contacts", label: "Contacts", icon: <ContactsIcon /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
];

export function DesktopHeader({ activeTab, onTabChange }: NavBarProps) {
  return (
    <header className="desktop-header">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <h1 className="text-xl font-bold text-white">BaseSplit</h1>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                aria-current={activeTab === item.id ? "page" : undefined}
                className={activeTab === item.id ? "btn-nav-active" : "btn-nav-inactive"}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

export function MobileNav({ activeTab, onTabChange }: NavBarProps) {
  return (
    <nav className="mobile-nav">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            aria-current={activeTab === item.id ? "page" : undefined}
            className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
              activeTab === item.id ? "text-blue-500" : "text-gray-400"
            }`}
          >
            {item.icon}
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
