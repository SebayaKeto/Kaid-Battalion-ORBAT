import { pb } from "../pb.js";

// Codex edit mode calls. See pocketbase/pb_hooks/codex.pb.js.

export async function loadCodex() {
  try {
    return await pb.send("/api/orbat/codex", { method: "GET" });
  } catch {
    // older server or offline: the Codex still shows what ships with the site
    return { canEdit: false, pages: [] };
  }
}

const post = (path, body) => pb.send(path, { method: "POST", body });

export const savePage = (key, body) => post(`/api/orbat/codex/pages/${encodeURIComponent(key)}`, body);
export const createPage = (body) => post("/api/orbat/codex/pages", body);
export const deletePage = (key) => post(`/api/orbat/codex/pages/${encodeURIComponent(key)}/delete`, {});
export const pageHistory = (key) => pb.send(`/api/orbat/codex/pages/${encodeURIComponent(key)}/history`, { method: "GET" });
export const deletedPages = () => pb.send("/api/orbat/codex/deleted", { method: "GET" });
export const restoreVersion = (id) => post(`/api/orbat/codex/history/${encodeURIComponent(id)}/restore`, {});
export const reorderPages = (order) => post("/api/orbat/codex/order", { order });

export async function uploadImage(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Pictures can be up to 10 MB.");
  const fd = new FormData();
  fd.append("file", file);
  const r = await pb.send("/api/orbat/codex/upload", { method: "POST", body: fd });
  return r.url;
}
