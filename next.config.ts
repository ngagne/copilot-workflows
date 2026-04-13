import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Exclude Copilot SDK packages from bundling so they resolve from node_modules at runtime
  serverExternalPackages: ['@github/copilot', '@github/copilot-sdk'],
};

export default nextConfig;
