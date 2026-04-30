// content/widget.js
// Injects and manages the floating PromptRouter recommendation widget

const PromptRouterWidget = (() => {
  let widgetEl    = null;
  let pillEl      = null;
  let isMinimised = false;
  let userOverride = null; // model key or null

  // ── Strict mode — persisted in chrome.storage.local only (no localStorage fallback) ──
  let strictModeOn = false;

  function loadStrictMode() {
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.local) {
        chrome.storage.local.get("pr_strict_mode", (res) => {
          strictModeOn = !!res?.pr_strict_mode;
          const toggle = document.getElementById("pr-strict-toggle");
          if (toggle) toggle.checked = strictModeOn;
        });
      }
      // No localStorage fallback — strict mode state is non-critical;
      // defaulting to OFF on first load is acceptable and avoids touching
      // the page's own localStorage namespace.
    } catch (_) {}
  }

  function saveStrictMode(val) {
    strictModeOn = !!val;
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.local) {
        chrome.storage.local.set({ pr_strict_mode: strictModeOn });
      }
    } catch (_) {}
  }

  // ── Safe element factory (no innerHTML for user-influenced data) ────────
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") node.className = v;
      else if (k === "id")   node.id = v;
      else if (k === "style") node.style.cssText = v;
      else if (k === "title") node.title = v;
      else if (k === "type")  node.type = v;
      else if (k === "for")   node.htmlFor = v;
      else if (k === "value") node.value = v;
      else                    node.setAttribute(k, v);
    }
    for (const child of children) {
      if (typeof child === "string") node.appendChild(document.createTextNode(child));
      else if (child instanceof Node) node.appendChild(child);
    }
    return node;
  }

  // ── Build DOM (all via safe createElement — no innerHTML for dynamic data) ─

  function build(provider) {
    // ── Header ───────────────────────────────────────────────────────────
    const logoSpan    = el("span", {}, ["⚡"]);
    const adaptBadge  = el("span", { id: "pr-adaptive-badge" }, ["Adaptive"]);
    const logoDiv     = el("div",  { id: "pr-logo" }, [logoSpan, " PromptRouter ", adaptBadge]);
    const closeBtn    = el("button", { id: "pr-close", title: "Minimise" }, ["−"]);
    const headerDiv   = el("div",  { id: "pr-header" }, [logoDiv, closeBtn]);

    // ── Rec row ──────────────────────────────────────────────────────────
    const recLabel   = el("span",   { id: "pr-rec-label" }, ["Recommended"]);
    const recModel   = el("span",   { id: "pr-rec-model" }, ["—"]);
    const recTooltip = el("span",   { id: "pr-rec-tooltip", className: "pr-tooltip",
      title: "Recommendation based on prompt complexity and intent signals" }, ["?"]);
    const recRow     = el("div",    { id: "pr-rec-row" }, [recLabel, recModel, recTooltip]);

    // ── Confidence bar ───────────────────────────────────────────────────
    const confFill  = el("div",  { id: "pr-conf-bar-fill" });
    const confBg    = el("div",  { id: "pr-conf-bar-bg" }, [confFill]);
    const confPct   = el("span", { id: "pr-conf-pct" }, ["—"]);
    const confRow   = el("div",  { id: "pr-conf-row" }, [confBg, confPct]);

    // ── Reasons ──────────────────────────────────────────────────────────
    const reason1 = el("div", { id: "pr-reason-1", className: "pr-reason-tag" }, ["Waiting for input…"]);
    const reason2 = el("div", { id: "pr-reason-2", className: "pr-reason-tag pr-reason-secondary",
      style: "display:none" });
    const reasons = el("div", { id: "pr-reasons" }, [reason1, reason2]);

    // ── Tech hint ────────────────────────────────────────────────────────
    const techHint = el("div", { id: "pr-tech-hint" }, ["💡 Consider upgrading if results feel too shallow"]);

    // ── Overkill ─────────────────────────────────────────────────────────
    const overkillStrong = el("strong", {}, ["⚠️ Overkill detected"]);
    const overkillText   = el("span",   { id: "pr-overkill-text" });
    const overkill       = el("div",    { id: "pr-overkill" }, [overkillStrong, " ", overkillText]);

    // ── Suggestion ───────────────────────────────────────────────────────
    const suggText = el("span", { id: "pr-suggestion-text" });
    const suggestion = el("div", { id: "pr-suggestion" }, [suggText]);

    // ── Override select (model keys/labels come from static MODELS config) ─
    const overrideLabel  = el("span",   { id: "pr-override-label" }, ["Override"]);
    const overrideSelect = el("select", { id: "pr-override-select" });
    overrideSelect.appendChild(el("option", { value: "" }, ["— auto —"]));

    Object.entries(MODELS)
      .filter(([, m]) => m.provider === provider)
      .forEach(([key, m]) => {
        // Both key and label are from our own static config — safe to use as
        // option value / textContent (never from user input or the page DOM).
        const opt = el("option", { value: key }, [m.label]);
        overrideSelect.appendChild(opt);
      });

    const overrideSection = el("div", { id: "pr-override-section" }, [overrideLabel, overrideSelect]);

    // ── Strict mode toggle ────────────────────────────────────────────────
    const strictToggle  = el("input", { id: "pr-strict-toggle", type: "checkbox" });
    const strictLabel   = el("label", { id: "pr-strict-label", "for": "pr-strict-toggle" },
      [strictToggle, " Strict mode"]);
    const strictSection = el("div", { id: "pr-strict-section" }, [strictLabel]);

    // ── Attachment hint ───────────────────────────────────────────────────
    // Non-intrusive notice shown only when an attachment was detected.
    const attachLine1 = el("span", { id: "pr-attach-line1" }, ["Attachment detected — recommendation adjusted."]);
    const attachLine2 = el("span", { id: "pr-attach-line2" }, ["File contents are not read."]);
    const attachHint  = el("div",  { id: "pr-attach-hint"  }, [attachLine1, attachLine2]);

    // ── Body ─────────────────────────────────────────────────────────────
    const body = el("div", { id: "pr-body" }, [
      recRow, confRow, reasons, techHint, attachHint, overkill, suggestion,
      overrideSection, strictSection
    ]);

    // ── Card ─────────────────────────────────────────────────────────────
    const card = el("div", { id: "pr-card", className: "pr-tier-balanced" }, [headerDiv, body]);

    // ── Widget root ───────────────────────────────────────────────────────
    widgetEl = el("div", { id: "pr-widget", className: "pr-visible" }, [card]);
    document.body.appendChild(widgetEl);

    // ── Pill ─────────────────────────────────────────────────────────────
    pillEl = document.createElement("button");
    pillEl.id = "pr-toggle-pill";
    pillEl.textContent = "⚡ PR"; // textContent is safe; no HTML interpretation
    document.body.appendChild(pillEl);

    // ── Events ────────────────────────────────────────────────────────────
    closeBtn.addEventListener("click", minimise);
    pillEl.addEventListener("click", restore);
    overrideSelect.addEventListener("change", (e) => {
      userOverride = e.target.value || null;
    });
    strictToggle.addEventListener("change", (e) => {
      saveStrictMode(e.target.checked);
    });

    // ── Draggable header ─────────────────────────────────────────────────
    initDrag(headerDiv, widgetEl);

    // ── Restore persisted position ────────────────────────────────────────
    restorePosition();

    // ── Load persisted strict mode ────────────────────────────────────────
    loadStrictMode();
  }

  // ── Drag logic ─────────────────────────────────────────────────────────

  function initDrag(handle, target) {
    let dragging = false;
    let startX, startY, origLeft, origTop;

    handle.style.cursor = "grab";

    handle.addEventListener("mousedown", (e) => {
      // Only primary button; ignore clicks on child buttons (close btn)
      if (e.button !== 0 || e.target.tagName === "BUTTON") return;

      dragging = true;
      const rect = target.getBoundingClientRect();
      startX  = e.clientX;
      startY  = e.clientY;
      origLeft = rect.left;
      origTop  = rect.top;

      handle.style.cursor = "grabbing";
      document.body.style.userSelect = "none"; // prevent text selection while dragging
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const W = target.offsetWidth;
      const H = target.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Clamp within viewport
      const newLeft = Math.min(Math.max(origLeft + dx, 0), vw - W);
      const newTop  = Math.min(Math.max(origTop  + dy, 0), vh - H);

      target.style.left   = newLeft + "px";
      target.style.top    = newTop  + "px";
      target.style.right  = "auto";
      target.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = "grab";
      document.body.style.userSelect = "";
      savePosition();
    });
  }

  function savePosition() {
    try {
      if (!widgetEl) return;
      const pos = { left: widgetEl.style.left, top: widgetEl.style.top };
      if (typeof chrome !== "undefined" && chrome?.storage?.local) {
        chrome.storage.local.set({ pr_widget_pos: pos });
      }
    } catch (_) {}
  }

  function restorePosition() {
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.local) {
        chrome.storage.local.get("pr_widget_pos", (res) => {
          const pos = res?.pr_widget_pos;
          if (pos?.left && pos?.top && widgetEl) {
            widgetEl.style.left   = pos.left;
            widgetEl.style.top    = pos.top;
            widgetEl.style.right  = "auto";
            widgetEl.style.bottom = "auto";
          }
        });
      }
    } catch (_) {}
  }

  // ── Minimise / restore ─────────────────────────────────────────────────

  function minimise() {
    isMinimised = true;
    widgetEl?.classList.remove("pr-visible");
    widgetEl?.classList.add("pr-hidden");
    pillEl?.classList.add("pr-pill-visible");
  }

  function restore() {
    isMinimised = false;
    widgetEl?.classList.remove("pr-hidden");
    widgetEl?.classList.add("pr-visible");
    pillEl?.classList.remove("pr-pill-visible");
  }

  // ── Update ─────────────────────────────────────────────────────────────

  function update({ classification, selectedModelKey, provider, adaptiveOn, attachmentContext }) {
    if (!widgetEl || isMinimised) return;

    const overrideKey    = userOverride;
    const effectiveTier  = overrideKey ? MODELS[overrideKey]?.tier : classification?.tier;
    const recommendation = PROVIDER_RECOMMENDATIONS[provider]?.[effectiveTier];
    if (!recommendation) return;

    // Tier colour class
    const card = document.getElementById("pr-card");
    if (!card) return;
    card.classList.remove("pr-tier-light", "pr-tier-balanced", "pr-tier-premium");
    const tierClass = {
      [MODEL_TIERS.LIGHTWEIGHT]: "pr-tier-light",
      [MODEL_TIERS.BALANCED]:    "pr-tier-balanced",
      [MODEL_TIERS.PREMIUM]:     "pr-tier-premium"
    }[effectiveTier];
    if (tierClass) card.classList.add(tierClass);

    // Model label — textContent only, never innerHTML
    const recModelEl = document.getElementById("pr-rec-model");
    if (recModelEl) recModelEl.textContent = recommendation.label;

    // Confidence bar
    const confFill = document.getElementById("pr-conf-bar-fill");
    const confPct  = document.getElementById("pr-conf-pct");
    const conf     = classification?.confidence ?? 0;
    if (confFill) confFill.style.width = conf + "%";
    if (confPct)  confPct.textContent  = conf + "%";

    // Reasons
    const r1 = document.getElementById("pr-reason-1");
    const r2 = document.getElementById("pr-reason-2");
    const reasons = classification?.reasons?.length
      ? classification.reasons
      : [classification?.reason];

    if (r1) r1.textContent = reasons[0] || "—";
    if (r2) {
      if (reasons[1]) {
        r2.textContent  = reasons[1];
        r2.style.display = "block";
      } else {
        r2.style.display = "none";
      }
    }

    // Adaptive badge
    const badge = document.getElementById("pr-adaptive-badge");
    badge?.classList.toggle("pr-show", !!adaptiveOn);

    // Tech hint
    const techHintEl = document.getElementById("pr-tech-hint");
    if (techHintEl) {
      if (classification?.hasTechHint && !overrideKey) techHintEl.classList.add("pr-show");
      else techHintEl.classList.remove("pr-show");
    }

    // Attachment hint — shown when any file was detected in the composer.
    // Line 1 stays generic (no filenames in UI — avoids any accidental PII display).
    // Line 2 is the privacy reassurance.
    const attachHintEl = document.getElementById("pr-attach-hint");
    if (attachHintEl) {
      const ac = attachmentContext;
      if (ac && ac.hasAttachment) {
        attachHintEl.classList.add("pr-show");
      } else {
        attachHintEl.classList.remove("pr-show");
      }
    }

    // Overkill detection
    const overkillEl   = document.getElementById("pr-overkill");
    const overkillText = document.getElementById("pr-overkill-text");

    if (overkillEl && overkillText) {
      if (selectedModelKey && !overrideKey) {
        const selectedTier  = MODELS[selectedModelKey]?.tier ?? 0;
        const selectedLabel = MODELS[selectedModelKey]?.label ?? "unknown";

        if (selectedTier > effectiveTier) {
          // textContent — never innerHTML; these strings come from our own config
          overkillText.textContent =
            `You're using ${selectedLabel} — ${recommendation.label} is enough. Save your limit!`;
          overkillEl.classList.add("pr-show");
        } else {
          overkillEl.classList.remove("pr-show");
        }
      } else {
        overkillEl.classList.remove("pr-show");
      }
    }

    // Spelling suggestions — textContent only
    const suggEl   = document.getElementById("pr-suggestion");
    const suggText = document.getElementById("pr-suggestion-text");
    const suggs    = classification?.suggestions;

    if (suggEl && suggText) {
      if (suggs?.length > 0) {
        // suggs[0].suggestion is classifier output, not raw user input — safe as textContent
        suggText.textContent = `Did you mean "${suggs[0].suggestion}"?`;
        suggEl.classList.add("pr-show");
      } else {
        suggEl.classList.remove("pr-show");
      }
    }
  }

  function show() {
    if (widgetEl && !isMinimised) {
      widgetEl.classList.add("pr-visible");
      widgetEl.classList.remove("pr-hidden");
    }
  }

  function hide() {
    if (widgetEl) {
      widgetEl.classList.add("pr-hidden");
      widgetEl.classList.remove("pr-visible");
    }
    pillEl?.classList.remove("pr-pill-visible");
  }

  function getStrictMode() { return strictModeOn; }

  return { build, update, show, hide, getStrictMode };
})();
