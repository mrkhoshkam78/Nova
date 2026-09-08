/**
 * Lightweight static code analysis (client-side, no execution claim).
 */
const Analysis = window.Analysis = (() => {
  function analyzePython(code) {
    const issues = [];
    const lines = code.split(/\r?\n/);
    lines.forEach((line, i) => {
      const n = i + 1;
      if (/\btab\b|\t/.test(line) && line.includes("    ")) {
        issues.push({ severity: "possible", line: n, message: "Mixed tabs/spaces indentation." });
      }
      if (/except\s*:/.test(line)) {
        issues.push({ severity: "likely", line: n, message: "Bare except: catches all exceptions." });
      }
      if (/\.append\(.+\)\s*$/.test(line) && /for .+ in/.test(lines[Math.max(0, i - 1)] || "")) {
        // skip
      }
      if (/==\s*None|!=\s*None/.test(line)) {
        issues.push({ severity: "likely", line: n, message: "Use 'is None' / 'is not None' instead of ==." });
      }
      if (/\bprint\s+[^(]/.test(line) && !line.trim().startsWith("#")) {
        issues.push({ severity: "possible", line: n, message: "Python 2 style print statement?" });
      }
    });
    if (/\[\s*0\s*\]/.test(code) && !/if\s+.*len\(|if\s+.*:/.test(code)) {
      issues.push({ severity: "possible", line: null, message: "Index [0] without empty-check may raise IndexError." });
    }
    return issues;
  }

  function analyzeJavaScript(code) {
    const issues = [];
    const lines = code.split(/\r?\n/);
    lines.forEach((line, i) => {
      const n = i + 1;
      if (/\bvar\s+/.test(line)) {
        issues.push({ severity: "possible", line: n, message: "Prefer const/let over var." });
      }
      if (/==(?!=)/.test(line) && !/===/.test(line)) {
        issues.push({ severity: "likely", line: n, message: "Use === instead of ==." });
      }
      if (/\beval\s*\(/.test(line)) {
        issues.push({ severity: "confirmed", line: n, message: "eval() is dangerous." });
      }
      if (/\.then\s*\(/.test(line) && !/catch/.test(code)) {
        issues.push({ severity: "possible", line: n, message: "Promise may lack error handling." });
      }
    });
    if (/JSON\.parse/.test(code) && !/try\s*\{/.test(code)) {
      issues.push({ severity: "possible", line: null, message: "JSON.parse without try/catch may throw." });
    }
    return issues;
  }

  function analyzeGeneric(code) {
    const issues = [];
    if (code.length > 50000) {
      issues.push({ severity: "possible", line: null, message: "Very large file; analysis is shallow." });
    }
    if (/TODO|FIXME|XXX/.test(code)) {
      issues.push({ severity: "possible", line: null, message: "Contains TODO/FIXME markers." });
    }
    if (/password\s*=\s*['\"][^'\"]+['\"]|api[_-]?key\s*=\s*['\"][^'\"]+['\"]/i.test(code)) {
      issues.push({ severity: "likely", line: null, message: "Possible hard-coded secret." });
    }
    return issues;
  }

  /**
   * @returns {{ language, kind, lineCount, issues, summary }}
   */
  function analyze(file) {
    const code = (file && file.content) || "";
    const language = (file && file.language) || "text";
    const kind = (file && file.kind) || "text";
    const lineCount = code ? code.split(/\r?\n/).length : 0;
    let issues = analyzeGeneric(code);
    if (language === "python") issues = issues.concat(analyzePython(code));
    if (language === "javascript" || language === "typescript") issues = issues.concat(analyzeJavaScript(code));

    // Dedupe by message
    const seen = new Set();
    issues = issues.filter((x) => {
      const k = x.message + ":" + x.line;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const confirmed = issues.filter((i) => i.severity === "confirmed").length;
    const likely = issues.filter((i) => i.severity === "likely").length;
    const possible = issues.filter((i) => i.severity === "possible").length;

    return {
      language,
      kind,
      lineCount,
      issues,
      summary: {
        confirmed,
        likely,
        possible,
        total: issues.length,
      },
    };
  }

  function formatReport(file, report) {
    const lines = [];
    lines.push("### Static analysis (no code execution)");
    lines.push("");
    lines.push(`- **File:** \`${file.name}\``);
    lines.push(`- **Language:** ${report.language}`);
    lines.push(`- **Kind:** ${report.kind}`);
    lines.push(`- **Lines:** ${report.lineCount}`);
    lines.push(`- **Issues:** confirmed ${report.summary.confirmed}, likely ${report.summary.likely}, possible ${report.summary.possible}`);
    lines.push("");
    if (!report.issues.length) {
      lines.push("No obvious static issues found with the current lightweight rules.");
      lines.push("This does **not** mean the code is bug-free.");
    } else {
      report.issues.forEach((iss) => {
        const loc = iss.line ? `L${iss.line}` : "file";
        lines.push(`- **${iss.severity}** (${loc}): ${iss.message}`);
      });
    }
    lines.push("");
    lines.push("Ask me to debug a specific error message or refactor a section for deeper help.");
    return lines.join("\n");
  }

  return { analyze, formatReport };
})();
