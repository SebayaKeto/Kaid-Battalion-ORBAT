/// <reference path="../pb_data/types.d.ts" />

// The PocketBase admin dashboard (/_/) and superuser logins only work on the
// PC running the site. From a phone on the Wi-Fi, or through ngrok, they are
// refused, so nobody elsewhere can even try the superuser password.
routerUse((e) => {
  const p = e.request.url.path;
  const admin = p === "/_" || p.indexOf("/_/") === 0 || p.indexOf("/api/collections/_superusers/") === 0 ||
    (e.auth && e.auth.collection().name === "_superusers");
  if (!admin) return e.next();
  const addr = String(e.request.remoteAddr || "");
  const host = addr.lastIndexOf(":") > -1 ? addr.slice(0, addr.lastIndexOf(":")).replace(/^\[|\]$/g, "") : addr;
  const loopback = host === "127.0.0.1" || host === "::1" || host.indexOf("127.") === 0;
  // ngrok and other tunnels connect from this PC but say who really sent it
  const h = e.request.header;
  const forwarded = !!(h.get("X-Forwarded-For") || h.get("Forwarded") || h.get("X-Real-IP") || h.get("Ngrok-Trace-Id"));
  if (loopback && !forwarded) return e.next();
  throw new ForbiddenError("The admin dashboard only opens on the PC running the site.");
});
