import type { NextConfig } from "next";
import { execSync } from "child_process";

function getGitCommit(): string {
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT;
  }
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
  env: {
    NEXT_PUBLIC_GIT_COMMIT: getGitCommit(),
    NEXT_PUBLIC_BUILD_VERSION: process.env.npm_package_version ?? "0.0.0",
  },
};

export default nextConfig;
