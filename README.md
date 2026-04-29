# ⚡ PromptRouter — Chrome Extension

> Stop burning Opus on grammar fixes. Real-time model recommendation for Claude, ChatGPT, and Gemini.

---

## 🚀 Installation (No build step needed!)

This extension is pure vanilla JS — no npm, no webpack.

### Steps

1. **Download / clone** this folder (`prompt-router/`)
2. Open Chrome and go to: `chrome://extensions`
3. Enable **Developer mode** (toggle, top-right)
4. Click **"Load unpacked"**
5. Select the `prompt-router/` folder
6. Done — visit [claude.ai](https://claude.ai), [chatgpt.com](https://chatgpt.com), or [gemini.google.com](https://gemini.google.com) and start typing!

---

## 🧠 How It Works

### 1. Prompt Detection
- Uses `MutationObserver` to detect when the chat input appears (SPAs load dynamically)
- Attaches `input`/`keyup`/`paste` listeners to the textarea/contenteditable div
- Reads prompt text every 350ms (debounced) while typing

### 2. Model Detection from UI
- Scans visible button text and DOM nodes for known model name patterns
- Works across minor UI changes since it uses text matching, not brittle CSS selectors
- Detects: Opus 4.7, Sonnet 4.6, Haiku 4.5, GPT-4o, o1, o3, Gemini Flash, etc.

### 3. Real-Time Classification
- Rule-based engine (`analyzer/classifier.js`) — ~20 weighted rules
- Signals: prompt length, code blocks, keywords (debug/explain/architect/grammar), intent patterns
- Confidence = winning tier score / total score across tiers
- Adaptive Thinking detected on Claude → bumps recommendation tier up

### 4. Widget UI
- Floating card (bottom-right) with:
  - 🧠 Recommended model
  - 📊 Confidence bar
  - ⚡ Reason for recommendation
  - ⚠️ Overkill warning (if selected model > recommended tier)
  - Override selector to manually lock a model tier
- Can be minimised to a small pill

---

## 📁 File Structure

```
prompt-router/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── config/
│   └── models.js          # Model definitions, tiers, provider mappings
├── utils/
│   └── debounce.js        # Debounce utility
├── analyzer/
│   └── classifier.js      # Rule-based prompt classifier
├── adapters/
│   ├── claude.js          # DOM adapter for claude.ai
│   ├── chatgpt.js         # DOM adapter for chatgpt.com
│   └── gemini.js          # DOM adapter for gemini.google.com
├── content/
│   ├── main.js            # Orchestrator — boots adapter, runs analysis loop
│   ├── widget.js          # Floating recommendation widget (inject + update)
│   └── widget.css         # Widget styles
└── popup/
    └── popup.html         # Extension popup (click the toolbar icon)
```

---

## ⚠️ Limitations

- **DOM changes**: Claude/ChatGPT/Gemini update their UI frequently. If model detection stops working after a site update, the fallback still provides accurate recommendations — just without the overkill warning.
- **Model detection**: Reading model names from the DOM is inherently fragile. The extension uses broad text matching to be resilient, but a complete redesign of the selector UI could break it.
- **Classification accuracy**: The classifier is rule-based and heuristic. Complex prompts that don't match any rules default to Balanced. It's a hint, not a guarantee.
- **No API calls**: Everything is local. This means the classifier can't "understand" nuanced intent — it pattern-matches.

---

## 🔒 Privacy

- Zero data leaves your browser
- No analytics, no telemetry, no external requests
- Classification is 100% local rule-based logic
- The popup makes no network requests

---

## 💡 Tips

- **Override mode**: Use the dropdown in the widget to lock a model tier if you know what you need
- **Adaptive Thinking**: If you toggle Adaptive Thinking on Claude, the widget will bump its recommendation tier and show the purple "Adaptive" badge
- **Minimise**: Click `−` to collapse to a small pill — it stays out of your way
