import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8000";
// Streaming chat (SSE) is its own service; on AWS a CloudFront path pattern sends /api/chat/* to it.
const chatOrigin = process.env.CHAT_ORIGIN ?? "http://localhost:8001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dev-only badge: keep it off the sidebar's account menu (bottom left).
  devIndicators: { position: "bottom-right" },
  // Same-origin API calls. On AWS, CloudFront routes /api/* to the ALB instead.
  async rewrites() {
    return [
      { source: "/api/chat/:path*", destination: `${chatOrigin}/api/chat/:path*` },
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
    ];
  },
};

export default nextConfig;
