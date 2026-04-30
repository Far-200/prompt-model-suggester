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

### 2. Attachment Detection
- Scans visible file chip labels (aria-labels, textContent) in the composer area
- Detects: images, documents (PDF/DOCX/TXT), presentations, spreadsheets, archives/code bundles
- Adjusts the tier recommendation based on attachment type and prompt intent
- **Never reads file contents.** No `FileReader`, no blob URL access, no file inspection

### 3. Model Detection from UI
- Scans visible button text and DOM nodes for known model name patterns
- Works across minor UI changes since it uses text matching, not brittle CSS selectors
- Detects: Opus 4.7, Sonnet 4.6, Haiku 4.5, GPT-4o, o1, o3, Gemini Flash, etc.

### 4. Real-Time Classification
- Rule-based engine (`analyzer/classifier.js`) — ~20 weighted rules
- Signals: prompt length, code blocks, keywords (debug/explain/architect/grammar), intent patterns
- Attachment tier rules: image/doc → Balanced minimum; archive/zip → Premium; 3+ files → Premium
- Confidence = winning tier score / total score across tiers
- Adaptive Thinking detected on Claude → bumps recommendation tier up

### 5. Widget UI
- Floating card (bottom-right, draggable by header) with:
  - 🧠 Recommended model
  - 📊 Confidence bar
  - ⚡ Reason for recommendation
  - 📎 Attachment hint (shown when files detected, with privacy note)
  - ⚠️ Overkill warning (if selected model > recommended tier)
  - Override selector to manually lock a model tier
  - Strict mode toggle
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
│   └── models.js           # Model definitions, tiers, provider mappings
├── utils/
│   ├── debounce.js         # Debounce utility
│   ├── normalizer.js       # Prompt pre-processing / spell correction
│   └── attachments.js      # Shared attachment detection utility
├── analyzer/
│   └── classifier.js       # Rule-based prompt classifier
├── adapters/
│   ├── claude.js           # DOM adapter for claude.ai
│   ├── chatgpt.js          # DOM adapter for chatgpt.com
│   └── gemini.js           # DOM adapter for gemini.google.com
├── content/
│   ├── main.js             # Orchestrator — boots adapter, runs analysis loop
│   ├── widget.js           # Floating recommendation widget (inject + update)
│   └── widget.css          # Widget styles
└── popup/
    └── popup.html          # Extension popup (click the toolbar icon)
```

---

## 🔒 Privacy

**PromptRouter is fully local. Nothing leaves your browser.**

| What it does | What it does NOT do |
|---|---|
| ✅ Analyzes prompt text locally, in-memory | ❌ Send prompt text to any server |
| ✅ Detects attachments by visible filename/type only | ❌ Read file contents |
| ✅ Reads model selector text from the page DOM | ❌ Use FileReader or open blob URLs |
| ✅ Stores only UI preferences (strict mode, widget position) via `chrome.storage.local` | ❌ Track, log, or store prompt text |
| ✅ Uses only required host permissions for supported AI sites | ❌ Use analytics, telemetry, or remote scripts |
| ✅ No backend, no external requests, no fonts CDN | ❌ Request `<all_urls>` or broad permissions |

### Host Permission Justification (Chrome Web Store)

PromptRouter requests access only to the four supported AI chat sites:

- `https://claude.ai/*`
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://gemini.google.com/*`

These permissions are required exclusively to:
1. **Detect the prompt input box** — read typed text from `contenteditable` divs and textareas
2. **Read the selected model name** — scan visible button/span text for known model names
3. **Detect file attachment chips** — read visible chip labels (aria-label, textContent) to know if files are present
4. **Inject the recommendation widget** — insert the floating UI card into the page

No other sites are accessed. No data is transmitted.

---

## ⚠️ Limitations

- **DOM changes**: Claude/ChatGPT/Gemini update their UI frequently. Attachment chip selectors may need updating after major UI redesigns. The extension degrades safely — it just won't detect attachments, but still recommends based on prompt text.
- **Attachment detection accuracy**: Detection reads only visible chip text. If a platform renders chips without readable text or aria-labels, the fallback heuristic (filename pattern matching in the composer area) is used.
- **Model detection**: Reading model names from the DOM is inherently fragile. The extension uses broad text matching to be resilient.
- **Classification accuracy**: The classifier is rule-based and heuristic. Complex prompts that don't match any rules default to Balanced. It's a hint, not a guarantee.
- **No API calls**: Everything is local. The classifier can't "understand" nuanced intent — it pattern-matches.

---

## 💡 Tips

- **File + short prompt**: Attach a PDF and type "summarize" — the widget will auto-upgrade to Balanced or Premium
- **Archive/ZIP**: Any `.zip`, `.tar`, `.gz` attachment → Premium is recommended automatically
- **Override mode**: Use the dropdown in the widget to lock a model tier if you know what you need
- **Strict mode**: Toggle to prevent the extension from recommending Premium unless there's a very strong signal
- **Adaptive Thinking**: If you toggle Adaptive Thinking on Claude, the widget bumps its recommendation tier and shows the purple "Adaptive" badge
- **Minimise**: Click `−` to collapse to a small pill — it stays out of your way
