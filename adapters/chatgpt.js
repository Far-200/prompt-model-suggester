// adapters/chatgpt.js

const ChatGPTAdapter = {
  provider: "chatgpt",

  matches() {
    return location.hostname.includes("chatgpt.com") || location.hostname.includes("chat.openai.com");
  },

  getPromptInput() {
    return (
      document.querySelector("#prompt-textarea") ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea[data-id]")
    );
  },

  getPromptText(inputEl) {
    if (!inputEl) return "";
    if (inputEl.tagName === "TEXTAREA") return inputEl.value;
    return inputEl.innerText || inputEl.textContent || "";
  },

  getSelectedModel() {
    const selectors = [
      '[data-testid="model-switcher-dropdown-button"]',
      'button[aria-haspopup="menu"] span',
      '.model-switcher button',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const key = detectModelFromText(el.innerText || el.textContent, "chatgpt");
        if (key) return key;
      }
    }
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const text = btn.innerText || "";
      if (text.length < 50 && /\b(gpt|o1|o3|GPT)\b/i.test(text)) {
        const key = detectModelFromText(text, "chatgpt");
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
    // ChatGPT renders file chips in a flex row above the input inside the form.
    // Each chip typically has an aria-label or inner text with the filename.
    const chipSelectors = [
      '[data-testid*="file-attachment"]',
      '[data-testid*="attachment-item"]',
      '[data-testid*="upload"]',
      // Image tiles (vision)
      '[data-testid*="image-upload"]',
      // Generic: buttons/divs with a "Remove" accessible label that contain a filename
      'button[aria-label*="Remove"]',
      'button[aria-label*="remove"]',
      // File tiles in the composer
      '.file-attachment',
      '[class*="attachment"]',
    ];

    const found = new Set();

    for (const sel of chipSelectors) {
      document.querySelectorAll(sel).forEach(chip => {
        // Prefer aria-label (often "Remove filename.pdf")
        const ariaLabel = chip.getAttribute("aria-label") || "";
        const text      = (ariaLabel || chip.textContent || "").trim();
        if (text) found.add(text);
      });
    }

    // Fallback: scan inside #prompt-textarea's parent form for filename-like text
    const form =
      document.querySelector("#prompt-textarea")?.closest("form") ||
      document.querySelector("form");

    if (form) {
      form.querySelectorAll("span, div, p").forEach(node => {
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
    return document.querySelector("#prompt-textarea") || document.querySelector('div[contenteditable="true"]');
  }
};
