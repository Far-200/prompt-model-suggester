// utils/normalizer.js
// ─────────────────────────────────────────────────────────────────────────────
//
//  PURPOSE
//  Provide a lightweight, fully-local preprocessing layer for the classifier.
//  Three transforms are applied before any signal matching:
//
//    1. normalizePrompt(raw)      → lowercase + UK/US spelling normalization
//    2. correctIntentTypos(norm)  → Levenshtein-distance typo correction
//                                   for critical classifier keywords only
//    3. buildSuggestions(raw)     → human-readable "Did you mean…?" hints
//                                   returned alongside the classification
//
//  IMPORTANT DESIGN CONSTRAINTS
//  • Raw prompt is NEVER modified — UI always shows what the user typed.
//  • No external APIs, no network calls, no AI.
//  • All processing completes in < 1ms — safe for 300ms debounce loop.
//  • Normalization is NEUTRAL: both "colour" and "color" map to "color".
//    We do NOT "correct" the user to one dialect.
//
// ─────────────────────────────────────────────────────────────────────────────


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION A — UK/US SPELLING VARIANT MAP
//
//  Each entry is [ukVariant, sharedInternalForm].
//  The shared form is always the American spelling (simply because most
//  classifier regexes were already written that way), but neither form is
//  "correct" — this is purely an internal token.
//
//  Strategy: both "analyse" and "analyze" become "analyze" internally.
//  The user sees their own spelling; signals see the normalized form.
// ═════════════════════════════════════════════════════════════════════════════

const SPELLING_VARIANTS = [
  // Verb pairs
  ["analyse",        "analyze"],
  ["analysing",      "analyzing"],
  ["analysed",       "analyzed"],
  ["organise",       "organize"],
  ["organising",     "organizing"],
  ["organised",      "organized"],
  ["optimise",       "optimize"],
  ["optimising",     "optimizing"],
  ["optimised",      "optimized"],
  ["initialise",     "initialize"],
  ["initialising",   "initializing"],
  ["initialised",    "initialized"],
  ["specialise",     "specialize"],
  ["specialising",   "specializing"],
  ["specialised",    "specialized"],
  ["recognise",      "recognize"],
  ["recognising",    "recognizing"],
  ["recognised",     "recognized"],
  ["categorise",     "categorize"],
  ["categorising",   "categorizing"],
  ["categorised",    "categorized"],
  ["summarise",      "summarize"],
  ["summarising",    "summarizing"],
  ["summarised",     "summarized"],
  ["prioritise",     "prioritize"],
  ["prioritising",   "prioritizing"],
  ["prioritised",    "prioritized"],
  ["generalise",     "generalize"],
  ["generalising",   "generalizing"],
  ["generalised",    "generalized"],
  ["modernise",      "modernize"],
  ["modernising",    "modernizing"],
  ["modernised",     "modernized"],
  ["synchronise",    "synchronize"],
  ["synchronising",  "synchronizing"],
  ["synchronised",   "synchronized"],
  ["standardise",    "standardize"],
  ["standardising",  "standardizing"],
  ["standardised",   "standardized"],
  ["visualise",      "visualize"],
  ["visualising",    "visualizing"],
  ["visualised",     "visualized"],
  ["refactour",      "refactor"],   // rare but seen
  // Noun/adjective pairs (colour, behaviour, etc.)
  ["colour",         "color"],
  ["colours",        "colors"],
  ["coloured",       "colored"],
  ["colourful",      "colorful"],
  ["behaviour",      "behavior"],
  ["behaviours",     "behaviors"],
  ["behavioural",    "behavioral"],
  ["organisation",   "organization"],
  ["organisations",  "organizations"],
  ["organisational", "organizational"],
  ["optimisation",   "optimization"],
  ["optimisations",  "optimizations"],
  ["initialisation", "initialization"],
  ["summarisation",  "summarization"],
  ["prioritisation", "prioritization"],
  ["modularisation", "modularization"],
  ["synchronisation","synchronization"],
  ["standardisation","standardization"],
  ["visualisation",  "visualization"],
  ["visualisations", "visualizations"],
  ["specialisation", "specialization"],
  ["generalisation", "generalization"],
  ["categorisation", "categorization"],
  ["neighbour",      "neighbor"],
  ["neighbours",     "neighbors"],
  ["honour",         "honor"],
  ["honours",        "honors"],
  ["favour",         "favor"],
  ["favours",        "favors"],
  ["favourite",      "favorite"],
  ["favourites",     "favorites"],
  ["labour",         "labor"],
  ["labours",        "labors"],
  ["humour",         "humor"],
  ["licence",        "license"],    // noun form
  ["licences",       "licenses"],
  ["centre",         "center"],
  ["centres",        "centers"],
  ["defence",        "defense"],
  ["offence",        "offense"],
  ["practise",       "practice"],   // British verb form
  ["modelling",      "modeling"],
  ["travelling",     "traveling"],
  ["cancelling",     "canceling"],
  ["fulfil",         "fulfill"],
  ["fulfils",        "fulfills"],
  ["fulfilling",     "fulfilling"],  // same
  ["fulfiled",       "fulfilled"],
  ["programme",      "program"],
  ["programmes",     "programs"],
  // Compound/technical terms seen in AI prompts
  ["analyse the",    "analyze the"],
  ["analyse my",     "analyze my"],
  ["optimise the",   "optimize the"],
  ["optimise my",    "optimize my"],
];

