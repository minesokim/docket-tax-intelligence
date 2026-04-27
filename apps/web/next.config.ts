import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@docket/contracts",
    "@docket/ai",
    "@docket/db",
    "@docket/domain",
    "@docket/tax-knowledge",
    "@docket/ui",
  ],
};

export default nextConfig;
