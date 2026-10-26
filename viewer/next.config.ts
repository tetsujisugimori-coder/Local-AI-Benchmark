import type { NextConfig } from "next";

const basePath = process.env.VIEWER_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_VIEWER_BASE_PATH: basePath,
  },
};

export default nextConfig;
