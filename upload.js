/**
 * File Upload – validation, read text content, attach to conversation.
 */
const Upload = window.Upload = (() => {
  const MAX_BYTES = 512 * 1024; // 512 KB
  const ALLOWED_EXT = new Set([
    "py","js","ts","tsx","jsx","java","c","cpp","h","hpp","cs","go","rs","rb","php",
    "html","css","scss","json","yaml","yml","xml","md","txt","sql","sh","bash","env",
    "toml","ini","cfg","vue","svelte","kt","swift","m","mm","r","pl","lua"
  ]);
  const ALLOWED_MIME = /^(text\/|application\/(json|javascript|xml|x-yaml|toml)|image\/svg\+xml)/i;

  let pending = null; // { name, size, type, ext, content, language }

  function extOf(name) {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  }

  function detectLanguage(name, content) {
    const ext = extOf(name);
    const map = {
      py: "python", js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript",
      java: "java", c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp", go: "go",
      rs: "rust", rb: "ruby", php: "php", html: "html", css: "css", scss: "scss",
      json: "json", yaml: "yaml", yml: "yaml", xml: "xml", md: "markdown", sql: "sql",
      sh: "bash", bash: "bash", vue: "vue", kt: "kotlin", swift: "swift"
    };
    if (map[ext]) return map[ext];
    const head = (content || "").slice(0, 400);
    if (/^#!.*python|^\s*def\s+|^\s*import\s+\w+/m.test(head)) return "python";
    if (/^\s*function\s+|^\s*const\s+|^\s*let\s+|require\(|=>/m.test(head)) return "javascript";
    if (/^\s*package\s+|^\s*func\s+\w+/m.test(head)) return "go";
    if (/^\s*fn\s+\w+|^\s*let\s+mut\s+/m.test(head)) return "rust";
    if (/<\?php|^\s*<html/i.test(head)) return "php";
    return ext || "text";
  }

  function classifyContent(content, language) {
    if (!content || !content.trim()) return "empty";
    if (/[\x00-\x08\x0e-\x1f]/.test(content.slice(0, 2000))) return "binary";
    if (["json","yaml","xml","toml","ini"].includes(language)) return "config";
    if (["html","xml","md","markdown"].includes(language)) return "markup";
    if (["python","javascript","typescript","java","c","cpp","go","rust","ruby","php","sql","bash"].includes(language)) {
      return "source";
    }
    return "text";
  }

  function validateFile(file) {
    if (!file) return { ok: false, error: "No file selected." };
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "File too large (max 512 KB)." };
    }
    const ext = extOf(file.name);
    const mimeOk = !file.type || ALLOWED_MIME.test(file.type) || file.type === "";
    const extOk = ALLOWED_EXT.has(ext);
    if (!extOk && !mimeOk) {
      return { ok: false, error: "Unsupported file type: ." + (ext || "?") };
    }
    return { ok: true };
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsText(file);
    });
  }

  async function pickAndRead(file) {
    const v = validateFile(file);
    if (!v.ok) throw new Error(v.error);
    const content = await readAsText(file);
    // Reject if looks binary
    if (/[\x00-\x08\x0e-\x1f]/.test(content.slice(0, 4000))) {
      throw new Error("Binary files are not supported.");
    }
    if (content.length > 200000) {
      throw new Error("File content too large after read.");
    }
    const language = detectLanguage(file.name, content);
    const kind = classifyContent(content, language);
    pending = {
      name: file.name,
      size: file.size,
      type: file.type || "text/plain",
      ext: extOf(file.name),
      content,
      language,
      kind,
      id: "f_" + Date.now().toString(36),
    };
    return pending;
  }

  function getPending() {
    return pending;
  }

  function clearPending() {
    pending = null;
  }

  function formatSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  return {
    MAX_BYTES,
    pickAndRead,
    getPending,
    clearPending,
    formatSize,
    validateFile,
    detectLanguage,
    classifyContent,
  };
})();
