import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * /sitemap.xml — the list of indexable URLs we hand to search engines.
 *
 * Veloura's customer site is a single one-pager (app/page.tsx), so there's just
 * the home page here. The dress/reserve flows are modals on that same page, not
 * separate routes, and /admin is intentionally excluded (see robots.ts). If the
 * site ever gains real sub-routes, add them to this array.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
