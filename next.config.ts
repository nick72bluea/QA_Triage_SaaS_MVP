import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  
  // In newer Next.js versions, this is a top-level property, not experimental
  allowedDevOrigins: ['*.ngrok-free.app'],
};

export default nextConfig;