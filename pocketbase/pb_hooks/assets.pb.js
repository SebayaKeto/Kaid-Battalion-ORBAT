/// <reference path="../pb_data/types.d.ts" />

// Assets page routes. Reading is public; every change checks the Assets
// permission (approving new types checks Approve asset types). See lib/assets.js.

routerAdd("GET", "/api/orbat/assets", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.summary(e.app, String(e.request.url.query().get("campaign") || ""), e.auth));
});

routerAdd("GET", "/api/orbat/assets/pending-count", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  if (!a.canApprove(e.auth)) return e.json(200, { count: 0 });
  return e.json(200, { count: e.app.findRecordsByFilter("asset_types", "status = 'pending'", "", 0, 0).length });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/assets/log", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.log(e.app, e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/assets/entries/{id}/retract", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.retract(e.app, e.request.pathValue("id"), e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/assets/types", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.submitType(e.app, e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/assets/types/{id}/review", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.reviewType(e.app, e.request.pathValue("id"), e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/assets/types/{id}/update", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.updateType(e.app, e.request.pathValue("id"), e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/assets/types/{id}/image", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.setImage(e.app, e.request.pathValue("id"), e, e.auth));
}, $apis.requireAuth("users"), $apis.bodyLimit(6 * 1024 * 1024));

routerAdd("POST", "/api/orbat/assets/presets", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.savePreset(e.app, e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/assets/presets/{id}/delete", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.deletePreset(e.app, e.request.pathValue("id"), e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/assets/starting-supply", (e) => {
  const a = require(`${__hooks}/lib/assets.js`);
  return e.json(200, a.setStartingSupply(e.app, e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

// asset images: keep a plain copy in pocketbase/asset_images, and put it back
// on start-up if the database lost it (same idea as squad logos)
onRecordUpdate((e) => {
  const before = e.record.original();
  e.next();
  require(`${__hooks}/lib/assets.js`).syncImage(e.app, e.record, before);
}, "asset_types");
onBootstrap((e) => {
  e.next();
  require(`${__hooks}/lib/assets.js`).restoreImages(e.app);
});