// Build a fast replacement map from the list above.
// Keys are lowercase UK variants; values are the shared internal form.
const _VARIANT_MAP = Object.fromEntries(SPELLING_VARIANTS);

/**
 * normalizePrompt(raw)
 *
 * Step 1 of the preprocessing pipeline.
 * Returns the prompt in lowercase with UK spelling variants replaced by their
 * shared internal forms. This makes all downstream regexes spelling-agnostic
 * without needing alternation like /analy[sz]e/.
 *
 * Performance: single linear scan over the word list — O(n) in prompt length.
 */
function normalizePrompt(raw) {
  if (!raw) return "";

  // Lower-case first so our map lookup is case-insensitive
  let normalized = raw.toLowerCase();

  // Replace every UK variant with its shared form.
  // We use word-boundary-aware replacement to avoid partial-word hits
  // (e.g. "colours" should not partially match "colour" and leave "s" dangling
  //  — we list both explicitly in the map).
  for (const [uk, shared] of SPELLING_VARIANTS) {
    // Only replace if the UK form actually differs (skip no-ops like "fulfilling")
    if (uk === shared) continue;
    // Word-boundary replace: match whole word only
    // We build the regex lazily; the map is small (~60 entries) so this is fast.
    const re = new RegExp("(?<![a-z])" + uk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![a-z])", "g");
    normalized = normalized.replace(re, shared);
  }

  return normalized;
}


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION B — INTENT KEYWORD DICTIONARY
//
//  These are the words whose presence is load-bearing for classification.
//  We only attempt typo correction on this small set — NOT on every word.
//  This keeps the typo engine fast and avoids false suggestions on
//  domain-specific vocabulary the user typed intentionally.
// ═════════════════════════════════════════════════════════════════════════════

const INTENT_KEYWORDS = [
  // Analysis / investigation
  "analyze", "analyse", "analysis",
  "audit",
  "review",
  "inspect",
  "evaluate",
  "assess",
  "benchmark",
  "compare",

  // Optimization / performance
  "optimize", "optimise", "optimization",
  "refactor", "refactoring",
  "debug", "debugging",
  "performance",
  "bottleneck",
  "profiling",

  // Architecture / design
  "architect", "architecture",
  "design",
  "microservices", "microservice",
  "infrastructure",
  "scalable", "scalability",
  "distributed",
  "codebase",

  // Build / create
  "build",
  "create",
  "implement", "implementation",
  "generate",
  "develop", "development",
  "scaffold",

  // Content / writing
  "summarize", "summarise", "summarization",
  "translate", "translation",
  "explain",
  "describe",

  // Ranking / evaluation
  "rank", "ranking",
  "prioritize", "prioritise",
  "compare",
  "evaluate",
  "feasibility",
  "viability",

  // Scope markers
  "website",
  "application",
  "platform",
  "system",
  "backend",
  "frontend",
  "dashboard",
  "api",
  "function",
  "algorithm",
];

