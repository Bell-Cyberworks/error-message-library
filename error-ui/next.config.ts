import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the Dockerfile can ship a minimal runtime image
  // (see error-ui/Dockerfile).
  output: "standalone",
};

export default nextConfig;
