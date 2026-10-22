import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/api/:path*",
      },
      {
        source: "/mcp",
        destination: "http://localhost:3000/mcp",
      },
      {
        source: "/health",
        destination: "http://localhost:3000/health",
      },
    ];
  },
};

export default nextConfig;
