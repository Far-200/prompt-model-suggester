// content/main.js
// Orchestrates adapter detection, prompt reading, and widget updates

(function () {
  "use strict";

  // ── Detect which adapter to use ──────────────────────────────────────
  const ADAPTERS = [ClaudeAdapter, ChatGPTAdapter, GeminiAdapter];
  const adapter  = ADAPTERS.find(a => a.matches());

  if (!adapter) return; // not on a supported site

  // ── State ─────────────────────────────────────────────────────────────
  let lastPromptText = "";
  let widgetBuilt    = false;
  let inputEl        = null;

  // ── Boot ──────────────────────────────────────────────────────────────
  function boot() {
    inputEl = adapter.getPromptInput();
    if (!inputEl) return; // wait for MutationObserver

    if (!widgetBuilt) {
      PromptRouterWidget.build(adapter.provider);
      widgetBuilt = true;
    }

    attachListeners(inputEl);
  }

  // ── Listeners ─────────────────────────────────────────────────────────
  function attachListeners(el) {
    const debouncedAnalyze = debounce(analyzeAndUpdate, 350);

    el.addEventListener("input",   debouncedAnalyze);
    el.addEventListener("keyup",   debouncedAnalyze);
    el.addEventListener("paste",   debouncedAnalyze);

    // Also re-analyse periodically for model switch detection
    setInterval(() => {
      const currentText = adapter.getPromptText(el);
      if (currentText !== lastPromptText) {
        lastPromptText = currentText;
        analyzeAndUpdate();
      } else {
        // Check model switch even if prompt hasn't changed
        analyzeAndUpdate();
      }
    }, 1500);
  }

  function analyzeAndUpdate() {
    if (!inputEl) return;

    const promptText  = adapter.getPromptText(inputEl);
    const adaptiveOn  = adapter.getAdaptiveThinking();
    const selectedKey = adapter.getSelectedModel();

    // Hide widget for empty prompt
    if (!promptText || promptText.trim().length < 3) {
      PromptRouterWidget.hide();
      return;
    }

    PromptRouterWidget.show();

    const classification = classifyPrompt(promptText, adaptiveOn, {
      strictMode: PromptRouterWidget.getStrictMode(),
    });

    PromptRouterWidget.update({
      classification,
      selectedModelKey: selectedKey,
      provider: adapter.provider,
      adaptiveOn
    });
  }

  // ── MutationObserver — wait for input to appear ────────────────────────
  const observer = new MutationObserver(() => {
    if (!inputEl || !document.body.contains(inputEl)) {
      inputEl = adapter.getPromptInput();
      if (inputEl) {
        if (!widgetBuilt) {
          PromptRouterWidget.build(adapter.provider);
          widgetBuilt = true;
        }
        attachListeners(inputEl);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ── Initial boot (DOM may already be ready) ───────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    // Retry a few times in case the SPA hasn't rendered the input yet
    boot();
    setTimeout(boot, 800);
    setTimeout(boot, 2000);
    setTimeout(boot, 4000);
  }
})();
