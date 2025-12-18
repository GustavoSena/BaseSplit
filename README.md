# BaseSplit

Split expenses and request payments on Base blockchain using Smart Wallets and USDC.

## Features

- **Smart Wallet Integration** - Sign in with email/social via Coinbase Embedded Wallets or connect external wallets
- **Dual Wallet Support** - Use Smart Account or EOA wallet with easy switching
- **USDC Payments** - Request and send payments in USDC on Base Mainnet
- **Contact Management** - Save frequently used addresses with labels
- **Payment Requests** - Create, track, and pay pending requests
- **PWA Support** - Install as a mobile app with offline capabilities
- **Responsive Design** - Desktop header navigation, mobile bottom navigation

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_CDP_PROJECT_ID=your_cdp_project_id
```

### Getting API Keys

- **OnchainKit API Key**: Get from [Coinbase Developer Portal](https://portal.cdp.coinbase.com/)
- **CDP Project ID**: Get from [Coinbase Developer Portal](https://portal.cdp.coinbase.com/)
- **Supabase URL & Anon Key**: Get from your [Supabase Project Settings](https://supabase.com/dashboard/project/_/settings/api)

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **OnchainKit** + **wagmi** + **viem** for wallet integration
- **CDP Embedded Wallets** for social/email login with Smart Accounts
- **Supabase** for authentication and database
- **Tailwind CSS** for styling

## Database Schema

### Profiles
Stores user wallet addresses linked to Supabase auth.

### Contacts
User-managed address book with labels and notes.

### Payment Requests
Tracks payment requests with status (pending/paid/cancelled/expired).

## Roadmap

See [GitHub Issues](https://github.com/GustavoSena/BaseSplit/issues) for planned features.

## License

MIT
