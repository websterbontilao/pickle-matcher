/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RouteMatchCallbackOptions, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare const self: WorkerGlobalScope &
  SerwistGlobalConfig & {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  };

/**
 * Serwist's default page/RSC/same-origin-document strategies are
 * NetworkFirst with no `networkTimeoutSeconds`, so offline (or right after
 * install, before this device has a solid connection) every navigation
 * hangs waiting for the network request to definitively fail before
 * falling back to the precached response — which is what made the app
 * feel slow to load offline or when freshly installed. This app has no
 * server/API that could ever be "fresher" than what's precached at build
 * time, so a short timeout is safe: give the network a couple of seconds,
 * then use the cache immediately.
 */
const FAST_FALLBACK_SECONDS = 2;

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

const fastFallbackNavigationCaching: RuntimeCaching[] = [
  {
    matcher: ({ request, url: { pathname }, sameOrigin }: RouteMatchCallbackOptions) =>
      sameOrigin &&
      !isApiPath(pathname) &&
      request.headers.get("RSC") === "1" &&
      request.headers.get("Next-Router-Prefetch") === "1",
    handler: new NetworkFirst({ cacheName: "pages-rsc-prefetch", networkTimeoutSeconds: FAST_FALLBACK_SECONDS }),
  },
  {
    matcher: ({ request, url: { pathname }, sameOrigin }: RouteMatchCallbackOptions) =>
      sameOrigin && !isApiPath(pathname) && request.headers.get("RSC") === "1",
    handler: new NetworkFirst({ cacheName: "pages-rsc", networkTimeoutSeconds: FAST_FALLBACK_SECONDS }),
  },
  {
    matcher: ({ request, url: { pathname }, sameOrigin }: RouteMatchCallbackOptions) =>
      sameOrigin && !isApiPath(pathname) && !!request.headers.get("Content-Type")?.includes("text/html"),
    handler: new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: FAST_FALLBACK_SECONDS }),
  },
  {
    matcher: ({ url: { pathname }, sameOrigin }: RouteMatchCallbackOptions) => sameOrigin && !isApiPath(pathname),
    handler: new NetworkFirst({ cacheName: "others", networkTimeoutSeconds: FAST_FALLBACK_SECONDS }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...fastFallbackNavigationCaching, ...defaultCache],
});

serwist.addEventListeners();
