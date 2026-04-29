// analyzer/classifier.js  v3.0
// ─────────────────────────────────────────────────────────────────────────────
//
//  ARCHITECTURE
//  ┌─────────────────────────────────────────────────────────────────┐
//  │  1. Run all SIGNALS      → accumulate totalScore               │
//  │  2. Apply OVERRIDE RULES → may hard-force or set minimum tier  │
//  │  3. Apply SAFETY RULES   → prevent obviously wrong Lightweight │
//  │  4. Map finalScore → tier → model label                        │
//  │  5. Build top-2 reasons, confidence, return output object      │
//  └─────────────────────────────────────────────────────────────────┘
//
//  TIER MAP  (score-based, overrides & safety rules can bypass)
//    ≤ 2  →  Lightweight  (Haiku 4.5 / GPT-4o mini / Flash Lite)
//    3-8  →  Balanced     (Sonnet 4.6 / GPT-4o / Gemini Flash)
//    ≥ 9  →  Premium      (Opus 4.7 / o3 / Gemini Pro)
//
//  No external APIs. No network calls. All regex — safe for real-time typing.
//
// ─────────────────────────────────────────────────────────────────────────────

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — SIGNALS
//  Each signal: { id, label, detect(prompt) → { score, reasons[] } }
//  Positive score = more complex. Negative score = simpler.
// ═════════════════════════════════════════════════════════════════════════════

