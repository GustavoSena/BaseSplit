import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@coinbase/onchainkit/styles.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BaseSplit",
  description: "Split payments and request money with USDC on Base",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BaseSplit",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#3b82f6",
};

/**
 * Root layout component that defines the document HTML structure, global fonts, and app-level providers.
 *
 * Renders the top-level <html> and <body> elements, injects the base app ID meta and favicon/apple-touch-icon links, and wraps `children` with the application's Providers.
 *
 * @param children - The application UI to render inside the layout
 * @returns The root HTML element tree containing head metadata and the app content wrapped by Providers
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="base:app_id" content={process.env.NEXT_PUBLIC_BASE_APP_ID} />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}