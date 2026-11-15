// Opening a trooper's profile from anywhere: the page shells listen for this
// and switch to the TROOPERS tab.
export function openTrooper(id) {
  window.dispatchEvent(new CustomEvent("orbat:trooper", { detail: id }));
}
export function onOpenTrooper(fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener("orbat:trooper", h);
  return () => window.removeEventListener("orbat:trooper", h);
}
