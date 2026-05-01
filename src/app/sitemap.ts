import type { MetadataRoute } from "next";

import { LOCALES } from "@/lib/i18n/locale";
import { getSiteUrl } from "@/lib/seo";

const PUBLIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/features", priority: 0.9, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.8, changeFrequency: "monthly" },
  { path: "/changelog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.4, changeFrequency: "yearly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
];

const HREFLANG: Record<(typeof LOCALES)[number], string> = {
  es: "es-AR",
  en: "en-US",
};

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const lastModified = new Date();

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of LOCALES) {
    for (const { path, priority, changeFrequency } of PUBLIC_ROUTES) {
      const localizedPath = `/${locale}${path}`;
      entries.push({
        url: `${site}${localizedPath}`,
        lastModified,
        changeFrequency,
        priority,
        alternates: {
          languages: Object.fromEntries([
            ...LOCALES.map((other) => [
              HREFLANG[other],
              `${site}/${other}${path}`,
            ]),
            ["x-default", `${site}/es${path}`],
          ]),
        },
      });
    }
  }

  return entries;
}
