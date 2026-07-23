import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next mis-infer the workspace
  // root; pin it to this repo.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
