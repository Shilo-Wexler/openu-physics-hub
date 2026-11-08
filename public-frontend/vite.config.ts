import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { COURSES } from "./scripts/courses.ts";
import {
  courseDescription,
  courseTitle,
  GENERAL_CHAT_TITLE,
  ROUTE_TITLES,
  SITE_DESCRIPTION,
  withSite,
} from "./src/shared/seo/pageText.ts";

// The fixed pages search engines should find (as in scripts/sitemap.mjs). The home page is
// index.html itself, which nginx also serves for every address without a file of its own.
const FIXED_PAGES = ["/chat", "/courses", "/announcements", "/inquiry", "/about", "/privacy"];

interface PageHead {
  path: string;
  title: string;
  description: string;
}

function pageHeads(): PageHead[] {
  const fixed = FIXED_PAGES.map((path) => {
    const name = ROUTE_TITLES[path];
    if (name === undefined) throw new Error(`no title for ${path} in ROUTE_TITLES`);
    return { path, title: withSite(name), description: SITE_DESCRIPTION };
  });
  const general = {
    path: "/chat/general",
    title: withSite(GENERAL_CHAT_TITLE),
    description: SITE_DESCRIPTION,
  };
  const courses = COURSES.map((course) => ({
    path: `/courses/${course.id}`,
    title: withSite(courseTitle(course.name)),
    description: courseDescription(course.id, course.name),
  }));
  return [...fixed, general, ...courses];
}

/** Text for inside an HTML tag or a double-quoted attribute. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// The tags each page replaces in index.html. Each must appear exactly once.
const TITLE_TAG = /<title>[^<]*<\/title>/g;
const metaTag = (attr: string, key: string) =>
  new RegExp(`<meta ${attr}="${key}" content="[^"]*" />`, "g");
const DESCRIPTION_TAG = metaTag("name", "description");
const OG_TITLE_TAG = metaTag("property", "og:title");
const OG_DESCRIPTION_TAG = metaTag("property", "og:description");

function replaceOnce(html: string, tag: RegExp, replacement: string): string {
  const found = html.match(tag)?.length ?? 0;
  if (found !== 1) throw new Error(`index.html: expected one ${tag.source}, found ${found}`);
  // A function, so a "$" in the replacement is kept as it is.
  return html.replace(tag, () => replacement);
}

function pageHtml(template: string, head: PageHead): string {
  const title = escapeHtml(head.title);
  const description = escapeHtml(head.description);
  let html = template;
  html = replaceOnce(html, TITLE_TAG, `<title>${title}</title>`);
  html = replaceOnce(html, DESCRIPTION_TAG, `<meta name="description" content="${description}" />`);
  html = replaceOnce(html, OG_TITLE_TAG, `<meta property="og:title" content="${title}" />`);
  html = replaceOnce(
    html,
    OG_DESCRIPTION_TAG,
    `<meta property="og:description" content="${description}" />`,
  );
  return html;
}

/**
 * Writes dist/<path>/index.html for each page: a copy of the built index.html with the page's own
 * title and description, so search engines see them without running the app. nginx serves the
 * copy for its address (nginx.conf); the app then loads exactly as from index.html.
 */
function pageHeadsPlugin(): Plugin {
  return {
    name: "openuvoice-page-heads",
    apply: "build",
    // After Vite's own plugins, so index.html is already in the bundle with its script tags.
    enforce: "post",
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type !== "asset" || typeof index.source !== "string") {
        return this.error("index.html is missing from the build");
      }
      const template = index.source;
      if (!template.includes(`content="${escapeHtml(SITE_DESCRIPTION)}"`)) {
        return this.error("the description in index.html differs from SITE_DESCRIPTION in pageText.ts");
      }
      for (const head of pageHeads()) {
        this.emitFile({
          type: "asset",
          fileName: `${head.path.slice(1)}/index.html`,
          source: pageHtml(template, head),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pageHeadsPlugin()],
  build: {
    // Vite puts small files (under 4KB) inside the JavaScript. Never the avatars: every visitor
    // would download them on the first load, even without opening the chat or the profile.
    // As files they are fetched only where shown, and cached for a year.
    assetsInlineLimit: (filePath) => (filePath.includes("/assets/avatars/") ? false : undefined),
  },
  server: {
    port: 5173,
    // Fail instead of silently moving to another port: Google sign-in only
    // accepts the origins registered in Google Cloud Console.
    strictPort: true,
    // Dev only: the Cloudflare tunnel name used for testing on a phone.
    // Vite rejects any other Host header (protection against DNS rebinding).
    allowedHosts: ["dev.openuvoice.com"],
    // Dev only: forward API calls to the backends running locally, so the
    // browser sees one origin, the same as behind the Ingress in production.
    proxy: {
      "/api/chat": "http://localhost:8000",
      // admin-backend: the only two routes the public site uses.
      "/api/inquiries": "http://localhost:8001",
      "/api/announcements": "http://localhost:8001",
    },
  },
});