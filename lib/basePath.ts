/**
 * Set by the GitHub Actions deploy workflow to "/<repo-name>" when building
 * for GitHub Pages (which serves the site from a subpath, not the domain
 * root). Empty for local dev/build and for any deployment at the root of
 * its own domain. Read here once so next.config.ts and app code agree.
 */
export const basePath = process.env.BASE_PATH ?? "";
