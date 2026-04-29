// content/widget.js
// Injects and manages the floating PromptRouter recommendation widget

const PromptRouterWidget = (() => {
  let widgetEl = null;
  let pillEl = null;
  let isMinimised = false;
  let userOverride = null; // model key or null

  // ── Build DOM ──────────────────────────────────────────────────────────

  function build(provider) {
    // Build override options from provider models
    const providerModels = Object.entries(MODELS)
      .filter(([, m]) => m.provider === provider)
      .map(([key, m]) => `<option value="${key}">${m.label}</option>`)
      .join("");

    const html = `
      <div id="pr-card" class="pr-tier-balanced">
        <div id="pr-header">
          <div id="pr-logo">
            <span>⚡</span> PromptRouter
            <span id="pr-adaptive-badge">Adaptive</span>
          </div>
          <button id="pr-close" title="Minimise">−</button>
        </div>
        <div id="pr-body">
          <div id="pr-rec-row">
            <span id="pr-rec-label">Recommended</span>
            <span id="pr-rec-model">—</span>
          </div>
          <div id="pr-conf-row">
            <div id="pr-conf-bar-bg">
              <div id="pr-conf-bar-fill"></div>
            </div>
            <span id="pr-conf-pct">—</span>
          </div>
          <div id="pr-reasons">
            <div id="pr-reason-1" class="pr-reason-tag">Waiting for input…</div>
            <div id="pr-reason-2" class="pr-reason-tag pr-reason-secondary" style="display:none"></div>
          </div>
          <div id="pr-overkill">
            <strong>⚠️ Overkill detected</strong>
            <span id="pr-overkill-text"></span>
          </div>
          <div id="pr-suggestion">
            <span id="pr-suggestion-text"></span>
          </div>
          <div id="pr-override-section">
            <span id="pr-override-label">Override</span>
            <select id="pr-override-select">
              <option value="">— auto —</option>
              ${providerModels}
            </select>
          </div>
        </div>
      </div>
    `;

    widgetEl = document.createElement("div");
    widgetEl.id = "pr-widget";
    widgetEl.className = "pr-visible";
    widgetEl.innerHTML = html;
    document.body.appendChild(widgetEl);

    // Minimise pill
    pillEl = document.createElement("button");
    pillEl.id = "pr-toggle-pill";
    pillEl.innerHTML = "⚡ PR";
    document.body.appendChild(pillEl);

    // Events
    document.getElementById("pr-close").addEventListener("click", minimise);
    pillEl.addEventListener("click", restore);
    document
      .getElementById("pr-override-select")
      .addEventListener("change", (e) => {
        userOverride = e.target.value || null;
      });
  }

  function minimise() {
    isMinimised = true;
    widgetEl.classList.remove("pr-visible");
    widgetEl.classList.add("pr-hidden");
    pillEl.classList.add("pr-pill-visible");
  }

  function restore() {
    isMinimised = false;
    widgetEl.classList.remove("pr-hidden");
    widgetEl.classList.add("pr-visible");
    pillEl.classList.remove("pr-pill-visible");
  }

  // ── Update ─────────────────────────────────────────────────────────────

  function update({ classification, selectedModelKey, provider, adaptiveOn }) {
    if (!widgetEl || isMinimised) return;

    const overrideKey = userOverride;
    const effectiveTier = overrideKey
      ? MODELS[overrideKey]?.tier
      : classification.tier;
    const recommendation = PROVIDER_RECOMMENDATIONS[provider]?.[effectiveTier];
    if (!recommendation) return;

    // Tier colour class
    const card = document.getElementById("pr-card");
    card.classList.remove(
      "pr-tier-light",
      "pr-tier-balanced",
      "pr-tier-premium",
    );
    const tierClass = {
      [MODEL_TIERS.LIGHTWEIGHT]: "pr-tier-light",
      [MODEL_TIERS.BALANCED]: "pr-tier-balanced",
      [MODEL_TIERS.PREMIUM]: "pr-tier-premium",
    }[effectiveTier];
    card.classList.add(tierClass);

    // Model label
    document.getElementById("pr-rec-model").textContent = recommendation.label;

    // Confidence bar
    document.getElementById("pr-conf-bar-fill").style.width =
      classification.confidence + "%";
    document.getElementById("pr-conf-pct").textContent =
      classification.confidence + "%";

    // Reasons — show top 1 or 2
    const r1 = document.getElementById("pr-reason-1");
    const r2 = document.getElementById("pr-reason-2");
    const reasons =
      classification.reasons && classification.reasons.length
        ? classification.reasons
        : [classification.reason];

    r1.textContent = reasons[0] || "—";
    if (reasons[1]) {
      r2.textContent = reasons[1];
      r2.style.display = "block";
    } else {
      r2.style.display = "none";
    }

    // Adaptive badge
    const badge = document.getElementById("pr-adaptive-badge");
    badge.classList.toggle("pr-show", adaptiveOn);

    // Overkill detection
    const overkillEl = document.getElementById("pr-overkill");
    const overkillText = document.getElementById("pr-overkill-text");

    if (selectedModelKey && !overrideKey) {
      const selectedTier = MODELS[selectedModelKey]?.tier || 0;
      const selectedLabel = MODELS[selectedModelKey]?.label || "unknown";

      if (selectedTier > effectiveTier) {
        overkillText.textContent = `You're using ${selectedLabel} — ${recommendation.label} is enough. Save your limit!`;
        overkillEl.classList.add("pr-show");
      } else {
        overkillEl.classList.remove("pr-show");
      }
    } else {
      overkillEl.classList.remove("pr-show");
    }

    // ── Spelling / typo suggestions ───────────────────────────────────────
    // Show the first relevant suggestion as a subtle non-blocking hint.
    // Only displayed when the classifier found a likely intent-word typo.
    const suggEl = document.getElementById("pr-suggestion");
    const suggText = document.getElementById("pr-suggestion-text");
    const suggs = classification.suggestions;

    if (suggs && suggs.length > 0) {
      // Show only the highest-impact suggestion (first in list)
      const s = suggs[0];
      suggText.textContent = `Did you mean "${s.suggestion}"?`;
      suggEl.classList.add("pr-show");
    } else {
      suggEl.classList.remove("pr-show");
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
      pillEl.classList.remove("pr-pill-visible");
    }
  }

  function getStrictMode() {
    const checkbox = document.getElementById("pr-strict-mode");
    return checkbox ? checkbox.checked : false;
  }

  return { build, update, show, hide, getStrictMode };
})();
