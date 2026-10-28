import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "sharp", "pg"],
  poweredByHeader: false,
  // demo-only sample party photos are read from disk by the admin "demo_photos" action
  outputFileTracingIncludes: { "/api/admin/party": ["./demo-assets/party-photos/*.jpg"] },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ] }];
  },
};
export default config;
