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
    // Broad scan
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

  getAnchorElement() {
    return document.querySelector('div[contenteditable="true"]') || document.querySelector("textarea");
  }
};
