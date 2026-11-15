import { useEffect, useRef } from "react";
import { PageEditor, NewPageDialog, ArrangeDialog, draftFrom } from "./editor.jsx";
import { CODEX_PAGES } from "../pages/Codex.jsx";

// Connects the Codex page to the editing panel and dialogs.
// Loaded on demand, so readers never download the editor.
export default function EditorShell({ page, editing, setDraft, onDirty, pages, dialog, closeDialog, closeEditor, reload, openPage }) {
  const resetOnLoad = useRef(false);

  // start a fresh draft when a page is opened, and again after a save has reloaded it
  useEffect(() => {
    if (!page || !editing) return;
    if (!editing.draft || resetOnLoad.current) {
      resetOnLoad.current = false;
      setDraft(draftFrom(page));
    }
  }, [page, editing, setDraft]);

  const draft = editing && editing.draft;
  const dirty = !!(page && draft) && JSON.stringify(draft) !== JSON.stringify(draftFrom(page));
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  const defaults = page && page.kind === "builtin" ? CODEX_PAGES.find((p) => p.key === page.key) : undefined;
  const nextSort = pages.reduce((m, p) => Math.max(m, p.sort || 0), 0) + 10;

  return (
    <>
      {page && draft && (
        <PageEditor
          key={page.key}
          page={page}
          defaults={defaults && { label: defaults.label, code: defaults.code, blurb: defaults.blurb, heading: defaults.heading, intro: defaults.intro }}
          draft={draft}
          setDraft={setDraft}
          onSaved={async () => { resetOnLoad.current = true; await reload(); }}
          onClose={closeEditor}
          onDeleted={async () => { closeEditor(); await reload(); window.location.hash = "codex"; }}
        />
      )}
      {dialog === "new" && <NewPageDialog nextSort={nextSort} onClose={closeDialog} onCreated={async (p) => { await reload(); openPage(p.key); }} />}
      {dialog === "arrange" && <ArrangeDialog pages={pages} onClose={closeDialog} onDone={async () => { await reload(); closeDialog(); }} />}
    </>
  );
}
