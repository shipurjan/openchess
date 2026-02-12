import type { NextConfig } from "next";
import { execSync } from "child_process";

function getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_COMMIT: getGitCommit(),
    NEXT_PUBLIC_BUILD_VERSION: process.env.npm_package_version ?? "0.0.0",
  },
};

export default nextConfig;
