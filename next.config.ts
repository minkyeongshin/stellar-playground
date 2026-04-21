import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "design-system.stellar.org",
        pathname: "/img/**",
      },
    ],
  },
};

export default nextConfig;
