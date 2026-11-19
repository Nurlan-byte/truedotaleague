import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { SITE_URL as BASE_URL } from "@/lib/seo";

const PAGE = 1000;

/** Paginated public id list; throws on query failure so we never serve a partial sitemap. */
async function allIds(table: "tournaments" | "teams"): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("id").order("created_at").range(from, from + PAGE - 1);
    if (error) throw new Error(`sitemap ${table}: ${error.message}`);
    ids.push(...(data ?? []).map((r) => r.id));
    if (!data || data.length < PAGE) return ids;
  }
}

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/tournaments", changefreq: "daily", priority: "0.9" },
          { path: "/archive", changefreq: "weekly", priority: "0.7" },
          { path: "/champions", changefreq: "weekly", priority: "0.8" },
          { path: "/regulations", changefreq: "monthly", priority: "0.6" },
          { path: "/teams", changefreq: "weekly", priority: "0.5" },
          { path: "/rating", changefreq: "weekly", priority: "0.5" },
        ];
        const [tournaments, teams] = await Promise.all([allIds("tournaments"), allIds("teams")]);
        for (const id of tournaments) entries.push({ path: `/tournaments/${id}`, changefreq: "daily", priority: "0.8" });
        for (const id of teams) entries.push({ path: `/teams/${id}`, changefreq: "weekly", priority: "0.4" });

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
