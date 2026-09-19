/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["mailparser"],
  },
};

module.exports = nextConfig;
