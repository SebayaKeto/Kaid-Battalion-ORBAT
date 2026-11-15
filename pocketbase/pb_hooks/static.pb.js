/// <reference path="../pb_data/types.d.ts" />

// The page itself (index.html) must never be kept by the browser, or an
// update to the site doesn't show until someone hard-refreshes. The built
// scripts and styles in /assets have new names on every build, so they can be cached.
routerUse((e) => {
  const p = e.request.url.path;
  if (!p.startsWith("/api/") && !p.startsWith("/_/") && !p.startsWith("/assets/")) e.response.header().set("Cache-Control", "no-cache");
  return e.next();
});
