// content/main.js
// Orchestrates adapter detection, prompt reading, and widget updates

(function () {
  "use strict";

  // ── Detect which adapter to use ──────────────────────────────────────
  const ADAPTERS = [ClaudeAdapter, ChatGPTAdapter, GeminiAdapter];
  const adapter  = ADAPTERS.find(a => a?.matches?.());

  if (!adapter) return; // not on a supported site

  // ── State ─────────────────────────────────────────────────────────────
  let lastPromptText  = "";
  let widgetBuilt     = false;
  let inputEl         = null;
  let listenersActive = false; // prevent duplicate listener attachment

  // ── Boot ──────────────────────────────────────────────────────────────
  function boot() {
    inputEl = adapter.getPromptInput?.() ?? null;
    if (!inputEl) return; // wait for MutationObserver

    if (!widgetBuilt) {
      PromptRouterWidget.build(adapter.provider);
      widgetBuilt = true;
    }

    if (!listenersActive) {
      attachListeners(inputEl);
      listenersActive = true;
    }
  }

  // ── Listeners ─────────────────────────────────────────────────────────
  function attachListeners(el) {
    const debouncedAnalyze = debounce(analyzeAndUpdate, 350);

    el.addEventListener("input", debouncedAnalyze);
    el.addEventListener("keyup", debouncedAnalyze);
    el.addEventListener("paste", debouncedAnalyze);

    // Periodic check for model switch or external text changes
    setInterval(() => {
      const currentText = adapter.getPromptText?.(el) ?? "";
      if (currentText !== lastPromptText) {
        lastPromptText = currentText;
        analyzeAndUpdate();
      } else {
        // Re-evaluate even if text unchanged (model may have switched)
        analyzeAndUpdate();
      }
    }, 1500);
  }

  function analyzeAndUpdate() {
    if (!inputEl) return;

    const promptText  = adapter.getPromptText?.(inputEl) ?? "";
    const adaptiveOn  = adapter.getAdaptiveThinking?.() ?? false;
    const selectedKey = adapter.getSelectedModel?.() ?? null;

    // Hide widget for empty/trivial prompt
    if (!promptText || promptText.trim().length < 3) {
      PromptRouterWidget.hide();
      return;
    }

    PromptRouterWidget.show();

    const classification = classifyPrompt(promptText, adaptiveOn, {
      // Safe fallback if getStrictMode is somehow unavailable
      strictMode: PromptRouterWidget.getStrictMode?.() || false,
    });

    PromptRouterWidget.update({
      classification,
      selectedModelKey: selectedKey,
      provider: adapter.provider,
      adaptiveOn
    });
  }

  // ── MutationObserver — wait for input to appear / handle SPA navigation ──
  const observer = new MutationObserver(() => {
    if (!inputEl || !document.body.contains(inputEl)) {
      // Input was removed (e.g. new conversation started) — reset and re-attach
      listenersActive = false;
      inputEl = adapter.getPromptInput?.() ?? null;
      if (inputEl) {
        if (!widgetBuilt) {
          PromptRouterWidget.build(adapter.provider);
          widgetBuilt = true;
        }
        if (!listenersActive) {
          attachListeners(inputEl);
          listenersActive = true;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ── Initial boot (DOM may already be ready) ───────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    // Retry a few times for SPAs that render after document_idle
    boot();
    setTimeout(boot, 800);
    setTimeout(boot, 2000);
    setTimeout(boot, 4000);
  }
})();
