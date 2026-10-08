import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live business data for a signed-in user, so nothing is cached between requests.
  cacheComponents: false,
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
