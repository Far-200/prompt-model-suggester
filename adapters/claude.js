// adapters/claude.js
// Detects prompt input, selected model, adaptive thinking, and attachments on claude.ai

const ClaudeAdapter = {
  provider: "claude",

  matches() {
    return location.hostname.includes("claude.ai");
  },

  getPromptInput() {
    return (
      document.querySelector('div[contenteditable="true"][data-placeholder]') ||
      document.querySelector('div[contenteditable="true"].ProseMirror') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea[placeholder]")
    );
  },

  getPromptText(inputEl) {
    if (!inputEl) return "";
    if (inputEl.tagName === "TEXTAREA") return inputEl.value;
    return inputEl.innerText || inputEl.textContent || "";
  },

  getSelectedModel() {
    const selectors = [
      'button[data-testid*="model"]',
      'button[aria-label*="model"]',
      'button[aria-label*="Model"]',
      '[data-testid="model-selector-dropdown"] button',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const key = detectModelFromText(el.innerText || el.textContent, "claude");
        if (key) return key;
      }
    }

    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
      const text = btn.innerText || btn.textContent || "";
      if (text.length < 60 && /\b(opus|sonnet|haiku)\b/i.test(text)) {
        const key = detectModelFromText(text, "claude");
        if (key) return key;
      }
    }

    const spans = document.querySelectorAll("span, p, div");
    for (const el of spans) {
      if (el.children.length > 0) continue;
      const text = el.textContent || "";
      if (text.length < 50 && /\b(opus|sonnet|haiku)\s+\d/i.test(text)) {
        const key = detectModelFromText(text, "claude");
        if (key) return key;
      }
    }

    return null;
  },

  getAdaptiveThinking() {
    const toggleSelectors = [
      'button[role="switch"][aria-label*="daptive"]',
      'button[role="switch"][aria-label*="hinking"]',
      'input[type="checkbox"][aria-label*="daptive"]',
    ];

    for (const sel of toggleSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        return el.getAttribute("aria-checked") === "true" || el.checked === true;
      }
    }

    const allEls = document.querySelectorAll("button[role='switch'], input[type='checkbox']");
    for (const el of allEls) {
      const parent = el.closest("div, li, label");
      if (parent && /adaptive.{0,20}thinking/i.test(parent.textContent)) {
        return el.getAttribute("aria-checked") === "true" || el.checked === true;
      }
    }

    return false;
  },

  /**
   * Detect attached files by reading visible file chip labels in the composer.
   * Never accesses file contents — reads only DOM text/aria labels.
   * Returns: { hasAttachment, count, types, names }
   */
  getAttachments() {
    // Claude renders uploaded files as chip elements above the input.
    // We look for the composer container first, then scan chip-like elements.
    const chipSelectors = [
      // Data-testid chips (most specific)
      '[data-testid*="file-chip"]',
      '[data-testid*="attachment"]',
      '[data-testid*="uploaded-file"]',
      // Aria-label patterns Claude uses on file pills
      '[aria-label*="Remove"][aria-label*="."]', // "Remove report.pdf" style
      // Generic: small divs/spans inside the composer area with a filename pattern
    ];

    const found = new Set();

    for (const sel of chipSelectors) {
      document.querySelectorAll(sel).forEach(chip => {
        const text = (chip.getAttribute("aria-label") || chip.textContent || "").trim();
        if (text) found.add(text);
      });
    }

    // Broader fallback: scan the composer wrapper for anything that looks like
    // a filename (contains a dot followed by a known extension).
    // Limit scope to the form/composer area to avoid false positives in chat history.
    const composerArea =
      document.querySelector("form") ||
      document.querySelector('[data-testid*="composer"]') ||
      document.querySelector('[role="textbox"]')?.closest("div[class]");

    if (composerArea) {
      composerArea.querySelectorAll("span, div, button, p").forEach(node => {
        if (node.children.length > 0) return; // leaf nodes only
        const text = (node.textContent || "").trim();
        // Heuristic: short text that looks like a filename (has extension)
        if (text.length > 0 && text.length < 120 && /\.\w{2,5}$/.test(text)) {
          found.add(text);
        }
      });
    }

    return buildAttachmentContext([...found]);
  },

  getAnchorElement() {
    return (
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  }
};
