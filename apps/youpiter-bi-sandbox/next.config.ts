import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=(), payment=()" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              "img-src 'self' data: https:; " +
              "style-src 'self' 'unsafe-inline' https:; " +
              "script-src 'self' 'unsafe-inline' https:; " +
              "connect-src 'self' https:; " +
              "font-src 'self' data: https:; " +
              "frame-src 'self' http://188.225.39.156; " +
              "frame-ancestors 'self';"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
