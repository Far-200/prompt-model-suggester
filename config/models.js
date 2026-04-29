// config/models.js
// Model tier definitions and mappings across providers

const MODEL_TIERS = {
  LIGHTWEIGHT: 1,
  BALANCED: 2,
  PREMIUM: 3
};

const MODELS = {
  // Claude
  "claude-haiku-4.5":    { tier: MODEL_TIERS.LIGHTWEIGHT, label: "Haiku 4.5",   provider: "claude", displayNames: ["Haiku 4.5", "haiku 4.5"] },
  "claude-sonnet-4.5":   { tier: MODEL_TIERS.BALANCED,    label: "Sonnet 4.5",  provider: "claude", displayNames: ["Sonnet 4.5", "sonnet 4.5"] },
  "claude-sonnet-4.6":   { tier: MODEL_TIERS.BALANCED,    label: "Sonnet 4.6",  provider: "claude", displayNames: ["Sonnet 4.6", "sonnet 4.6"] },
  "claude-opus-3":       { tier: MODEL_TIERS.PREMIUM,     label: "Opus 3",      provider: "claude", displayNames: ["Opus 3", "opus 3", "Claude 3 Opus"] },
  "claude-opus-4.6":     { tier: MODEL_TIERS.PREMIUM,     label: "Opus 4.6",    provider: "claude", displayNames: ["Opus 4.6", "opus 4.6"] },
  "claude-opus-4.7":     { tier: MODEL_TIERS.PREMIUM,     label: "Opus 4.7",    provider: "claude", displayNames: ["Opus 4.7", "opus 4.7"] },

  // ChatGPT / OpenAI
  "gpt-4o-mini":         { tier: MODEL_TIERS.LIGHTWEIGHT, label: "GPT-4o mini", provider: "chatgpt", displayNames: ["4o mini", "gpt-4o-mini", "GPT-4o mini"] },
  "gpt-4o":              { tier: MODEL_TIERS.BALANCED,    label: "GPT-4o",      provider: "chatgpt", displayNames: ["4o", "GPT-4o", "gpt-4o"] },
  "o1":                  { tier: MODEL_TIERS.PREMIUM,     label: "o1",          provider: "chatgpt", displayNames: ["o1", "GPT o1"] },
  "o3":                  { tier: MODEL_TIERS.PREMIUM,     label: "o3",          provider: "chatgpt", displayNames: ["o3", "GPT o3"] },
  "gpt-5":               { tier: MODEL_TIERS.PREMIUM,     label: "GPT-5",       provider: "chatgpt", displayNames: ["GPT-5", "gpt-5"] },

  // Gemini
  "gemini-flash-lite":   { tier: MODEL_TIERS.LIGHTWEIGHT, label: "Flash Lite",  provider: "gemini", displayNames: ["Flash Lite", "flash lite", "Gemini Flash Lite"] },
  "gemini-flash":        { tier: MODEL_TIERS.BALANCED,    label: "Flash",       provider: "gemini", displayNames: ["Gemini Flash", "Flash 2", "Flash 2.0"] },
  "gemini-pro":          { tier: MODEL_TIERS.PREMIUM,     label: "Gemini Pro",  provider: "gemini", displayNames: ["Gemini Pro", "Gemini 1.5 Pro", "Gemini 2.0 Pro"] }
};

// Provider-level recommended models per tier
const PROVIDER_RECOMMENDATIONS = {
  claude: {
    [MODEL_TIERS.LIGHTWEIGHT]: { key: "claude-haiku-4.5",  label: "Haiku 4.5" },
    [MODEL_TIERS.BALANCED]:    { key: "claude-sonnet-4.6", label: "Sonnet 4.6" },
    [MODEL_TIERS.PREMIUM]:     { key: "claude-opus-4.7",   label: "Opus 4.7" }
  },
  chatgpt: {
    [MODEL_TIERS.LIGHTWEIGHT]: { key: "gpt-4o-mini", label: "GPT-4o mini" },
    [MODEL_TIERS.BALANCED]:    { key: "gpt-4o",      label: "GPT-4o" },
    [MODEL_TIERS.PREMIUM]:     { key: "o3",          label: "o3" }
  },
  gemini: {
    [MODEL_TIERS.LIGHTWEIGHT]: { key: "gemini-flash-lite", label: "Gemini Flash Lite" },
    [MODEL_TIERS.BALANCED]:    { key: "gemini-flash",      label: "Gemini Flash" },
    [MODEL_TIERS.PREMIUM]:     { key: "gemini-pro",        label: "Gemini Pro" }
  }
};

const TIER_LABELS = {
  [MODEL_TIERS.LIGHTWEIGHT]: "Lightweight",
  [MODEL_TIERS.BALANCED]:    "Balanced",
  [MODEL_TIERS.PREMIUM]:     "Premium"
};

// Detect model from visible UI text — returns model key or null
function detectModelFromText(text, provider) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  for (const [key, model] of Object.entries(MODELS)) {
    if (model.provider !== provider) continue;
    for (const displayName of model.displayNames) {
      if (lower.includes(displayName.toLowerCase())) {
        return key;
      }
    }
  }
  return null;
}
