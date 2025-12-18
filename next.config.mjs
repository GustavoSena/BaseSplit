/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force dynamic rendering to avoid SSR issues with client-side only dependencies
  experimental: {
    // Ensure proper handling of client components
  },
};

export default nextConfig;
