import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.env.VERCEL ? path.join(__dirname, "..") : path.join(__dirname),
  },
};

export default nextConfig;
