// adapters/gemini.js

const GeminiAdapter = {
  provider: "gemini",

  matches() {
    return location.hostname.includes("gemini.google.com");
  },

  getPromptInput() {
    return (
      document.querySelector("rich-textarea div[contenteditable='true']") ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  },

  getPromptText(inputEl) {
    if (!inputEl) return "";
    if (inputEl.tagName === "TEXTAREA") return inputEl.value;
    return inputEl.innerText || inputEl.textContent || "";
  },

  getSelectedModel() {
    const selectors = [
      'model-selector button',
      '[aria-label*="model"] button',
      'bard-mode-switcher button',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const key = detectModelFromText(el.innerText || el.textContent, "gemini");
        if (key) return key;
      }
    }
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const text = btn.innerText || "";
      if (text.length < 60 && /\b(gemini|flash|pro)\b/i.test(text)) {
        const key = detectModelFromText(text, "gemini");
        if (key) return key;
      }
    }
    return null;
  },

  getAdaptiveThinking() {
    return false;
  },

  /**
   * Detect attached files by reading visible file chip labels in the composer.
   * Never accesses file contents — reads only DOM text/aria labels.
   * Returns: { hasAttachment, count, types, names }
   */
  getAttachments() {
    // Gemini renders file chips in a custom element (file-upload-chip, attachment-chip, etc.)
    // inside the composer area.
    const chipSelectors = [
      "file-upload-chip",
      "attachment-chip",
      '[data-test-id*="attachment"]',
      '[data-test-id*="file"]',
      // Aria patterns
      '[aria-label*="Remove file"]',
      '[aria-label*="remove file"]',
      '[aria-label*="attachment"]',
      // Generic chips in the input area
      '.upload-chip',
      '[class*="upload-chip"]',
      '[class*="file-chip"]',
    ];

    const found = new Set();

    for (const sel of chipSelectors) {
      document.querySelectorAll(sel).forEach(chip => {
        const ariaLabel = chip.getAttribute("aria-label") || "";
        const text      = (ariaLabel || chip.textContent || "").trim();
        if (text) found.add(text);
      });
    }

    // Fallback: scan the rich-textarea parent container for filename-like text
    const composerArea =
      document.querySelector("rich-textarea") ||
      document.querySelector('[data-testid*="composer"]') ||
      document.querySelector('div[contenteditable="true"]')?.closest("div[class]");

    if (composerArea) {
      composerArea.querySelectorAll("span, div, p").forEach(node => {
        if (node.children.length > 0) return;
        const text = (node.textContent || "").trim();
        if (text.length > 0 && text.length < 120 && /\.\w{2,5}$/.test(text)) {
          found.add(text);
        }
      });
    }

    return buildAttachmentContext([...found]);
  },

  getAnchorElement() {
    return document.querySelector('div[contenteditable="true"]') || document.querySelector("textarea");
  }
};
