import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disable Turbopack FS cache to prevent SST panics on unclean shutdowns
    turbopackFileSystemCacheForDev: false,
  },
  serverExternalPackages: ["pg", "bcryptjs", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
};

export default nextConfig;
