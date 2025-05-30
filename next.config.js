/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🚨 CRITICAL: Disable React StrictMode to prevent double mounting
  reactStrictMode: false, // This was causing double mounting in development!

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  devIndicators: false,
  allowedDevOrigins: [
    "*.macaly.dev",
    "*.macaly.app",
    "*.macaly-app.com",
    "*.macaly-user-data.dev",
  ],
};

export default nextConfig;
