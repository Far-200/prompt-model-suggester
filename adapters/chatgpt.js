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
    // ChatGPT shows model name in a dropdown button at top
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
    // Broad scan
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
    return false; // ChatGPT doesn't have an equivalent toggle
  },

  getAnchorElement() {
    return document.querySelector("#prompt-textarea") || document.querySelector('div[contenteditable="true"]');
  }
};
