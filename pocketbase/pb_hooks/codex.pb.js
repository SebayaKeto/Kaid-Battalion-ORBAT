/// <reference path="../pb_data/types.d.ts" />

// Codex edit mode routes. Reading is public; every change checks the Edit Codex
// permission. See lib/codex.js.

routerAdd("GET", "/api/orbat/codex", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.list(e.app, e.auth));
});

routerAdd("POST", "/api/orbat/codex/pages", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.create(e.app, e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"), $apis.bodyLimit(8 * 1024 * 1024));

routerAdd("POST", "/api/orbat/codex/pages/{key}", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.save(e.app, e.request.pathValue("key"), e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"), $apis.bodyLimit(8 * 1024 * 1024));

routerAdd("POST", "/api/orbat/codex/pages/{key}/delete", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.remove(e.app, e.request.pathValue("key"), e.auth));
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/orbat/codex/pages/{key}/history", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.historyList(e.app, e.request.pathValue("key"), e.auth));
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/orbat/codex/deleted", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.deletedList(e.app, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/codex/history/{id}/restore", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.restore(e.app, e.request.pathValue("id"), e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/codex/order", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.reorder(e.app, e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/codex/upload", (e) => {
  const c = require(`${__hooks}/lib/codex.js`);
  return e.json(200, c.upload(e.app, e, e.auth));
}, $apis.requireAuth("users"), $apis.bodyLimit(11 * 1024 * 1024));
