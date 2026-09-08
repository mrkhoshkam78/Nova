/**
 * Nova Debugging Algorithm – evidence-based, staged, no fake execution.
 * Independent of UI. LLM is only a reasoning aid over collected evidence.
 */
const Debugger = window.Debugger = (() => {
  const STATES = Object.freeze({
    IDLE: "IDLE",
    INPUT_COLLECTED: "INPUT_COLLECTED",
    CLASSIFIED: "CLASSIFIED",
    ANALYZING: "ANALYZING",
    EVIDENCE_COLLECTED: "EVIDENCE_COLLECTED",
    LOCALIZED: "LOCALIZED",
    HYPOTHESIZED: "HYPOTHESIZED",
    VALIDATING: "VALIDATING",
    ROOT_CAUSE_IDENTIFIED: "ROOT_CAUSE_IDENTIFIED",
    FIX_GENERATED: "FIX_GENERATED",
    FIX_VALIDATED: "FIX_VALIDATED",
    RESOLVED: "RESOLVED",
    INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
    UNSUPPORTED_LANGUAGE: "UNSUPPORTED_LANGUAGE",
    ANALYSIS_FAILED: "ANALYSIS_FAILED",
    EXECUTION_UNAVAILABLE: "EXECUTION_UNAVAILABLE",
    PARTIALLY_RESOLVED: "PARTIALLY_RESOLVED",
  });

  const TRANSITIONS = {
    IDLE: ["INPUT_COLLECTED"],
    INPUT_COLLECTED: ["CLASSIFIED", "INSUFFICIENT_EVIDENCE"],
    CLASSIFIED: ["ANALYZING", "INSUFFICIENT_EVIDENCE"],
    ANALYZING: ["EVIDENCE_COLLECTED", "ANALYSIS_FAILED", "UNSUPPORTED_LANGUAGE"],
    EVIDENCE_COLLECTED: ["LOCALIZED", "INSUFFICIENT_EVIDENCE"],
    LOCALIZED: ["HYPOTHESIZED"],
    HYPOTHESIZED: ["VALIDATING", "ROOT_CAUSE_IDENTIFIED", "INSUFFICIENT_EVIDENCE"],
    VALIDATING: ["ROOT_CAUSE_IDENTIFIED", "HYPOTHESIZED", "INSUFFICIENT_EVIDENCE"],
    ROOT_CAUSE_IDENTIFIED: ["FIX_GENERATED", "PARTIALLY_RESOLVED"],
    FIX_GENERATED: ["FIX_VALIDATED", "EXECUTION_UNAVAILABLE"],
    FIX_VALIDATED: ["RESOLVED", "PARTIALLY_RESOLVED", "HYPOTHESIZED"],
    RESOLVED: ["IDLE"],
    INSUFFICIENT_EVIDENCE: ["INPUT_COLLECTED", "IDLE"],
    UNSUPPORTED_LANGUAGE: ["IDLE"],
    ANALYSIS_FAILED: ["IDLE", "INPUT_COLLECTED"],
    EXECUTION_UNAVAILABLE: ["PARTIALLY_RESOLVED", "FIX_VALIDATED"],
    PARTIALLY_RESOLVED: ["HYPOTHESIZED", "IDLE"],
  };

  let sessionIdSeq = 0;
  let sessions = {};

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + (++sessionIdSeq);
  }

  function createSession(input) {
    const id = uid("dbg");
    const session = {
      id,
      state: STATES.IDLE,
      createdAt: Date.now(),
      input: {
        sourceCode: input.sourceCode || null,
        files: input.files || [],
        errorMessage: input.errorMessage || null,
        stackTrace: input.stackTrace || null,
        userDescription: input.userDescription || null,
        expectedBehavior: input.expectedBehavior || null,
        actualBehavior: input.actualBehavior || null,
      },
      classification: null,
      evidence: [],
      localization: null,
      hypotheses: [],
      rootCause: null,
      fix: null,
      validation: null,
      runtimeAvailable: false,
      limitations: [],
    };
    sessions[id] = session;
    transition(session, STATES.INPUT_COLLECTED);
    return session;
  }

  function transition(session, next) {
    const allowed = TRANSITIONS[session.state] || [];
    if (!allowed.includes(next) && session.state !== next) {
      // allow same-state no-op
      if (session.state !== next) {
        session.limitations.push("Invalid transition " + session.state + " → " + next + " (forced for recovery)");
      }
    }
    session.state = next;
    return session;
  }

  function addEvidence(session, ev) {
    const item = {
      id: uid("ev"),
      source: ev.source || "unknown",
      file: ev.file || null,
      line: ev.line != null ? ev.line : null,
      column: ev.column != null ? ev.column : null,
      relatedCode: ev.relatedCode || null,
      message: ev.message || "",
      reliability: ev.reliability || "possible", // confirmed | high | possible | weak
      kind: ev.kind || "finding",
    };
    session.evidence.push(item);
    return item;
  }

  // ---------- PHASE 1–2 classification ----------
  function classify(session) {
    const inp = session.input;
    const text = [inp.errorMessage, inp.stackTrace, inp.userDescription, inp.sourceCode]
      .filter(Boolean)
      .join("\n");

    let failureType = "Unknown Failure";
    if (/SyntaxError|ParseError|unexpected token|invalid syntax/i.test(text)) failureType = "Syntax Failure";
    else if (/Cannot find module|ModuleNotFound|import error|dependency/i.test(text)) failureType = "Dependency Failure";
    else if (/TypeError|ReferenceError|NullPointer|undefined is not|AttributeError|KeyError|IndexError/i.test(text)) failureType = "Runtime Failure";
    else if (/Timeout|ECONNREFUSED|fetch failed|network|CORS|HTTP \d{3}/i.test(text)) failureType = "Network/API Failure";
    else if (/deadlock|race condition|await|promise|async/i.test(text)) failureType = "Async Failure";
    else if (/permission|xss|injection|secret|token/i.test(text)) failureType = "Security Failure";
    else if (/slow|performance|memory leak|OOM/i.test(text)) failureType = "Performance Failure";
    else if (/assert|expected|should have|logic/i.test(text)) failureType = "Logic Failure";
    else if (/state|not updated|stale|render/i.test(text)) failureType = "State Failure";
    else if (/build failed|compile error|tsc|webpack/i.test(text)) failureType = "Build Failure";

    const expected = inp.expectedBehavior || "Not specified by user";
    const actual = inp.actualBehavior || inp.errorMessage || "Failure observed (details in evidence)";

    session.classification = {
      failureType,
      expectedBehavior: expected,
      actualBehavior: actual,
      hasStackTrace: !!inp.stackTrace,
      hasCode: !!(inp.sourceCode || (inp.files && inp.files.length)),
      hasErrorMessage: !!inp.errorMessage,
    };

    if (!session.classification.hasCode && !session.classification.hasErrorMessage && !inp.userDescription) {
      transition(session, STATES.INSUFFICIENT_EVIDENCE);
      return session;
    }
    transition(session, STATES.CLASSIFIED);
    return session;
  }

  // ---------- Stack trace parse ----------
  function parseStackTrace(stack) {
    if (!stack) return [];
    const frames = [];
    const lines = String(stack).split(/\r?\n/);
    lines.forEach((line, idx) => {
      // JS: at fn (file:line:col)  or  at file:line:col
      let m = line.match(/at\s+(?:(.+?)\s+\()?((?:https?:\/\/|file:\/\/|\/)?[^):\s]+):(\d+)(?::(\d+))?\)?/);
      if (!m) {
        // Python: File "x.py", line N, in fn
        m = line.match(/File\s+\"([^\"]+)\",\s+line\s+(\d+)(?:,\s+in\s+(\S+))?/i);
        if (m) {
          frames.push({
            raw: line.trim(),
            functionName: m[3] || null,
            file: m[1],
            line: parseInt(m[2], 10),
            column: null,
            isExternal: /site-packages|node_modules|lib\/python|webpack|node:internal/i.test(m[1]),
            index: idx,
          });
          return;
        }
      } else {
        const file = m[2];
        frames.push({
          raw: line.trim(),
          functionName: m[1] || null,
          file,
          line: parseInt(m[3], 10),
          column: m[4] ? parseInt(m[4], 10) : null,
          isExternal: /node_modules|node:internal|webpack|vendor\//i.test(file),
          index: idx,
        });
      }
    });
    return frames;
  }

  function extractErrorMessage(text) {
    if (!text) return null;
    const m = String(text).match(/(?:Error|Exception|TypeError|ReferenceError|SyntaxError|AttributeError|KeyError|IndexError)[:\s]+([^\n]+)/i);
    return m ? m[0].trim() : null;
  }

  // ---------- PHASE 4 evidence ----------
  function collectEvidence(session) {
    transition(session, STATES.ANALYZING);
    const inp = session.input;
    session.evidence = [];

    if (inp.errorMessage) {
      addEvidence(session, {
        source: "user_error_message",
        message: inp.errorMessage,
        reliability: "high",
        kind: "runtime_error",
      });
    }

    const errFromText = extractErrorMessage(inp.stackTrace || inp.userDescription || "");
    if (errFromText) {
      addEvidence(session, {
        source: "parsed_error",
        message: errFromText,
        reliability: "high",
        kind: "runtime_error",
      });
    }

    const frames = parseStackTrace(inp.stackTrace || "");
    frames.forEach((f) => {
      addEvidence(session, {
        source: "stack_trace",
        file: f.file,
        line: f.line,
        column: f.column,
        message: f.raw,
        reliability: f.isExternal ? "possible" : "high",
        kind: f.isExternal ? "external_frame" : "application_frame",
        relatedCode: f.functionName,
      });
    });

    // Static analysis on files / source
    const files = inp.files && inp.files.length
      ? inp.files
      : inp.sourceCode
        ? [{ name: "snippet", content: inp.sourceCode, language: (typeof Upload !== "undefined" && Upload.detectLanguage ? Upload.detectLanguage("snippet.py", inp.sourceCode) : "text") }]
        : [];

    files.forEach((f) => {
      if (window.Analysis) {
        const report = Analysis.analyze(f);
        report.issues.forEach((iss) => {
          addEvidence(session, {
            source: "static_analysis",
            file: f.name,
            line: iss.line,
            message: iss.message,
            reliability: iss.severity === "confirmed" ? "confirmed" : iss.severity === "likely" ? "high" : "possible",
            kind: "static_finding",
            relatedCode: null,
          });
        });
      }
      // Syntax-ish checks
      if (f.language === "python" && /def\s+\w+\([^)]*$/m.test(f.content || "")) {
        addEvidence(session, {
          source: "static_analysis",
          file: f.name,
          message: "Possible unclosed function signature / syntax issue",
          reliability: "possible",
          kind: "parser_hint",
        });
      }
      if ((f.language === "javascript" || f.language === "typescript") && ((f.content || "").split("{").length !== (f.content || "").split("}").length)) {
        addEvidence(session, {
          source: "static_analysis",
          file: f.name,
          message: "Unbalanced braces { }",
          reliability: "high",
          kind: "parser_hint",
        });
      }
    });

    if (inp.userDescription) {
      addEvidence(session, {
        source: "user_description",
        message: inp.userDescription,
        reliability: "possible",
        kind: "user_report",
      });
    }

    if (!session.evidence.length) {
      transition(session, STATES.INSUFFICIENT_EVIDENCE);
      session.limitations.push("No structured evidence could be collected.");
      return session;
    }

    transition(session, STATES.EVIDENCE_COLLECTED);
    return session;
  }

  // ---------- PHASE 5 localization ----------
  function localize(session) {
    const appFrames = session.evidence.filter((e) => e.kind === "application_frame");
    const staticHits = session.evidence.filter((e) => e.kind === "static_finding" || e.kind === "parser_hint");

    let primary = null;
    if (appFrames.length) {
      // First non-external frame (already filtered) – top of relevant stack is starting point only
      primary = appFrames[0];
    } else if (staticHits.length) {
      primary = staticHits.sort((a, b) => {
        const rank = { confirmed: 3, high: 2, possible: 1, weak: 0 };
        return (rank[b.reliability] || 0) - (rank[a.reliability] || 0);
      })[0];
    }

    session.localization = {
      errorLocation: primary
        ? { file: primary.file, line: primary.line, message: primary.message, evidenceId: primary.id }
        : null,
      note: "Error location is a starting point, not the root cause.",
      applicationFrameCount: appFrames.length,
      staticFindingCount: staticHits.length,
    };

    transition(session, STATES.LOCALIZED);
    return session;
  }

  // ---------- PHASE 6–8 hypotheses ----------
  function reliabilityScore(r) {
    return { confirmed: 1.0, high: 0.8, possible: 0.5, weak: 0.25 }[r] || 0.3;
  }

  function generateHypotheses(session) {
    const hyps = [];
    const ft = (session.classification && session.classification.failureType) || "Unknown Failure";
    const loc = session.localization && session.localization.errorLocation;

    // H1: failure at reported location (symptom proximity) – lower confidence by design
    if (loc) {
      hyps.push({
        id: uid("hyp"),
        label: "Hypothesis A – Failure originates near reported location",
        suspectedCause: "Defect near the reported error location (symptom proximity).",
        region: { file: loc.file, line: loc.line },
        supportingEvidenceIds: [loc.evidenceId].filter(Boolean),
        contradictingEvidenceIds: [],
        requiredValidation: "Confirm with data/control flow above this frame; do not treat location as root cause without more evidence.",
        confidence: 0.45,
        scores: { proximity: 0.9, evidence: 0.4, stack: 0.6, dataFlow: 0.2, controlFlow: 0.2 },
      });
    }

    // H2: from strongest static/runtime evidence
    const strong = session.evidence
      .filter((e) => e.reliability === "confirmed" || e.reliability === "high")
      .slice(0, 5);
    if (strong.length) {
      const top = strong[0];
      hyps.push({
        id: uid("hyp"),
        label: "Hypothesis B – Strong static/runtime evidence",
        suspectedCause: top.message,
        region: { file: top.file, line: top.line },
        supportingEvidenceIds: strong.map((e) => e.id),
        contradictingEvidenceIds: [],
        requiredValidation: "Re-run static analysis after fix; runtime validation unavailable unless user executes.",
        confidence: Math.min(0.88, 0.55 + strong.length * 0.08),
        scores: {
          proximity: loc && top.line === loc.line ? 0.7 : 0.4,
          evidence: reliabilityScore(top.reliability),
          stack: top.kind === "application_frame" ? 0.8 : 0.3,
          dataFlow: 0.4,
          controlFlow: 0.4,
        },
      });
    }

    // H3: failure-type specific
    if (/Null|undefined|None|AttributeError|TypeError/i.test(JSON.stringify(session.evidence))) {
      hyps.push({
        id: uid("hyp"),
        label: "Hypothesis C – Missing null/empty guard",
        suspectedCause: "Value may be null/undefined/None before use; guard missing on data path leading to failure point.",
        region: loc ? { file: loc.file, line: loc.line } : null,
        supportingEvidenceIds: session.evidence.filter((e) => /null|undefined|None|TypeError|AttributeError/i.test(e.message)).map((e) => e.id),
        contradictingEvidenceIds: [],
        requiredValidation: "Trace data flow of the value into the failure site.",
        confidence: 0.62,
        scores: { proximity: 0.5, evidence: 0.6, stack: 0.5, dataFlow: 0.85, controlFlow: 0.5 },
      });
    }

    if (ft === "Dependency Failure") {
      hyps.push({
        id: uid("hyp"),
        label: "Hypothesis – Missing or misconfigured dependency",
        suspectedCause: "Import/module path or package not available in runtime environment.",
        region: null,
        supportingEvidenceIds: session.evidence.filter((e) => /module|import|dependency/i.test(e.message)).map((e) => e.id),
        contradictingEvidenceIds: [],
        requiredValidation: "Verify installed packages and import paths.",
        confidence: 0.7,
        scores: { proximity: 0.3, evidence: 0.7, stack: 0.4, dataFlow: 0.2, controlFlow: 0.2 },
      });
    }

    if (ft === "Syntax Failure") {
      hyps.push({
        id: uid("hyp"),
        label: "Hypothesis – Syntax/parser error",
        suspectedCause: "Code does not parse; fix syntax before logic analysis.",
        region: loc ? { file: loc.file, line: loc.line } : null,
        supportingEvidenceIds: session.evidence.filter((e) => /syntax|parse|token|brace/i.test(e.message)).map((e) => e.id),
        contradictingEvidenceIds: [],
        requiredValidation: "Re-parse after edit.",
        confidence: 0.85,
        scores: { proximity: 0.8, evidence: 0.85, stack: 0.2, dataFlow: 0.1, controlFlow: 0.1 },
      });
    }

    if (!hyps.length) {
      hyps.push({
        id: uid("hyp"),
        label: "Hypothesis – Insufficient evidence",
        suspectedCause: "Not enough evidence to rank a concrete root cause.",
        region: null,
        supportingEvidenceIds: [],
        contradictingEvidenceIds: [],
        requiredValidation: "Provide stack trace, error message, and relevant code.",
        confidence: 0.2,
        scores: { proximity: 0, evidence: 0.1, stack: 0, dataFlow: 0, controlFlow: 0 },
      });
    }

    // Rank: weighted score
    hyps.forEach((h) => {
      const s = h.scores || {};
      const weighted =
        (s.proximity || 0) * 0.15 +
        (s.evidence || 0) * 0.35 +
        (s.stack || 0) * 0.2 +
        (s.dataFlow || 0) * 0.15 +
        (s.controlFlow || 0) * 0.15;
      // Prefer evidence-heavy over pure proximity (symptom ≠ root cause)
      h.confidence = Math.round(Math.min(0.95, Math.max(h.confidence, weighted)) * 100) / 100;
      h.confidenceLabel =
        h.confidence >= 0.9 ? "CONFIRMED/EXTREME" :
        h.confidence >= 0.7 ? "HIGH" :
        h.confidence >= 0.4 ? "POSSIBLE" : "WEAK";
    });

    hyps.sort((a, b) => b.confidence - a.confidence);
    session.hypotheses = hyps;
    transition(session, STATES.HYPOTHESIZED);
    return session;
  }

  function selectRootCause(session) {
    if (!session.hypotheses.length) {
      transition(session, STATES.INSUFFICIENT_EVIDENCE);
      return session;
    }
    const top = session.hypotheses[0];
    if (top.confidence < 0.4) {
      transition(session, STATES.INSUFFICIENT_EVIDENCE);
      session.rootCause = {
        hypothesisId: top.id,
        summary: top.suspectedCause,
        confidence: top.confidence,
        confidenceLabel: top.confidenceLabel,
        minimumRootCauseCandidate: top.suspectedCause,
        causalChain: [
          "Insufficient evidence",
          "Symptom observed",
          "Root cause not confirmed",
        ],
        note: "Highest-ranked hypothesis is weak; need more evidence.",
      };
      return session;
    }

    session.rootCause = {
      hypothesisId: top.id,
      summary: top.suspectedCause,
      confidence: top.confidence,
      confidenceLabel: top.confidenceLabel,
      region: top.region,
      supportingEvidenceIds: top.supportingEvidenceIds,
      minimumRootCauseCandidate: top.suspectedCause,
      causalChain: [
        "Suspected root: " + top.suspectedCause,
        "Leads to invalid state / bad data / missing dependency",
        "Propagates to failure point" + (top.region && top.region.line ? " (near line " + top.region.line + ")" : ""),
        "Visible symptom: " + ((session.classification && session.classification.actualBehavior) || "error"),
      ],
      note: session.runtimeAvailable
        ? "Runtime may further confirm."
        : "Static evidence only — not a confirmed runtime proof.",
    };
    transition(session, STATES.ROOT_CAUSE_IDENTIFIED);
    return session;
  }

  // ---------- PHASE 11–12 fix ----------
  function generateFix(session) {
    if (!session.rootCause || session.rootCause.confidence < 0.4) {
      session.fix = null;
      session.limitations.push("No fix generated: root cause confidence too low.");
      transition(session, STATES.PARTIALLY_RESOLVED);
      return session;
    }
    const rc = session.rootCause;
    const ft = session.classification.failureType;
    let strategy = "Add defensive checks and validate inputs on the path to the failure point.";
    let patchHint = "// Add null/empty checks before use\n// Validate inputs at boundaries\n";

    if (ft === "Syntax Failure") {
      strategy = "Correct syntax so the file parses; then re-run analysis.";
      patchHint = "# Fix syntax at the reported parser location, then re-analyze.\n";
    } else if (ft === "Dependency Failure") {
      strategy = "Install/fix import path for the missing module.";
      patchHint = "# e.g. pip install <package>  OR  correct import path\n";
    } else if (/null|undefined|None/i.test(rc.summary)) {
      strategy = "Guard against null/undefined before property/index access.";
      patchHint = "if (value == null) {\n  // handle missing value\n  return;\n}\n";
    }

    session.fix = {
      strategy,
      patchHint,
      targetsFailure: ft,
      relatedRootCause: rc.summary,
      regressionRisk: "Medium — review callers of the changed path.",
      status: "suggested", // never "confirmed" without runtime
      note: "Suggested Fix based on static evidence. Not validated by execution.",
    };
    transition(session, STATES.FIX_GENERATED);
    return session;
  }

  function validateFix(session) {
    if (!session.fix) {
      transition(session, STATES.EXECUTION_UNAVAILABLE);
      return session;
    }
    session.validation = {
      syntaxRecheck: "not_run_without_patch_application",
      staticRecheck: "pending_user_apply",
      runtimeRecheck: session.runtimeAvailable ? "available" : "unavailable",
      status: session.runtimeAvailable ? "partial" : "suggested_only",
    };
    session.limitations.push("No runtime sandbox: fix cannot be confirmed by re-execution.");
    transition(session, STATES.FIX_VALIDATED);
    transition(session, STATES.PARTIALLY_RESOLVED);
    return session;
  }

  // ---------- Full pipeline ----------
  function run(input) {
    const session = createSession(input || {});
    classify(session);
    if (session.state === STATES.INSUFFICIENT_EVIDENCE) return finalize(session);

    collectEvidence(session);
    if (session.state === STATES.INSUFFICIENT_EVIDENCE || session.state === STATES.ANALYSIS_FAILED) {
      return finalize(session);
    }

    localize(session);
    generateHypotheses(session);
    selectRootCause(session);
    if (session.state !== STATES.ROOT_CAUSE_IDENTIFIED) return finalize(session);

    generateFix(session);
    if (session.state === STATES.FIX_GENERATED) validateFix(session);

    return finalize(session);
  }

  function finalize(session) {
    session.finishedAt = Date.now();
    return session;
  }

  function formatReport(session) {
    const lines = [];
    const c = session.classification || {};
    const rc = session.rootCause;

    lines.push("## Failure Summary");
    lines.push("- **Failure type:** " + (c.failureType || "Unknown"));
    lines.push("- **Expected:** " + (c.expectedBehavior || "—"));
    lines.push("- **Actual:** " + (c.actualBehavior || "—"));
    lines.push("- **Session state:** `" + session.state + "`");
    lines.push("");

    lines.push("## Detected Symptom");
    const symptoms = session.evidence.filter((e) => e.kind === "runtime_error" || e.source === "user_error_message");
    if (symptoms.length) symptoms.forEach((s) => lines.push("- " + s.message));
    else lines.push("- (from user description / code context)");
    lines.push("");

    if (session.localization && session.localization.errorLocation) {
      const loc = session.localization.errorLocation;
      lines.push("## Error Location (starting point only)");
      lines.push("- " + (loc.file || "?") + (loc.line != null ? ":" + loc.line : ""));
      lines.push("- _" + session.localization.note + "_");
      lines.push("");
    }

    lines.push("## Most Likely Root Cause");
    if (rc) {
      lines.push("- " + rc.summary);
      lines.push("- **Confidence:** " + rc.confidence + " (" + rc.confidenceLabel + ")");
      if (rc.note) lines.push("- _" + rc.note + "_");
    } else {
      lines.push("- Not identified (insufficient evidence)");
    }
    lines.push("");

    lines.push("## Evidence");
    session.evidence.slice(0, 12).forEach((e) => {
      const loc = [e.file, e.line].filter((x) => x != null).join(":");
      lines.push("- **[" + e.reliability + "]** " + (loc ? loc + " — " : "") + e.message + " _(" + e.source + ")_");
    });
    lines.push("");

    if (rc && rc.causalChain) {
      lines.push("## Causal Chain");
      rc.causalChain.forEach((step, i) => lines.push((i + 1) + ". " + step));
      lines.push("");
    }

    lines.push("## Alternative Hypotheses");
    (session.hypotheses || []).slice(0, 4).forEach((h, i) => {
      lines.push((i + 1) + ". **" + h.label + "** — confidence " + h.confidence + " (" + h.confidenceLabel + ")");
      lines.push("   - " + h.suspectedCause);
    });
    lines.push("");

    lines.push("## Suggested Fix");
    if (session.fix) {
      lines.push("- **Strategy:** " + session.fix.strategy);
      lines.push("- **Status:** " + session.fix.status + " (not runtime-confirmed)");
      lines.push("- **Regression risk:** " + session.fix.regressionRisk);
      lines.push("```");
      lines.push(session.fix.patchHint.trim());
      lines.push("```");
      lines.push("- _" + session.fix.note + "_");
    } else {
      lines.push("- No fix suggested yet.");
    }
    lines.push("");

    lines.push("## Validation Status");
    if (session.validation) {
      lines.push("- Runtime: " + session.validation.runtimeRecheck);
      lines.push("- Status: " + session.validation.status);
    } else {
      lines.push("- Not validated");
    }
    lines.push("");

    lines.push("## Limitations");
    const lim = session.limitations.length
      ? session.limitations
      : ["No code execution sandbox — results are static/evidence-based only."];
    lim.forEach((l) => lines.push("- " + l));

    return lines.join("\n");
  }

  /** Build LLM context block without inventing evidence */
  function toLlmContext(session) {
    return {
      DEBUG_SESSION: session.id,
      STATE: session.state,
      FAILURE_TYPE: session.classification && session.classification.failureType,
      EXPECTED_BEHAVIOR: session.classification && session.classification.expectedBehavior,
      ACTUAL_BEHAVIOR: session.classification && session.classification.actualBehavior,
      EVIDENCE: session.evidence.map((e) => ({
        id: e.id,
        source: e.source,
        file: e.file,
        line: e.line,
        message: e.message,
        reliability: e.reliability,
      })),
      ROOT_CAUSE_HYPOTHESES: (session.hypotheses || []).map((h) => ({
        id: h.id,
        cause: h.suspectedCause,
        confidence: h.confidence,
        supporting: h.supportingEvidenceIds,
      })),
      CONSTRAINTS: [
        "Do not invent execution results",
        "Do not claim confirmation without evidence",
        "Separate symptom from root cause",
        "Error location is not automatically the root cause",
      ],
    };
  }


  /**
   * Built-in sample bug cases for demos and tests (no network).
   */
  const SAMPLE_CASES = [
    {
      id: "py-indexerror",
      title: "Python IndexError on empty list",
      language: "python",
      sourceCode: "def first_item(items):\n    # Bug: no empty check\n    return items[0]\n\nprint(first_item([]))\n",
      errorMessage: "IndexError: list index out of range",
      stackTrace: 'Traceback (most recent call last):\n  File "main.py", line 5, in <module>\n    print(first_item([]))\n  File "main.py", line 3, in first_item\n    return items[0]\nIndexError: list index out of range',
      userDescription: "Crashes when the list is empty",
      expectedBehavior: "Return None or raise a clear ValueError",
      actualBehavior: "IndexError on items[0]",
    },
    {
      id: "js-null-access",
      title: "JS TypeError on null property",
      language: "javascript",
      sourceCode: "function getName(user) {\n  // Bug: user may be null\n  return user.name.toUpperCase();\n}\n\nconsole.log(getName(null));\n",
      errorMessage: "TypeError: Cannot read properties of null (reading 'name')",
      stackTrace: "TypeError: Cannot read properties of null (reading 'name')\n    at getName (app.js:3:15)\n    at main (app.js:6:13)",
      userDescription: "Fails when user is null",
      expectedBehavior: "Handle null user safely",
      actualBehavior: "TypeError on user.name",
    },
    {
      id: "py-none-compare",
      title: "Python None comparison smell",
      language: "python",
      sourceCode: "def is_missing(value):\n    if value == None:  # should use 'is None'\n        return True\n    return False\n",
      errorMessage: null,
      stackTrace: null,
      userDescription: "Static review: possible None comparison issue",
      expectedBehavior: "Idiomatic None checks",
      actualBehavior: "Uses == None",
    },
    {
      id: "js-loose-eq",
      title: "JS loose equality",
      language: "javascript",
      sourceCode: "function isZero(n) {\n  if (n == 0) return true; // loose equality\n  return false;\n}\n\nisZero('');\n",
      errorMessage: null,
      stackTrace: null,
      userDescription: "Logic bug: empty string becomes 0 with ==",
      expectedBehavior: "Only numeric zero is true",
      actualBehavior: "'' == 0 is true",
    },
  ];

  function getSamples() {
    return SAMPLE_CASES.map((s) => ({ id: s.id, title: s.title, language: s.language }));
  }

  function runSample(sampleId) {
    const s = SAMPLE_CASES.find((x) => x.id === sampleId);
    if (!s) throw new Error("Unknown sample: " + sampleId);
    return run({
      sourceCode: s.sourceCode,
      files: [{ name: "sample." + (s.language === "python" ? "py" : "js"), content: s.sourceCode, language: s.language }],
      errorMessage: s.errorMessage,
      stackTrace: s.stackTrace,
      userDescription: s.userDescription,
      expectedBehavior: s.expectedBehavior,
      actualBehavior: s.actualBehavior,
    });
  }


    function shouldRunDebugger(intent) {
    return intent === "debug" || intent === "bug-report";
  }

  return {
    STATES,
    createSession,
    run,
    formatReport,
    toLlmContext,
    shouldRunDebugger,
    getSamples,
    runSample,
    getSession: (id) => sessions[id] || null,
  };
})();
