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

    // Periodic check: model switch, external text changes, or new attachments
    setInterval(() => {
      const currentText = adapter.getPromptText?.(el) ?? "";
      if (currentText !== lastPromptText) {
        lastPromptText = currentText;
        analyzeAndUpdate();
      } else {
        // Re-evaluate even if text unchanged (model may have switched, file may have been added)
        analyzeAndUpdate();
      }
    }, 1500);
  }

  function analyzeAndUpdate() {
    if (!inputEl) return;

    const promptText  = adapter.getPromptText?.(inputEl) ?? "";
    const adaptiveOn  = adapter.getAdaptiveThinking?.() ?? false;
    const selectedKey = adapter.getSelectedModel?.() ?? null;

    // Attachment context — reads only visible chip labels in the DOM.
    // Falls back to a safe empty context if the adapter doesn't support it yet.
    const attachmentContext = adapter.getAttachments?.() ?? {
      hasAttachment: false, count: 0, types: [], names: []
    };

    // Show widget if there's a prompt OR an attachment (user may attach before typing)
    const hasContent = (promptText && promptText.trim().length >= 3) || attachmentContext.hasAttachment;

    if (!hasContent) {
      PromptRouterWidget.hide();
      return;
    }

    PromptRouterWidget.show();

    const classification = classifyPrompt(promptText, adaptiveOn, {
      strictMode: PromptRouterWidget.getStrictMode?.() || false,
      attachmentContext,
    });

    PromptRouterWidget.update({
      classification,
      selectedModelKey: selectedKey,
      provider: adapter.provider,
      adaptiveOn,
      attachmentContext,
    });
  }

  // ── MutationObserver — wait for input to appear / handle SPA navigation ──
  const observer = new MutationObserver(() => {
    if (!inputEl || !document.body.contains(inputEl)) {
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

  // ── Initial boot ──────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
    setTimeout(boot, 800);
    setTimeout(boot, 2000);
    setTimeout(boot, 4000);
  }
})();
