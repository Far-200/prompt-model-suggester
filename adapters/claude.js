// adapters/claude.js
// Detects prompt input, selected model, and adaptive thinking on claude.ai

const ClaudeAdapter = {
  provider: "claude",

  /** Returns true if we're on claude.ai */
  matches() {
    return location.hostname.includes("claude.ai");
  },

  /** Find the main prompt textarea */
  getPromptInput() {
    // Claude uses a contenteditable div or textarea
    return (
      document.querySelector('div[contenteditable="true"][data-placeholder]') ||
      document.querySelector('div[contenteditable="true"].ProseMirror') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea[placeholder]")
    );
  },

  /** Extract text from the prompt input element */
  getPromptText(inputEl) {
    if (!inputEl) return "";
    if (inputEl.tagName === "TEXTAREA") return inputEl.value;
    return inputEl.innerText || inputEl.textContent || "";
  },

  /** Detect the currently selected model by reading visible UI text */
  getSelectedModel() {
    // The model selector button shows text like "Sonnet 4.6 ˅"
    // We look for buttons/spans near the bottom toolbar that contain model names
    const selectors = [
      // Bottom bar model pill button
      'button[data-testid*="model"]',
      'button[aria-label*="model"]',
      'button[aria-label*="Model"]',
      '[data-testid="model-selector-dropdown"] button',
      // Generic: any button whose text matches a known model name pattern
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const key = detectModelFromText(el.innerText || el.textContent, "claude");
        if (key) return key;
      }
    }

    // Broader fallback: scan all buttons in the page footer / toolbar area
    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
      const text = btn.innerText || btn.textContent || "";
      // Quick heuristic: button has model-like text and is reasonably short
      if (text.length < 60 && /\b(opus|sonnet|haiku)\b/i.test(text)) {
        const key = detectModelFromText(text, "claude");
        if (key) return key;
      }
    }

    // Last resort: scan page text for model selector region
    const spans = document.querySelectorAll("span, p, div");
    for (const el of spans) {
      if (el.children.length > 0) continue; // leaf nodes only
      const text = el.textContent || "";
      if (text.length < 50 && /\b(opus|sonnet|haiku)\s+\d/i.test(text)) {
        const key = detectModelFromText(text, "claude");
        if (key) return key;
      }
    }

    return null; // unknown
  },

  /** Detect if Adaptive Thinking toggle is on */
  getAdaptiveThinking() {
    // Look for a toggle that has "adaptive" or "thinking" in its accessible label
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

    // Fallback: look for toggle button near text "Adaptive thinking"
    const allEls = document.querySelectorAll("button[role='switch'], input[type='checkbox']");
    for (const el of allEls) {
      // Check sibling / parent text
      const parent = el.closest("div, li, label");
      if (parent && /adaptive.{0,20}thinking/i.test(parent.textContent)) {
        return el.getAttribute("aria-checked") === "true" || el.checked === true;
      }
    }

    return false;
  },

  /** Return the element to anchor the widget near */
  getAnchorElement() {
    return (
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  }
};
