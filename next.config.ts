import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { basePath } from "./lib/basePath";

const nextConfig: NextConfig = {
  // GitHub Pages only serves static files — no Node server, no image
  // optimization endpoint, no API routes/middleware, none of which this app
  // uses anyway.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: basePath || undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
};

// Next.js's App Router doesn't emit the actual page/document routes into the
// standard build asset manifest Serwist precaches from (only JS/CSS/font
// chunks), so without this, a route you hadn't already visited while online
// (most importantly "/", visited before the service worker even finishes
// installing) fails to load offline. A fresh value each build is fine here —
// it just means the precache refreshes on redeploy.
const buildRevision = Date.now().toString();

// trailingSlash:true means the static export writes each route as
// "<route>/index.html", served at "<route>/" — precache entries must match
// exactly, and (when deployed under a GitHub Pages subpath) must include
// basePath too, since that's the actual URL the browser requests.
const routes = ["/", "/players/", "/history/", "/setup/"];

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Serwist prepends nextConfig.basePath to swUrl (and scope) itself, so
  // this stays "/sw.js" even under a GitHub Pages subpath — adding
  // basePath here too would double it up.
  cacheOnNavigation: true,
  // Registers `window.addEventListener("online", () => location.reload())`.
  // This app has no server-dependent data to refresh on reconnect, and
  // some browsers/networks (flaky Wi-Fi, VPN reconnects, or just toggling
  // DevTools' offline checkbox while testing) fire the "online" event
  // repeatedly — each one reloading the page, which reads as an infinite
  // reload loop. Not worth the risk for zero benefit here.
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: routes.map((route) => ({
    url: `${basePath}${route}`,
    revision: buildRevision,
  })),
});

export default withSerwist(nextConfig);
