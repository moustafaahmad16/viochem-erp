import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Windows app ships the server as one self-contained folder (see desktop/prepare.mjs).
  output: process.env.VIOCHEM_STANDALONE ? "standalone" : undefined,
  // Every page reads live business data for a signed-in user, so nothing is cached between requests.
  cacheComponents: false,
  // The e-seal signer script is read from disk when an admin downloads it.
  outputFileTracingIncludes: { "/settings/eta/signer": ["./signer/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
