import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * /robots.txt — tells crawlers what they may fetch.
 *
 * Next generates this from the object below (App Router file convention). We let
 * everything crawl the public customer site but keep /admin (login + the
 * protected dashboard) out of search results. `sitemap` points crawlers at our
 * URL list so they discover pages faster.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/admin",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
