import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/seo";

const PUBLIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/features", priority: 0.9, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.8, changeFrequency: "monthly" },
  { path: "/changelog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const lastModified = new Date();

  return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${site}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency,
    priority,
    alternates: {
      languages: {
        "es-AR": `${site}${path === "/" ? "" : path}`,
        es: `${site}${path === "/" ? "" : path}`,
      },
    },
  }));
}