// Deduplicate (some words appear in multiple groups)
const _INTENT_SET = [...new Set(INTENT_KEYWORDS)];


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION C — LEVENSHTEIN DISTANCE
//
//  Classic dynamic-programming implementation, optimised for short strings.
//  We only call this on individual words from the prompt against our small
//  INTENT_KEYWORDS list — total iterations ≈ words × keywords × avg_len²
//  which is well within < 1ms for realistic prompts.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * levenshtein(a, b) → number
 * Returns the edit distance between strings a and b.
 * Optimized with early-exit and row reuse.
 */
function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  // Quick exits
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (a === b)  return 0;
  // Length guard — don't bother if words are very different lengths
  if (Math.abs(la - lb) > 3) return 99;

  // Single-row DP
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,          // insert
        prev[j]     + 1,          // delete
        prev[j - 1] + cost        // replace
      );
    }
    prev = curr;
    // Early exit: if minimum in row already > 2, no point continuing
    if (Math.min(...curr) > 2) return 99;
  }
  return prev[lb];
}


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION D — TYPO CORRECTION ENGINE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * correctIntentTypos(normalizedPrompt)
 *
 * Step 2 of the preprocessing pipeline.
 * Scans each word in the (already normalized) prompt.
 * If a word is NOT in the intent dictionary but is within edit distance 1–2
 * of a keyword, treat it as that keyword in the internal form used for
 * classification.
 *
 * Returns:
 *   {
 *     corrected:   string,           // prompt with intent typos fixed
 *     suggestions: Array<{
 *       original:   string,          // the word the user typed
 *       suggestion: string,          // the closest intent keyword
 *       distance:   number,          // edit distance (1 or 2)
 *     }>
 *   }
 *
 * Constraints applied to avoid false positives:
 *  • Min word length 4 (don't try to correct "on", "is", "my", etc.)
 *  • Min candidate keyword length 5 (short keywords like "api" are exact-match only)
 *  • Distance 1 allowed for words ≥ 5 chars; distance ≤ 2 for words ≥ 7 chars
 *  • A word already in the intent set is left alone (no suggestion needed)
 *  • Common English stop-words are excluded from correction attempts
 */

// Words we know are English and should never be flagged as typos
const STOP_WORDS = new Set([
  "the","a","an","is","it","in","on","at","to","for","of","and","or","but",
  "not","this","that","with","from","by","as","are","was","be","have","has",
  "had","do","did","can","will","just","my","me","your","our","their","we",
  "they","he","she","its","into","out","up","how","what","when","where","why",
  "which","who","would","could","should","may","might","need","want","make",
  "use","also","than","then","so","if","all","any","each","more","like","per",
  "get","set","new","old","let","some","please","hi","hey",
  "company","country","county","currency","category","community","capacity","century","agency","policy",
  "energy","memory","history","theory","library","privacy","security","quality","quantity","property",
  "really","every","already","only","after","under","above","often","still","later"
]);

// ── Valid UK/US variant pairs — these must NEVER trigger "Did you mean?" ──
// A user who types "analyse" is not making a typo; they're using British English.
// We normalize these internally for classification but never suggest corrections.
// Any word that is a known UK or US form is valid spelling, not a typo.
const VALID_SPELLING_VARIANTS = new Set([
  // -ise / -ize
  "analyse","analyze","analysing","analyzing","analysed","analyzed",
  "organise","organize","organising","organizing","organised","organized",
  "optimise","optimize","optimising","optimizing","optimised","optimized",
  "initialise","initialize","initialising","initializing","initialised","initialized",
  "summarise","summarize","summarising","summarizing","summarised","summarized",
  "prioritise","prioritize","prioritising","prioritizing","prioritised","prioritized",
  "specialise","specialize","specialising","specializing","specialised","specialized",
  "recognise","recognize","recognising","recognizing","recognised","recognized",
  "categorise","categorize","categorising","categorizing","categorised","categorized",
  "generalise","generalize","generalising","generalizing","generalised","generalized",
  "modernise","modernize","modernising","modernizing","modernised","modernized",
  "synchronise","synchronize","synchronising","synchronizing","synchronised","synchronized",
  "standardise","standardize","standardising","standardizing","standardised","standardized",
  "visualise","visualize","visualising","visualizing","visualised","visualized",
  // -our / -or
  "colour","color","colours","colors","coloured","colored","colourful","colorful",
  "behaviour","behavior","behaviours","behaviors","behavioural","behavioral",
  "honour","honor","honours","honors",
  "favour","favor","favours","favors","favourite","favorite","favourites","favorites",
  "labour","labor","labours","labors",
  "humour","humor",
  "neighbour","neighbor","neighbours","neighbors",
  // -re / -er
  "centre","center","centres","centers",
  // -ence / -ense
  "defence","defense","offence","offense","licence","license","licences","licenses",
  // double consonants
  "modelling","modeling","travelling","traveling","cancelling","canceling",
  "fulfil","fulfill","fulfils","fulfills","fulfiled","fulfilled",
  // -ise nouns
  "organisation","organization","organisations","organizations","organisational","organizational",
  "optimisation","optimization","optimisations","optimizations",
  "initialisation","initialization","summarisation","summarization",
  "prioritisation","prioritization","modularisation","modularization",
  "synchronisation","synchronization","standardisation","standardization",
  "visualisation","visualization","visualisations","visualizations",
  "specialisation","specialization","generalisation","generalization",
  "categorisation","categorization",
  // misc
  "practise","practice","programme","programs","programme","programs",
]);

function correctIntentTypos(normalizedPrompt) {
  const suggestions = [];
  const words = normalizedPrompt.split(/\s+/);
  const correctedWords = words.map(word => {
    // Strip trailing punctuation for matching, keep it for output
    const punct = word.match(/[.,!?;:]+$/)?.[0] || "";
    const bare  = word.slice(0, word.length - punct.length);

    // Skip: too short, stop word, or already a known intent keyword
    if (bare.length < 4)           return word;
    if (STOP_WORDS.has(bare))      return word;
    if (_INTENT_SET.includes(bare)) return word;

    // Decide the allowed edit distance based on word length
    const maxDist = bare.length >= 7 ? 2 : 1;

    // Find the closest intent keyword within tolerance
    let bestKeyword = null;
    let bestDist    = 99;

    for (const kw of _INTENT_SET) {
      // Skip very short keywords for fuzzy matching (exact-match only)
      if (kw.length < 5) continue;
      // Quick length pre-filter
      if (Math.abs(bare.length - kw.length) > maxDist) continue;

      const d = levenshtein(bare, kw);
      if (d <= maxDist && d < bestDist) {
        bestDist    = d;
        bestKeyword = kw;
        if (d === 1) break; // Can't do better — early exit
      }
    }

    if (bestKeyword) {
      // Only add to suggestions (user-visible "Did you mean?") when the original
      // is a genuine typo — NOT a valid regional spelling variant.
      // We still replace internally for classifier accuracy either way.
      const isValidVariant = VALID_SPELLING_VARIANTS.has(bare);
      if (!isValidVariant) {
        suggestions.push({
          original:   bare,
          suggestion: bestKeyword,
          distance:   bestDist,
        });
      }
      return bestKeyword + punct; // always replace internally
    }

    return word;
  });

  return {
    corrected:   correctedWords.join(" "),
    suggestions,
  };
}


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION E — PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

/**
 * preprocessPrompt(raw)
 *
 * Single entry-point called by classifyPrompt() before any signal runs.
 * Returns all three forms plus the suggestions list.
 *
 * @param  {string} raw  — the original user input (never modified)
 * @returns {{
 *   raw:          string,   // original, untouched — used for UI display
 *   normalized:   string,   // lowercase + UK→shared spelling
 *   corrected:    string,   // normalized + intent typos fixed — fed to signals
 *   suggestions:  Array<{ original, suggestion, distance }>
 * }}
 */
function preprocessPrompt(raw) {
  const normalized = normalizePrompt(raw);
  const { corrected: correctedRaw, suggestions } = correctIntentTypos(normalized);
  // Re-run normalization after typo correction: a typo like "analse" gets corrected
  // to "analyse" (UK spelling) by the Levenshtein engine, but normalizePrompt already
  // ran on the pre-correction text. Without this second pass, "analyse" would slip
  // through unnormalized and miss the /analy[sz]e/ → "analyze" mapping, causing the
  // classifier to treat it as an unknown word. One extra O(n) pass is negligible.
  const corrected = normalizePrompt(correctedRaw);
  return { raw, normalized, corrected, suggestions };
}
