import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow next/image to optimize dress photos served from Supabase Storage.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zurjduoqwzpqulsgssns.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
