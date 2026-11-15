/// <reference path="../pb_data/types.d.ts" />

// Squad logos: one image per section, uploaded in Edit Layout.
// PocketBase makes a 128x128 thumbnail (fitted, never cropped) so every logo shows at the same size.
// No SVG: an SVG can carry script.
migrate((app) => {
  const c = app.findCollectionByNameOrId("orbat_sections");
  c.fields.add(new FileField({
    name: "logo", maxSelect: 1, maxSize: 5 * 1024 * 1024,
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    thumbs: ["128x128f"],
  }));
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("orbat_sections");
  c.fields.removeByName("logo");
  app.save(c);
});
