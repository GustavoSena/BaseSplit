# BaseSplit

Split expenses on Base blockchain using Smart Wallets.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Create a `.env.local` file with:

```
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Getting API Keys

- **OnchainKit API Key**: Get from [Coinbase Developer Portal](https://portal.cdp.coinbase.com/)
- **Supabase URL & Anon Key**: Get from your [Supabase Project Settings](https://supabase.com/dashboard/project/_/settings/api)

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **OnchainKit** + **wagmi** + **viem** for Base Smart Wallet integration
- **Supabase** for authentication and database
- **Tailwind CSS** for styling

## Features

- Base Smart Wallet connect
- Supabase authentication with wallet signature
- User profiles with RLS (Row Level Security)
