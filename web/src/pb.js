import PocketBase from "pocketbase";

// The site is served by PocketBase itself (or proxied to it by `npm run dev`),
// so the API always lives on the same address as the page.
export const pb = new PocketBase(window.location.origin);
pb.autoCancellation(false);

// When the server ends a session (IP changed, roles removed, password reset),
// every later request comes back 401. Clear the stored login and tell the app.
const listeners = new Set();
export function onSessionEnded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

pb.afterSend = function (response, data) {
  const isAuthCall = response.url.includes("/auth-with-") || response.url.includes("/auth-methods");
  if (response.status === 401 && pb.authStore.isValid && !isAuthCall) {
    const message = (data && data.message) || "Please sign in again.";
    pb.authStore.clear();
    listeners.forEach((fn) => fn(message));
  }
  return data;
};

export function errorMessage(err, fallback = "Something went wrong. Try again.") {
  if (!err) return fallback;
  if (err.status === 0) return "Can't reach the server. Is PocketBase running?";
  if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
  const fieldErrors = err.response && err.response.data;
  if (fieldErrors && typeof fieldErrors === "object") {
    const first = Object.values(fieldErrors).find((v) => v && v.message && v.code !== "validation_invalid_value");
    if (first) return first.message;
  }
  return (err.response && err.response.message) || err.message || fallback;
}

export async function fetchMe() {
  return pb.send("/api/orbat/me", { method: "GET" });
}
