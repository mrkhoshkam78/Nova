/**
 * Code Intelligence client – prefers backend Code Engine, falls back to local heuristics.
 * No fake AST. Capabilities reported honestly.
 */
const Analysis = window.Analysis = (() => {
  const ENGINE_VERSION = "1.0.0";

  function localPython(code) {
    const issues = [];
    const lines = code.split(/\r?\n/);
    lines.forEach((line, i) => {
      const n = i + 1;
      if (/\btab\b|\t/.test(line) && line.includes("    ")) {
        issues.push({ severity: "possible", line: n, message: "Mixed tabs/spaces indentation.", analysisSource: "heuristic" });
      }
      if (/except\s*:/.test(line)) {
        issues.push({ severity: "likely", line: n, message: "Bare except: catches all exceptions.", analysisSource: "heuristic" });
      }
      if (/==\s*None|!=\s*None/.test(line)) {
        issues.push({ severity: "likely", line: n, message: "Use 'is None' / 'is not None' instead of ==.", analysisSource: "heuristic" });
      }
    });
    return issues;
  }

  function localJavaScript(code) {
    const issues = [];
    const lines = code.split(/\r?\n/);
    lines.forEach((line, i) => {
      const n = i + 1;
      if (/\bvar\s+/.test(line)) {
        issues.push({ severity: "possible", line: n, message: "Prefer const/let over var.", analysisSource: "heuristic" });
      }
      if (/==(?!=)/.test(line) && !/===/.test(line)) {
        issues.push({ severity: "likely", line: n, message: "Use === instead of ==.", analysisSource: "heuristic" });
      }
      if (/\beval\s*\(/.test(line)) {
        issues.push({ severity: "confirmed", line: n, message: "eval() is dangerous.", analysisSource: "heuristic" });
      }
    });
    if ((code.split("{").length !== code.split("}").length)) {
      issues.push({ severity: "high", line: null, message: "Unbalanced braces { }.", analysisSource: "parser" });
    }
    return issues;
  }

  function localGeneric(code) {
    const issues = [];
    if (code.length > 50000) {
      issues.push({ severity: "possible", line: null, message: "Very large file; analysis is shallow.", analysisSource: "heuristic" });
    }
    if (/password\s*=\s*['\"][^'\"]+['\"]|api[_-]?key\s*=\s*['\"][^'\"]+['\"]/i.test(code)) {
      issues.push({ severity: "likely", line: null, message: "Possible hard-coded secret.", analysisSource: "heuristic" });
    }
    return issues;
  }

  /**
   * Local fallback (no network). Honest: no real AST.
   */
  function analyzeLocal(file) {
    const code = (file && file.content) || "";
    const language = (file && file.language) || "text";
    const kind = (file && file.kind) || "text";
    const lineCount = code ? code.split(/\r?\n/).length : 0;
    let issues = localGeneric(code);
    if (language === "python") issues = issues.concat(localPython(code));
    if (language === "javascript" || language === "typescript") issues = issues.concat(localJavaScript(code));

    const seen = new Set();
    issues = issues.filter((x) => {
      const k = x.message + ":" + x.line;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const confirmed = issues.filter((i) => i.severity === "confirmed").length;
    const likely = issues.filter((i) => i.severity === "likely" || i.severity === "high").length;
    const possible = issues.filter((i) => i.severity === "possible").length;

    return {
      language,
      kind,
      lineCount,
      issues,
      summary: { confirmed, likely, possible, total: issues.length },
      engine: "local-heuristic",
      engineVersion: ENGINE_VERSION,
      capabilities: {
        has_parser: false,
        has_ast: false,
        notes: ["Local fallback only – no real AST in browser without backend"],
      },
      evidence: issues.map((iss, idx) => ({
        id: "loc_" + idx,
        source: iss.analysisSource || "heuristic",
        message: iss.message,
        reliability: iss.severity,
        file: file && file.name,
        line: iss.line,
      })),
    };
  }

  /**
   * Prefer backend Code Engine when gateway is reachable.
   */
  async function analyzeRemote(file) {
    const base = (window.AppConfig && AppConfig.api && AppConfig.api.baseUrl) || "http://127.0.0.1:8000";
    const body = {
      content: file.content || "",
      file_name: file.name || null,
      mime: file.type || null,
      language_hint: file.language || null,
    };
    const resp = await fetch(base.replace(/\/$/, "") + "/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error("Analyze API " + resp.status + ": " + t);
    }
    const data = await resp.json();
    if (!data.ok || !data.result) throw new Error("Invalid analyze response");
    const r = data.result;
    const findings = r.findings || [];
    const issues = findings.map((f) => ({
      severity: f.severity || "possible",
      line: f.location && f.location.line != null ? f.location.line : null,
      message: f.message,
      analysisSource: f.evidence_source || "static",
      category: f.category,
      confidence: f.confidence,
    }));
    return {
      language: (r.language && r.language.language) || file.language,
      kind: file.kind || "source",
      lineCount: (file.content || "").split(/\r?\n/).length,
      issues,
      summary: {
        confirmed: issues.filter((i) => i.severity === "confirmed").length,
        likely: issues.filter((i) => i.severity === "likely" || i.severity === "high").length,
        possible: issues.filter((i) => i.severity === "possible").length,
        total: issues.length,
      },
      engine: "code_engine",
      engineVersion: r.version || ENGINE_VERSION,
      capabilities: r.capabilities || {},
      evidence: r.evidence || [],
      structure: r.structure || null,
      symbols: r.symbols || [],
      parse: r.parse || null,
      limitations: r.limitations || [],
      llmContext: data.llm_context || null,
      contentHash: r.content_hash,
      raw: r,
    };
  }

  /**
   * Main entry: try remote, fall back to local.
   * Returns a Promise when async path is used; for sync callers use analyzeSync.
   */
  async function analyze(file) {
    try {
      return await analyzeRemote(file);
    } catch (_) {
      return analyzeLocal(file);
    }
  }

  function analyzeSync(file) {
    return analyzeLocal(file);
  }

  function formatReport(file, report) {
    const lines = [];
    lines.push("### Code Intelligence report");
    lines.push("");
    lines.push(`- **File:** \`${file.name}\``);
    lines.push(`- **Language:** ${report.language}`);
    lines.push(`- **Engine:** ${report.engine || "local"} ${report.engineVersion || ""}`);
    if (report.capabilities) {
      lines.push(`- **AST available:** ${report.capabilities.has_ast ? "yes" : "no"}`);
      lines.push(`- **Parser:** ${report.capabilities.parser_name || "none"}`);
    }
    lines.push(`- **Lines:** ${report.lineCount}`);
    lines.push(`- **Issues:** confirmed ${report.summary.confirmed}, likely ${report.summary.likely}, possible ${report.summary.possible}`);
    if (report.limitations && report.limitations.length) {
      lines.push("");
      lines.push("**Limitations:**");
      report.limitations.forEach((l) => lines.push("- " + l));
    }
    lines.push("");
    if (!report.issues.length) {
      lines.push("No issues reported by current analyzers.");
      lines.push("This does **not** mean the code is bug-free.");
    } else {
      report.issues.forEach((iss) => {
        const loc = iss.line ? `L${iss.line}` : "file";
        const src = iss.analysisSource ? ` [${iss.analysisSource}]` : "";
        lines.push(`- **${iss.severity}** (${loc})${src}: ${iss.message}`);
      });
    }
    lines.push("");
    lines.push("Ask me to debug a specific error message or refactor a section for deeper help.");
    return lines.join("\n");
  }

  return {
    analyze,
    analyzeSync,
    analyzeLocal,
    analyzeRemote,
    formatReport,
    ENGINE_VERSION,
  };
})();