const SIGNALS = [
  // ── S1. Prompt length ───────────────────────────────────────────────────────
  // Weak signal alone — an expert short prompt beats a long ramble.
  // Only penalise truly trivial one-liners.
  {
    id: "length",
    label: "Prompt length",
    detect(p) {
      const len = p.trim().length;
      if (len < 30) return { score: -1, reasons: ["Very short prompt"] };
      if (len < 120) return { score: 0, reasons: [] };
      if (len < 300) return { score: 1, reasons: ["Detailed prompt"] };
      if (len < 600) return { score: 2, reasons: ["Long, detailed prompt"] };
      return { score: 3, reasons: ["Very long / complex prompt"] };
    },
  },

  // ── S2. Code / tech stack intent ───────────────────────────────────────────
  // Counts named technologies. More tech tokens = higher implementation burden.
  {
    id: "code_intent",
    label: "Technical / coding task",
    detect(p) {
      const reasons = [];
      let score = 0;

      const TECH = [
        "react",
        "vue",
        "angular",
        "next.js",
        "nextjs",
        "nuxt",
        "svelte",
        "remix",
        "webgl",
        "three.js",
        "threejs",
        "canvas",
        "shader",
        "glsl",
        "opengl",
        "wasm",
        "typescript",
        "javascript",
        "python",
        "rust",
        "golang",
        "java",
        "c++",
        "c#",
        "kotlin",
        "swift",
        "node.js",
        "nodejs",
        "bun",
        "deno",
        "express",
        "fastapi",
        "django",
        "flask",
        "spring",
        "rails",
        "laravel",
        "gin",
        "sql",
        "postgres",
        "postgresql",
        "mysql",
        "sqlite",
        "mongodb",
        "redis",
        "cassandra",
        "dynamodb",
        "graphql",
        "prisma",
        "drizzle",
        "typeorm",
        "sequelize",
        "docker",
        "kubernetes",
        "k8s",
        "terraform",
        "pulumi",
        "ansible",
        "aws",
        "gcp",
        "azure",
        "vercel",
        "netlify",
        "cloudflare",
        "supabase",
        "firebase",
        "webpack",
        "vite",
        "esbuild",
        "rollup",
        "parcel",
        "tailwind",
        "scss",
        "sass",
        "websocket",
        "grpc",
        "trpc",
        "rest api",
        "oauth",
        "jwt",
        "clerk",
        "auth0",
        "stripe",
        "plaid",
        "twilio",
        "sendgrid",
        "rabbitmq",
        "kafka",
        "sqs",
        "celery",
        "nginx",
        "traefik",
        "caddy",
        "jest",
        "vitest",
        "cypress",
        "playwright",
        "pytest",
        "langchain",
        "openai sdk",
        "anthropic sdk",
      ];

      // Simple string containment check (fast, no RegExp object creation per token)
      const pl = p.toLowerCase();
      const found = TECH.filter((t) => pl.includes(t));

      if (found.length >= 4) {
        score += 4;
        reasons.push("Multi-tech stack (" + found.length + " technologies)");
      } else if (found.length === 3) {
        score += 3;
        reasons.push("Tech stack: " + found.slice(0, 3).join(", "));
      } else if (found.length === 2) {
        score += 2;
        reasons.push("Tech stack: " + found.join(", "));
      } else if (found.length === 1) {
        score += 1;
        reasons.push("Tech mentioned: " + found[0]);
      }

      // Code block pasted into the prompt
      if (/```[\s\S]{20,}```/.test(p) || (p.match(/```/g) || []).length >= 2) {
        score += 2;
        reasons.push("Code block in prompt");
      }

      // Inline code syntax
      if (
        /\b(function\s*\(|class\s+\w|def\s+\w|const\s+\w|let\s+\w|var\s+\w|import\s+\{|export\s+(default|const)|async\s+function|interface\s+\w|type\s+\w+\s*=)/.test(
          p,
        )
      ) {
        score += 1;
        reasons.push("Code syntax detected");
      }

      return { score: Math.min(score, 5), reasons };
    },
  },

  // ── S3. Project / build intent ─────────────────────────────────────────────
  // "make me a website", "build an app" — creation verbs + product nouns.
  // Even a 4-word prompt like this is NOT a Haiku-level task.
  {
    id: "build_intent",
    label: "Product / system generation",
    detect(p) {
      const reasons = [];
      let score = 0;

      const hasCreationVerb =
        /\b(build|make|create|develop|generate|write|code|implement|design|set up|scaffold|bootstrap|spin up|visualize|plot|render|display|show|draw)\b/i.test(
          p,
        );

      const hasProductNoun =
        /\b(website|web app|webapp|application|app|site|platform|saas|tool|cli|api|service|backend|frontend|dashboard|portal|system|bot|chatbot|extension|plugin|library|package|sdk|template|boilerplate|landing page|ecommerce|e-commerce|marketplace|crm|cms|script|function|module|component|class|feature|endpoint|widget|command.line|chart|graph|diagram|visualization|plot|report)\b/i.test(
          p,
        );

      if (hasCreationVerb && hasProductNoun) {
        score += 3;
        reasons.push("Product / system generation");
      } else if (hasCreationVerb) {
        score += 1;
        reasons.push("Build / creation task");
      } else if (hasProductNoun) {
        score += 2;
        reasons.push("Product scope implied");
      }

      // Fullness amplifiers — "complete app", "full website"
      if (
        /\b(complete|full|entire|whole|end-to-end|e2e)\b/i.test(p) &&
        (hasCreationVerb || hasProductNoun)
      ) {
        score += 2;
        reasons.push("Full / complete build requested");
      }

      return { score: Math.min(score, 5), reasons };
    },
  },

  // ── S4. Multi-file / system scope ──────────────────────────────────────────
  {
    id: "scope",
    label: "Project scope",
    detect(p) {
      const reasons = [];
      let score = 0;

      if (
        /\b(multi-?file|multiple files?|several files?|file structure|folder structure|directory structure|project structure|full project)\b/i.test(
          p,
        )
      ) {
        score += 3;
        reasons.push("Multi-file project scope");
      }
      if (
        /\b(full (app(lication)?|project|website|codebase|stack|backend|frontend|system)|entire (app|project|codebase|system|repo)|whole (app|project|system|codebase))\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Full application scope");
      }
      if (
        /\b(production-ready|production grade|scalable|enterprise|deploy(ment)?|ship(ping)?)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Production-level scope");
      }
      if (/\b(full-?stack|fullstack|monorepo|microservices?)\b/i.test(p)) {
        score += 2;
        reasons.push("Full-stack / complex architecture");
      }
      if (
        /\b(build.*(api|server|backend)|create.*(api|server|backend)|rest(ful)? api)\b/i.test(
          p,
        )
      ) {
        score += 1;
        reasons.push("API / backend build");
      }

      return { score: Math.min(score, 5), reasons };
    },
  },

  // ── S5. Constraint count ───────────────────────────────────────────────────
  // More listed requirements = more output volume = higher complexity.
  {
    id: "constraints",
    label: "Constraint density",
    detect(p) {
      const reasons = [];
      let score = 0;

      const reqVerbs = (
        p.match(
          /\b(use|using|with|include|add|implement|integrate|make sure|ensure|support|handle|allow)\b/gi,
        ) || []
      ).length;
      const commaItems = (p.match(/,\s*[a-z]/gi) || []).length;
      const andCount = (p.match(/\band\b/gi) || []).length;
      const total =
        reqVerbs + Math.floor(commaItems / 2) + Math.floor(andCount / 2);

      if (total >= 8) {
        score = 4;
        reasons.push(
          "Very high constraint density (" + total + " requirements)",
        );
      } else if (total >= 5) {
        score = 3;
        reasons.push("High constraint count (" + total + " requirements)");
      } else if (total >= 3) {
        score = 2;
        reasons.push("Multiple requirements specified");
      } else if (total >= 1) {
        score = 1;
        reasons.push("Some requirements specified");
      }

      return { score: Math.min(score, 4), reasons };
    },
  },

  // ── S6. Output complexity / volume ────────────────────────────────────────
  {
    id: "output_complexity",
    label: "Output complexity",
    detect(p) {
      const reasons = [];
      let score = 0;

      if (
        /\b(and all that|and everything|and so on|etc\.?|and more|the works|all of (it|that|this)|whatever else|you name it|and stuff)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Broad-scope amplifier ('and all that', etc.)");
      }
      if (
        /\b(complete(ly)?|comprehensive|fully.?featured?|thorough|exhaustive|cover everything|cover all (cases?|edge cases?))\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Completeness demanded");
      }
      if (
        /\b(step-?by-?step|detailed? (guide|walkthrough|breakdown|tutorial)|explain every( step)?|walk me through)\b/i.test(
          p,
        )
      ) {
        score += 1;
        reasons.push("Step-by-step output requested");
      }
      if (
        /\b(with tests?|with unit tests?|with documentation|with error handling|with logging|with auth(entication)?)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Production-ready extras expected");
      }

      return { score: Math.min(score, 4), reasons };
    },
  },

  // ── S7. Reasoning / analytical depth ─────────────────────────────────────
  {
    id: "reasoning_depth",
    label: "Reasoning / analysis",
    detect(p) {
      const reasons = [];
      let score = 0;

      // "analyze" alone (or "analyse pls") must NOT score — it needs a meaningful object.
      // Only award the deep-analysis bonus when the verb is paired with a real subject.
      const hasAnalyzeVerb =
        /\b(analyz(e|ing)|audit(ing)?)\b/i.test(p);
      const hasAnalysisObject =
        /\b(code|codebase|system|architecture|dataset|data|performance|security|project|repository|repo|app|application|service|pipeline|infrastructure|function|module|component)\b/i.test(p);

      if (hasAnalyzeVerb && hasAnalysisObject) {
        score += 2;
        reasons.push("Deep analysis task");
      }

      // Other strong-reasoning verbs that don't need a paired object guard
      if (
        /\b(compare.and.contrast|pros.and.cons|trade-?off|evaluate|critique|assess|review in depth|benchmark)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Deep analysis requested");
      }
      if (
        /\b(research|literature review|deep dive|in-depth study|nuanced|second-order effect|implication)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("In-depth research / investigation");
      }
      if (
        /\b(why (does|is|did|would)|explain (why|how)|how (does|do|did) .{3,40} work)\b/i.test(
          p,
        )
      ) {
        score += 1;
        reasons.push("Explanatory reasoning required");
      }
      // "explain how X works" for tech topics
      if (
        /\b(explain how|how (does|do|did|can) .{0,20} work|how to (use|implement|build|create))\b/i.test(
          p,
        )
      ) {
        const pl = p.toLowerCase();
        const TECH_CONCEPTS = [
          "react",
          "vue",
          "angular",
          "python",
          "javascript",
          "typescript",
          "node",
          "docker",
          "api",
          "sql",
          "graphql",
          "hook",
          "async",
          "closure",
          "promise",
          "class",
          "function",
          "component",
          "state",
          "redux",
          "recursion",
          "pointer",
          "cache",
          "queue",
          "stack",
          "tree",
          "graph",
          "algorithm",
        ];
        if (TECH_CONCEPTS.some((t) => pl.includes(t))) {
          score += 2;
          reasons.push("Technical concept explanation");
        }
      }
      // "what does X do" for known tech identifiers
      if (
        /\bwhat (does|do|is|are) \S+ (do|work|mean|return|represent)\b/i.test(p)
      ) {
        const pl = p.toLowerCase();
        const TECH_IDS = [
          "usestate",
          "useeffect",
          "useref",
          "hook",
          "redux",
          "graphql",
          "promise",
          "async",
          "closure",
          "prototype",
          "api",
          "jwt",
          "oauth",
          "cors",
          "webpack",
          "vite",
          "babel",
          "docker",
          "kubernetes",
          "nginx",
          "cdn",
          "orm",
          "rpc",
          "websocket",
        ];
        if (TECH_IDS.some((t) => pl.includes(t))) {
          score += 2;
          reasons.push("Tech API / concept question");
        }
      }

      return { score: Math.min(score, 4), reasons };
    },
  },

  // ── S8. Debugging / error investigation ───────────────────────────────────
  {
    id: "debugging",
    label: "Debugging task",
    detect(p) {
      const reasons = [];
      let score = 0;

      if (
        /\b(debug|traceback|stack.?trace|exception|crash|segfault|heap dump|oom|out of memory|core dump)\b/i.test(
          p,
        )
      ) {
        score += 3;
        reasons.push("Debugging / crash investigation");
      } else if (
        /\b(not working|doesn.t work|broken|bug|error|fails?|wrong output|unexpected (behavior|behaviour|result))\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Bug / error fix");
      }

      // Pasted error message heuristic
      if (
        /^\s*(at |Error:|Traceback|TypeError|ValueError|ReferenceError|SyntaxError|NullPointerException|Segmentation|ENOENT|ECONNREFUSED)/m.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Error message pasted");
      }

      // Performance investigation
      if (
        /\b(slow|latency|memory leak|cpu spike|bottleneck|profil(e|ing)|performance|optimize)\b/i.test(
          p,
        ) &&
        /\b(code|app|function|query|endpoint|service|pipeline)\b/i.test(p)
      ) {
        score += 2;
        reasons.push("Performance optimization");
      }

      return { score: Math.min(score, 4), reasons };
    },
  },

  // ── S9. Architecture / system design ──────────────────────────────────────
  {
    id: "architecture",
    label: "Architecture / system design",
    detect(p) {
      const reasons = [];
      let score = 0;

      if (
        /\b(architect(ure)?|system design|design pattern|design (system|service|platform|data model|infrastructure|pipeline)|event-driven|cqrs|ddd|domain-driven|hexagonal|clean architecture)\b/i.test(
          p,
        )
      ) {
        score += 5;
        reasons.push("Architecture / system design");
      }
      if (/\b(microservices?|monolith|serverless)\b/i.test(p)) {
        score += 3;
        reasons.push("Service architecture");
      }
      if (
        /\b(scalab(le|ility)|high.availability|fault.tolerant|load balanc|sharding|replication|distributed( system)?|consensus|rate.limit(er|ing)|circuit.breaker|pub.?sub|message.queue|event (sourcing|queue)|saga pattern)\b/i.test(
          p,
        )
      ) {
        score += 3;
        reasons.push("Distributed / scalable systems");
      }
      if (
        /\b(algorithm|data structure|dynamic programming|graph (theory|search|traversal)|big.?o notation|time complexity|space complexity|memoiz|backtracking|divide and conquer)\b/i.test(
          p,
        )
      ) {
        score += 3;
        reasons.push("Algorithms / CS fundamentals");
      }
      if (
        /\b(security (audit|review|assessment)|pen test|threat model|sql injection|xss|csrf|owasp)\b/i.test(
          p,
        )
      ) {
        score += 3;
        reasons.push("Security audit / review");
      }
      if (
        /\b(authentication|authorization|auth system|sso|saml|oidc|oauth flow|rbac|abac|permission system)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Auth system design");
      }
      if (
        /\b(refactor|restructure|rewrite|redesign|overhaul|migrate|modernize)\b/i.test(
          p,
        )
      ) {
        score += 1;
        reasons.push("Refactor / redesign task");
      }

      return { score: Math.min(score, 6), reasons };
    },
  },

  // ── S10. Vague broad-scope phrases ────────────────────────────────────────
  // These short words massively expand the expected output.
  // A 5-word prompt with "production-ready" is NOT Haiku territory.
  {
    id: "broad_scope",
    label: "Broad scope markers",
    detect(p) {
      const reasons = [];
      let score = 0;

      if (
        /\b(complete|full|entire|comprehensive|fully.?featured|all-in-one|from scratch|ground.up|end.to.end)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Completeness / fullness marker");
      }
      if (
        /\b(production-ready|production grade|fully functional|working (app|site|system)|everything|all the features?|all features?)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Production-ready / full-feature demand");
      }
      if (
        /\b(with everything|and everything|and all (that|the rest)|all of (it|that)|the whole thing|from A to Z)\b/i.test(
          p,
        )
      ) {
        score += 2;
        reasons.push("Open-ended scope ('and everything', etc.)");
      }

      return { score: Math.min(score, 4), reasons };
    },
  },

  // ── S11. Creative / professional writing ──────────────────────────────────
  {
    id: "creative_writing",
    label: "Creative / professional writing",
    detect(p) {
      const reasons = [];
      let score = 0;

      if (
        /\b(write (a |an )?(blog post|article|essay|cover letter|short story|product description|email|report|proposal|spec|prd|readme|documentation|whitepaper))\b/i.test(
          p,
        )
      ) {
        score += 3;
        reasons.push("Creative / professional writing");
      }
      if (
        /\b(draft|compose|write up|put together|create (a |an )?(document|report|spec|proposal))\b/i.test(
          p,
        ) &&
        p.length > 60
      ) {
        score += 2;
        reasons.push("Document drafting");
      }

      return { score: Math.min(score, 3), reasons };
    },
  },

  // ── S12. Simple task deflectors (negative scores) ─────────────────────────
  // Pull the score DOWN for genuinely trivial tasks.
  // Guards prevent misfires when dev/tech context is also present.
  {
    id: "simple_task",
    label: "Simple task",
    detect(p) {
      const reasons = [];
      let score = 0;

      const pl = p.toLowerCase();
      const hasDevIntent =
        /\b(build|create|make|generate|develop|code|implement|design|architect|refactor|deploy|write|visualize|visualise|initialize|initialise|configure|optimize|optimise|analyze|analyse|render|plot|migrate|debug)\b/i.test(
          p,
        );
      const TECH_WORDS = [
        "react",
        "vue",
        "angular",
        "python",
        "javascript",
        "typescript",
        "node",
        "docker",
        "kubernetes",
        "sql",
        "api",
        "usestate",
        "useeffect",
        "hook",
        "redux",
        "graphql",
        "async",
        "await",
        "promise",
        "closure",
        "prototype",
        "jwt",
        "oauth",
        "cors",
        "webpack",
        "vite",
        "babel",
        "nginx",
        "redis",
        "mongodb",
        "postgres",
      ];
      const hasTech = TECH_WORDS.some((t) => pl.includes(t));
      const isComplex = hasDevIntent || hasTech;

      // Grammar / spelling — clearest lightweight signal
      if (
        /\b(fix grammar|fix spelling|proofread|correct (my )?(grammar|spelling|sentence|text|writing)|typo|grammatical( error)?)\b/i.test(
          p,
        )
      ) {
        score -= 5;
        reasons.push("Grammar / spelling fix");
      }

      // Translation (not a build task)
      if (
        /\b(translate( (this|to|into|from|the))?|translation)\b/i.test(p) &&
        !isComplex
      ) {
        score -= 3;
        reasons.push("Translation request");
      }

      // Simple factual lookup — short question pattern
      if (
        /^(what is|who is|when (did|was)|where is|how many|define |what('s| is) the )/i.test(
          p.trim(),
        ) &&
        p.length < 100 &&
        !hasTech
      ) {
        score -= 3;
        reasons.push("Simple factual lookup");
      }

      // Summarisation of non-code content
      if (
        /\b(tldr|tl;dr|summarize|summarise|brief summary|quick summary|sum up|give me the gist)\b/i.test(
          p,
        ) &&
        p.length < 300 &&
        !isComplex
      ) {
        score -= 2;
        reasons.push("Summarisation task");
      }

      // Definition lookup (not a tech identifier)
      if (/\bwhat (does|do) .{3,40} (mean|stand for)\b/i.test(p) && !hasTech) {
        score -= 3;
        reasons.push("Definition / meaning lookup");
      }

      // Pure conversational — only if genuinely empty
      if (
        p.trim().length < 40 &&
        !isComplex &&
        !/\b(explain|describe|how|why|what)\b/i.test(p)
      ) {
        score -= 2;
        reasons.push("Casual / conversational");
      }

      return { score, reasons };
    },
  },

  // ── S13. Evaluation / ranking / comparison tasks ──────────────────────────
  // "rank 20 ideas by feasibility" is NOT a simple generation task.
  // Ranking against multiple criteria requires structured reasoning and
  // proportional output volume — never Lightweight territory.
  {
    id: "evaluation_ranking",
    label: "Evaluation / ranking task",
    detect(p) {
      const reasons = [];
      let score = 0;

      // Ranking / scoring verbs
      const hasRankVerb =
        /\b(rank|score|compare|evaluate|prioritize|prioritise|rate|assess|order|sort by|weigh|benchmark|grade)\b/i.test(
          p,
        );

      // Evaluation criteria words
      const hasCriteria =
        /\b(feasibility|difficulty|complexity|market potential|pros and cons|trade-?offs?|strengths and weaknesses|impact|effort|roi|cost.benefit|viability|scalability|profitability)\b/i.test(
          p,
        );

      if (hasRankVerb && hasCriteria) {
        // Both verb AND criteria — clear structured evaluation task
        score += 4;
        reasons.push("Evaluation / ranking task");
      } else if (hasRankVerb) {
        score += 2;
        reasons.push("Ranking / comparison requested");
      } else if (hasCriteria) {
        score += 2;
        reasons.push("Multi-criteria evaluation");
      }

      // Large numbered output ("20 ideas", "10 options", "50 suggestions")
      // Combined with any ranking/criteria signal, this is unambiguously non-trivial
      const largeOutput =
        /\b([1-9]\d+|ten|twenty|thirty|fifty)\s+(idea|option|suggestion|example|item|startup|concept|way|reason|tip|strategy|approach)s?\b/i.test(
          p,
        );
      if (largeOutput) {
        if (score > 0) {
          // Already has ranking/criteria — amplify
          score += 2;
          reasons.push("Large ranked output requested");
        } else {
          // Standalone large list — still not trivial
          score += 1;
          reasons.push("Large list generation");
        }
      }

      return { score: Math.min(score, 5), reasons };
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — OVERRIDE RULES
//  Applied after all signals. May hard-force or set a minimum tier.
//  { id, label, reason, test(p)→bool, forceTier?, minTier? }
// ═════════════════════════════════════════════════════════════════════════════

const OVERRIDE_RULES = [
  // OR1. Deep analysis of code/system → always Premium
  {
    id: "deep_analysis",
    label: "Deep analysis task",
    reason: "Deep analysis task",
    forceTier: MODEL_TIERS.PREMIUM,
    test: (p) =>
      /\b(analyz(e|ing)|audit(ing)?|refactor(ing)?|optimi[sz](e|ing)|review(ing)?|inspect(ing)?)\b/i.test(
        p,
      ) &&
      /\b(codebase|entire (code|project|repo|app)|whole (code|project|repo)|performance|security|architecture|\d{3,}.?line|\d{3,}.?lines?)\b/i.test(
        p,
      ),
  },

  // OR2. Build / creation of any product → minimum Balanced
  // This is the KEY fix for "make me a website" → Sonnet (never Haiku)
  {
    id: "build_min",
    label: "Implicit build intent",
    reason: "Implicit build intent",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(build|make|create|develop|generate|write|code|implement|design|set up|scaffold|visualize|initialize|initialise|configure)\b/i.test(
        p,
      ) &&
      /\b(website|web app|webapp|app(lication)?|site|platform|saas|tool|cli|api|service|backend|frontend|dashboard|portal|system|bot|chatbot|extension|plugin|library|landing page|ecommerce|marketplace|script|module|component|feature)\b/i.test(
        p,
      ),
  },

  // OR3. Full-stack / production build with multiple tech → Premium
  {
    id: "fullstack_premium",
    label: "Full-stack / production build",
    reason: "Full-stack / production system build",
    minTier: MODEL_TIERS.PREMIUM,
    test: (p) => {
      const hasFullScope =
        /\b(full-?stack|fullstack|complete (app|system|website|platform)|end-to-end|production-ready|from scratch)\b/i.test(
          p,
        );
      const hasBuild = /\b(build|create|make|develop|implement)\b/i.test(p);
      const pl = p.toLowerCase();
      const QUICK_TECH = [
        "react",
        "vue",
        "angular",
        "next",
        "node",
        "express",
        "django",
        "flask",
        "postgres",
        "mongodb",
        "redis",
        "docker",
        "kubernetes",
        "aws",
        "stripe",
        "auth",
        "jwt",
      ];
      const techCount = QUICK_TECH.filter((t) => pl.includes(t)).length;
      return (
        (hasFullScope && hasBuild) ||
        (hasBuild && techCount >= 2 && hasFullScope)
      );
    },
  },

  // OR4. Codebase-scale refactor → Premium
  {
    id: "codebase_refactor",
    label: "Codebase-scale refactor",
    reason: "Codebase-scale refactor or rewrite",
    minTier: MODEL_TIERS.PREMIUM,
    test: (p) =>
      /\b(refactor|rewrite|restructure|overhaul|migrate|modernize)\b/i.test(
        p,
      ) &&
      /\b(entire|whole|full|complete|codebase|repo|project|application|all (the )?code)\b/i.test(
        p,
      ),
  },

  // OR5. Coding task (implement / write a function/script) → minimum Balanced
  {
    id: "coding_task_min",
    label: "Coding task",
    reason: "Coding / implementation task",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(implement|write|create|code|build|make)\b/i.test(p) &&
      /\b(function|method|script|class|module|component|algorithm|binary search|sort(ing)?|search(ing)?|parse|fetch|query|endpoint|route|cli)\b/i.test(
        p,
      ),
  },

  // OR6. Ranked / evaluated multi-output generation → minimum Balanced
  // "Generate 20 startup ideas and rank by feasibility" must never be Haiku.
  // Any prompt that combines (a) a large numbered output OR ranking verb
  // with (b) evaluation criteria is inherently a Balanced-floor task.
  {
    id: "ranked_multi_output",
    label: "Ranked multi-output generation",
    reason: "Evaluation / ranking task",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) => {
      const hasRankOrEval =
        /\b(rank|score|compare|evaluate|prioritize|prioritise|rate|assess|order by|sort by|weigh|benchmark)\b/i.test(
          p,
        ) ||
        /\b(feasibility|difficulty|market potential|pros and cons|trade-?offs?|impact|effort|roi|viability|scalability|profitability)\b/i.test(
          p,
        );

      const hasLargeOutput =
        /\b([1-9]\d+|ten|twenty|thirty|fifty)\s+(idea|option|suggestion|example|item|startup|concept|way|reason|tip|strategy|approach)s?\b/i.test(
          p,
        );

      // Minimum Balanced if:
      // • ranking/criteria words present (regardless of list size), OR
      // • a large numbered list + any generation verb
      return (
        hasRankOrEval ||
        (hasLargeOutput &&
          /\b(generate|list|give|suggest|create|come up with|write|produce|provide)\b/i.test(
            p,
          ))
      );
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — SAFETY RULES
//  Hard stops. Certain prompts must NEVER be Lightweight, regardless of score.
//  Applied as a final check after all signals and overrides.
// ═════════════════════════════════════════════════════════════════════════════

const SAFETY_RULES = [
  // Any build/make/create + product noun → minimum Balanced
  {
    id: "safety_build",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(build|make|create|develop|implement|code|write)\b/i.test(p) &&
      /\b(app|website|system|api|service|platform|dashboard|bot|tool|extension|backend|frontend|component|feature|module)\b/i.test(
        p,
      ),
  },

  // Analysis/optimization of a codebase/system → minimum Balanced
  {
    id: "safety_analyze",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(analyz(e|ing)|refactor(ing)?|optimi[sz](e|ing)|audit(ing)?|review)\b/i.test(
        p,
      ) &&
      /\b(codebase|code|system|performance|security|architecture|app|application)\b/i.test(
        p,
      ),
  },

  // Bug fix with tech context → minimum Balanced
  {
    id: "safety_bug_fix",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(bug|error|fix|broken|not working|debug|crash|exception|fails?)\b/i.test(
        p,
      ) &&
      /\b(react|vue|angular|python|javascript|typescript|node|docker|api|sql|graphql|hook|component|function|script|code|app)\b/i.test(
        p,
      ),
  },

  // Tech concept explanation → minimum Balanced
  {
    id: "safety_tech_explanation",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) => {
      const hasExplainPattern =
        /\b(explain how|how (does|do|did|can) \S+ work|how to (use|implement)|what does \S+ (do|work|return|mean)|explain (what|why|how))\b/i.test(
          p,
        );
      if (!hasExplainPattern) return false;
      const pl = p.toLowerCase();
      const TECH_CONCEPTS = [
        "react",
        "vue",
        "angular",
        "python",
        "javascript",
        "typescript",
        "node",
        "docker",
        "api",
        "sql",
        "graphql",
        "hook",
        "usestate",
        "useeffect",
        "async",
        "closure",
        "promise",
        "class",
        "function",
        "component",
        "state",
        "redux",
        "algorithm",
        "recursion",
        "cache",
        "queue",
        "stack",
        "tree",
        "graph",
        "jwt",
        "oauth",
        "cors",
        "webpack",
        "vite",
      ];
      return TECH_CONCEPTS.some((t) => pl.includes(t));
    },
  },

  // Coding / implementation task → minimum Balanced
  {
    id: "safety_coding",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(implement|write|create|code|build|make|optimize|optimise|initialize|initialise|init|setup|configure|refactor)\b/i.test(p) &&
      /\b(function|method|script|class|module|component|algorithm|binary search|sort|search|parse|fetch|query|endpoint|route|project|app|service|pipeline|form|page|view|screen|layout|widget|button|input|field|table|chart|modal|dialog|navbar|sidebar|hook|store|reducer|action|middleware|schema|model|migration|controller|resolver|handler|validator)\b/i.test(
        p,
      ),
  },

  // Bare build/code/develop verb alone (even vague) → minimum Balanced
  // "build something", "help me code", "develop an idea" must never be Lightweight.
  // These signal intent to produce working output — always worth at least Sonnet.
  {
    id: "safety_bare_build_verb",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(build|code|develop|implement|program|write (a |some |the )?(code|script|app|function|program))\b/i.test(p),
  },
  {
    id: "safety_build_with_tech",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) => {
      const hasBuild = /\b(build|create|make|develop|implement|code|write)\b/i.test(p);
      if (!hasBuild) return false;
      const pl = p.toLowerCase();
      const NAMED_TECH = [
        "react","vue","angular","next","nextjs","nuxt","svelte","remix",
        "typescript","javascript","python","rust","golang","java","kotlin","swift",
        "node","nodejs","express","fastapi","django","flask","spring","rails","laravel",
        "sql","postgres","postgresql","mysql","mongodb","redis","graphql","prisma",
        "docker","kubernetes","aws","gcp","azure","tailwind","sass","scss",
        "jest","vitest","cypress","playwright","pytest",
      ];
      return NAMED_TECH.some((t) => pl.includes(t));
    },
  },

  // System architecture → minimum Premium
  // Requires explicit architecture / system-design language, NOT just "scalability" alone
  // (which also appears in business/evaluation contexts and belongs at Balanced).
  {
    id: "safety_architecture",
    minTier: MODEL_TIERS.PREMIUM,
    test: (p) =>
      /\b(architect(ure)?|system design|microservices?|distributed system|design pattern)\b/i.test(
        p,
      ) ||
      (/\b(scalab(le|ility)|high.availability|fault.tolerant|distributed)\b/i.test(
        p,
      ) &&
        /\b(system|infrastructure|service|backend|platform|deploy|cluster|server)\b/i.test(
          p,
        )),
  },

  // Data visualization / chart creation → minimum Balanced
  // "visualize the data as a chart" is a non-trivial analytical task
  {
    id: "safety_visualization",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(visualize|visualise|plot|render|draw|display|chart|graph|diagram|visualization)\b/i.test(p) &&
      /\b(data|chart|graph|diagram|dataset|metric|result|figure|table|trend|distribution)\b/i.test(p)
  },

  // Multi-file / full project → minimum Balanced
  {
    id: "safety_multifile",
    minTier: MODEL_TIERS.BALANCED,
    test: (p) =>
      /\b(multi-?file|multiple files?|full-?stack|fullstack|entire (app|project|codebase)|whole (app|project))\b/i.test(
        p,
      ),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 4 — THRESHOLDS AND TIER METADATA
// ═════════════════════════════════════════════════════════════════════════════

const TIER_THRESHOLDS = [
  { min: 9, tier: MODEL_TIERS.PREMIUM },
  { min: 3, tier: MODEL_TIERS.BALANCED },
  { min: -999, tier: MODEL_TIERS.LIGHTWEIGHT },
];

// Human-readable tier metadata for the output object
const TIER_META = {
  [MODEL_TIERS.LIGHTWEIGHT]: { tier: "lightweight", model: "Haiku 4.5" },
  [MODEL_TIERS.BALANCED]: { tier: "balanced", model: "Sonnet 4.6" },
  [MODEL_TIERS.PREMIUM]: { tier: "premium", model: "Opus 4.7" },
};

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 5 — MAIN CLASSIFIER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Classify a prompt into a model recommendation.
 *
 * @param  {string}  prompt           — raw user input
 * @param  {boolean} adaptiveThinking — whether Adaptive Thinking toggle is on
 *
 * @returns {{
 *   // ── New standardised fields (per spec) ─────────────────────
 *   tier:         "lightweight" | "balanced" | "premium",
 *   model:        "Haiku 4.5" | "Sonnet 4.6" | "Opus 4.7",
 *   score:        number,
 *   confidence:   number,   // 55–99
 *   reasons:      string[], // top-2 human labels for widget
 *   // ── Backward-compat fields (widget.js / main.js) ───────────
 *   reason:       string,   // reasons[0]
 *   totalScore:   number,
 *   firedSignals: Array<{id, label, score, reasons}>,
 * }}
 *
 * NOTE: `tier` is exposed as a numeric MODEL_TIERS.* value via a getter
 * for backward-compat with widget.js, which reads classification.tier
 * as a number and indexes into PROVIDER_RECOMMENDATIONS.
 */
function classifyPrompt(prompt, adaptiveThinking = false, options = {}) {
  // ── Empty / too-short guard ─────────────────────────────────────────────
  if (!prompt || prompt.trim().length < 2) {
    return {
      tier: MODEL_TIERS.LIGHTWEIGHT,
      model: "Haiku 4.5",
      score: 0,
      confidence: 0,
      totalScore: 0,
      reason: "Prompt too short",
      reasons: ["Prompt too short"],
      firedSignals: [],
    };
  }

  // ── PRE-PROCESSING: normalize + typo-correct (uses utils/normalizer.js) ──
  // preprocessPrompt returns three forms of the text:
  //   raw        → original user input (UI display only, never classified)
  //   normalized → lowercase + UK/US spelling unified (e.g. "analyse"→"analyze")
  //   corrected  → normalized + intent-word typos fixed (fed to every signal)
  // Suggestions (e.g. [{original:"anlyze", suggestion:"analyze"}]) are passed
  // through to the output so widget.js can show "Did you mean…?" hints.
  const pre = preprocessPrompt(prompt.trim());
  const p   = pre.corrected; // ← signals run on the clean form

  // ── STEP 1: Run all signals ─────────────────────────────────────────────
  const firedSignals = [];
  let totalScore = 0;

  for (const signal of SIGNALS) {
    const result = signal.detect(p);
    totalScore += result.score;
    if (result.score !== 0 || result.reasons.length > 0) {
      firedSignals.push({
        id: signal.id,
        label: signal.label,
        score: result.score,
        reasons: result.reasons,
      });
    }
  }

  // Adaptive thinking bonus
  if (adaptiveThinking) {
    totalScore += 2;
    firedSignals.push({
      id: "adaptive",
      label: "Adaptive thinking",
      score: 2,
      reasons: ["Adaptive thinking enabled"],
    });
  }

  // ── STEP 2: Map score to tier ───────────────────────────────────────────
  const scoredEntry = TIER_THRESHOLDS.find((t) => totalScore >= t.min);
  let resolvedTier = scoredEntry ? scoredEntry.tier : MODEL_TIERS.LIGHTWEIGHT;

  // ── STEP 3: Apply override rules ────────────────────────────────────────
  const overrideReasonsList = [];

  for (const rule of OVERRIDE_RULES) {
    if (!rule.test(p)) continue;

    if (rule.forceTier !== undefined) {
      resolvedTier = rule.forceTier;
      overrideReasonsList.push(rule.reason);
      firedSignals.push({
        id: rule.id,
        label: rule.label,
        score: 99,
        reasons: [rule.reason],
      });
      break; // forceTier wins
    }

    if (rule.minTier !== undefined && rule.minTier > resolvedTier) {
      resolvedTier = rule.minTier;
      overrideReasonsList.push(rule.reason);
      firedSignals.push({
        id: rule.id,
        label: rule.label,
        score: 50,
        reasons: [rule.reason],
      });
    }
  }

  // ── STEP 4: Apply safety rules (silent floor enforcement) ───────────────
  for (const rule of SAFETY_RULES) {
    if (rule.test(p) && rule.minTier > resolvedTier) {
      resolvedTier = rule.minTier;
      // Safety rules don't add to reasons — they're silent guardrails
    }
  }

  // ── STEP 5: Compute confidence (55–99) ─────────────────────────────────
  let rawConf;
  if (resolvedTier === MODEL_TIERS.LIGHTWEIGHT) {
    rawConf = 0.7 + Math.min(0.28, Math.max(0, (2 - totalScore) * 0.09));
  } else if (resolvedTier === MODEL_TIERS.BALANCED) {
    const mid = 5;
    rawConf = 0.68 + (1 - Math.abs(totalScore - mid) / 5) * 0.22;
  } else {
    rawConf = Math.min(0.99, 0.72 + (totalScore - 9) * 0.022);
  }
  if (overrideReasonsList.length > 0) rawConf = Math.min(0.99, rawConf + 0.08);
  const confidence = Math.round(Math.max(55, Math.min(99, rawConf * 100)));

  // ── STEP 5b: Confidence fallback — avoid confident Lightweight for vague prompts ──
  // If we can't reach 60% confidence, the prompt is ambiguous enough that
  // Balanced is safer than a wrong Lightweight recommendation.
  if (confidence < 60 && resolvedTier === MODEL_TIERS.LIGHTWEIGHT) {
    resolvedTier = MODEL_TIERS.BALANCED;
    overrideReasonsList.unshift("Low confidence — safe recommendation applied");
  }

  // ── STEP 5c: Strict mode — prevent Premium unless signal is strong ──────
  // Strict mode is read from the options passed in (set by widget toggle,
  // persisted in chrome.storage.local / localStorage by widget.js).
  // When ON: Premium requires score ≥ 9 AND at least one hard Premium signal,
  // OR a forceTier override rule fired (which already applies a high bar).
  const strictMode = options && options.strictMode;
  if (strictMode && resolvedTier === MODEL_TIERS.PREMIUM) {
    const hadForceTier = firedSignals.some(s => s.score === 99); // forceTier signals score 99
    const hasStrongPremiumSignal =
      /\b(architect(ure)?|system design|microservices?|distributed system|full-?stack|fullstack|production-ready|complete (app|system|platform)|codebase|entire (project|repo|code)|monitoring|scaling|deployment|refactor.*(system|architecture|codebase)|optimize.*(performance|security))\b/i.test(p);
    if (!hadForceTier && !(totalScore >= 9 && hasStrongPremiumSignal)) {
      resolvedTier = MODEL_TIERS.BALANCED;
      overrideReasonsList.unshift("Strict mode kept this at balanced");
    }
  }

  // ── STEP 6: Build top-2 reasons ─────────────────────────────────────────
  // Override reasons take priority, then highest-scoring signal reasons.
  const signalReasons = [...firedSignals]
    .filter((s) => s.score !== 99 && s.score !== 50)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .flatMap((s) => s.reasons)
    .filter(Boolean);

  const allReasons = [...overrideReasonsList, ...signalReasons];
  const reasons = [...new Set(allReasons)].slice(0, 2);
  const reason =
    reasons[0] ||
    (adaptiveThinking ? "Adaptive thinking enabled" : "General request");

  // ── STEP 7: UI safety hint — lightweight + mild tech terms ──────────────
  // Used by the widget to show "Consider upgrading if results feel too shallow."
  // Only fires when the final tier is Lightweight and mild tech is present.
  const hasTechHint =
    resolvedTier === MODEL_TIERS.LIGHTWEIGHT &&
    /\b(code|function|react|python|api|sql|bug|script|class|component|module|node|vue|angular|typescript|javascript|docker|database|query|endpoint|hook|redux|graphql)\b/i.test(p);

  // ── STEP 8: Assemble output ─────────────────────────────────────────────
  const meta = TIER_META[resolvedTier];

  // The `tier` property is exposed as a numeric MODEL_TIERS.* value so that
  // widget.js can index into PROVIDER_RECOMMENDATIONS[provider][tier].
  // The string version is available as `meta.tier` / result.tierString.
  return {
    // Numeric tier for widget.js backward-compat
    tier: resolvedTier,
    // New spec fields
    model: meta.model,
    tierString: meta.tier,
    score: totalScore,
    confidence,
    reasons,
    // Backward-compat fields
    reason,
    totalScore,
    firedSignals,
    // Typo / spelling suggestions for the widget hint layer
    // Each entry: { original: string, suggestion: string, distance: number }
    suggestions: pre.suggestions,
    // UI safety hint — show "consider upgrading" nudge when lightweight + tech terms
    hasTechHint,
  };
}
