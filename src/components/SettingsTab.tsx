"use client";

interface CDPAuthType {
  smartAccountAddress: string | null;
  eoaAddress: string | null;
  selectedWalletType: "smart" | "eoa";
  switchWalletType: (type: "smart" | "eoa") => void;
  signOut: () => void;
}

interface WalletAuthType {
  isAuthenticated: boolean;
  signOut: () => void;
}

interface SettingsTabProps {
  isCDPSignedIn: boolean;
  cdpAuth: CDPAuthType;
  walletAuth: WalletAuthType;
  formattedSmartBalance: string;
  formattedEoaBalance: string;
}

export function SettingsTab({
  isCDPSignedIn,
  cdpAuth,
  walletAuth,
  formattedSmartBalance,
  formattedEoaBalance,
}: SettingsTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-white font-medium">Wallet Settings</h3>
      
      {isCDPSignedIn && cdpAuth.smartAccountAddress && cdpAuth.eoaAddress ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">Select which wallet to use:</p>
          
          {/* Smart Account Option */}
          <button
            onClick={() => cdpAuth.switchWalletType("smart")}
            className={`w-full p-4 rounded-lg border-2 transition-colors text-left ${
              cdpAuth.selectedWalletType === "smart"
                ? "border-blue-500 bg-blue-900/20"
                : "border-gray-700 bg-gray-900 hover:border-gray-600"
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-white font-medium">Smart Account</p>
                <p className="text-gray-500 font-mono text-xs">
                  {cdpAuth.smartAccountAddress.slice(0, 10)}...{cdpAuth.smartAccountAddress.slice(-8)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-white font-bold">${formattedSmartBalance}</p>
                <p className="text-gray-500 text-xs">USDC</p>
              </div>
            </div>
            {cdpAuth.selectedWalletType === "smart" && (
              <span className="inline-block mt-2 text-xs text-blue-400">✓ Active</span>
            )}
          </button>
          
          {/* EOA Option */}
          <button
            onClick={() => cdpAuth.switchWalletType("eoa")}
            className={`w-full p-4 rounded-lg border-2 transition-colors text-left ${
              cdpAuth.selectedWalletType === "eoa"
                ? "border-blue-500 bg-blue-900/20"
                : "border-gray-700 bg-gray-900 hover:border-gray-600"
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-white font-medium">EOA Wallet</p>
                <p className="text-gray-500 font-mono text-xs">
                  {cdpAuth.eoaAddress.slice(0, 10)}...{cdpAuth.eoaAddress.slice(-8)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-white font-bold">${formattedEoaBalance}</p>
                <p className="text-gray-500 text-xs">USDC</p>
              </div>
            </div>
            {cdpAuth.selectedWalletType === "eoa" && (
              <span className="inline-block mt-2 text-xs text-blue-400">✓ Active</span>
            )}
          </button>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">
          {isCDPSignedIn 
            ? "Only one wallet type available" 
            : "Sign in with social login to manage wallet settings"}
        </p>
      )}
      
      {/* Sign Out Button */}
      <button
        onClick={walletAuth.isAuthenticated ? walletAuth.signOut : cdpAuth.signOut}
        className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
