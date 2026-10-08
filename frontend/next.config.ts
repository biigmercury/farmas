import type { NextConfig } from "next";

// Tailwind is processed through postcss.config.mjs so it works in both Turbopack and webpack.
const nextConfig: NextConfig = {
  // Don't generate AGENTS.md into the project folder.
  agentRules: false,

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stop other sites from putting FarmAs inside a frame (click-jacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The microphone is for our own pages (voice notes); camera and location are not used.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
