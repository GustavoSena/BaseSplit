"use client";

export function LoadingScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">BaseSplit</h1>
          <p className="text-gray-400">Split expenses on Base</p>
        </div>
        <div className="flex justify-center">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    </main>
  );
}
