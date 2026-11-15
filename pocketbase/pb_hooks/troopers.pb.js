/// <reference path="../pb_data/types.d.ts" />

// Trooper profiles. Reading is public; adding or revoking a qualification or
// certification by hand needs Unit Administration. See lib/awards.js.

routerAdd("GET", "/api/orbat/awards/catalog", (e) => {
  const a = require(`${__hooks}/lib/awards.js`);
  const text = String(e.request.url.query().get("text") || "");
  return e.json(200, Object.assign(a.catalog(), { match: text ? a.match(text) : null }));
});

routerAdd("GET", "/api/orbat/troopers/{id}", (e) => {
  const a = require(`${__hooks}/lib/awards.js`);
  return e.json(200, a.profile(e.app, e.request.pathValue("id"), e.auth));
});

routerAdd("POST", "/api/orbat/troopers/{id}/awards", (e) => {
  const a = require(`${__hooks}/lib/awards.js`);
  return e.json(200, a.addByHand(e.app, e.request.pathValue("id"), e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/troopers/{id}/awards/revoke", (e) => {
  const a = require(`${__hooks}/lib/awards.js`);
  return e.json(200, a.revoke(e.app, e.request.pathValue("id"), e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));
