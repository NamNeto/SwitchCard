// --- Boot sequence (sorts last: runs after all wiring) ---
// The examples render first; the autosave restore then awaits its in-page dialogs.
// Tests (and anything else) wait for bootDone before touching the page.
let bootDone = false;
(async () => {
  try {
    applyTheme(loadThemePref());
    customSkuPresets = loadCustomSkuPresetsFromLocal();
    showOnboarding();
    renderAll();
    loadEditor();
    // No autosave write while a boot dialog is open: the stored autosave stays byte-for-byte
    // as found until the user answers. Afterwards the previous state comes back, unless the
    // restore paused autosave itself (declined/failed and the backup copy could not be written).
    const pausedBeforeBoot = autosavePaused;
    autosavePaused = true;
    let restored = null;
    try {
      restored = await restoreAutosave();
    } finally {
      autosavePaused =
        pausedBeforeBoot ||
        !!(restored && restored.status !== "restored" && restored.fromBackup === false && !restored.backedUp);
    }
    renderAll();
    loadEditor();
    if (restored && restored.status === "restored") {
      applyRestoredResult(restored, "autosave");
      // One-time legacy import: write the current key now so the old key is never needed again.
      if (restored.key !== AUTOSAVE_KEY) autosave();
    } else if (restored) {
      // Never silently discard: explain, keep a backup, and do not overwrite.
      message(
        "Browser autosave was NOT restored: " +
          String(restored.reason).replace(/\.+$/, "") +
          ". " +
          (restored.backedUp
            ? "A copy was kept as an autosave backup (Save your work → Browser autosave → Restore / Download autosave backup)."
            : "The backup copy could not be written, so autosave is paused to avoid overwriting it — use Save project, or Clear browser autosave to resume.") +
          " Showing the example recipes.",
      );
      if (autosavePaused) setAutosaveHint("paused");
    }
    refreshBackupButtons();
  } finally {
    bootDone = true;
  }
})();
