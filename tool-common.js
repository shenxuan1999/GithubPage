// @ts-check
// Helpers shared by the tool pages. Loaded as a classic script, so every function here is a global
// that the page's own inline script can call.

/**
 * Shows a message in the page's status strip (#statusStrip / #statusText).
 * @param {"" | "valid" | "invalid"} state
 * @param {string} message
 */
function setStatus(state, message) {
  const strip = document.getElementById("statusStrip");
  const text = document.getElementById("statusText");
  if (!strip || !text) {
    return;
  }

  strip.classList.remove("valid", "invalid");
  if (state) {
    strip.classList.add(state);
  }
  text.textContent = message;
}

/**
 * @param {string} text
 * @returns {number}
 */
function countLines(text) {
  return text ? text.split(/\r\n|\r|\n/).length : 0;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

/**
 * Escapes text for use inside HTML markup and attribute values.
 * @param {unknown} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fills a line-number gutter for a textarea and lines it up with the textarea's scroll position.
 * @param {HTMLElement} gutter
 * @param {HTMLTextAreaElement} textarea
 */
function renderLineNumbers(gutter, textarea) {
  const lines = Math.max(1, countLines(textarea.value));
  gutter.textContent = Array.from({ length: lines }, (_, index) => index + 1).join("\n");
  gutter.scrollTop = textarea.scrollTop;
}

/**
 * Keeps a line-number gutter scrolled together with its textarea.
 * @param {HTMLElement} gutter
 * @param {HTMLTextAreaElement} textarea
 */
function syncGutterScroll(gutter, textarea) {
  textarea.addEventListener("scroll", () => {
    gutter.scrollTop = textarea.scrollTop;
  });
}

/**
 * Copies text to the clipboard and reports the result in the status strip.
 * @param {string} text
 * @param {string} successMessage
 * @param {string} [failureMessage]
 * @returns {Promise<boolean>}
 */
async function copyText(text, successMessage, failureMessage = "复制失败，请手动选择结果复制") {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("valid", successMessage);
    return true;
  } catch {
    setStatus("invalid", failureMessage);
    return false;
  }
}

/**
 * Reads text from the clipboard. Problems are reported in the status strip and give null.
 * @returns {Promise<string | null>}
 */
async function readClipboardText() {
  if (!navigator.clipboard?.readText) {
    setStatus("invalid", "当前浏览器不支持直接读取剪贴板");
    return null;
  }

  try {
    return await navigator.clipboard.readText();
  } catch {
    setStatus("invalid", "浏览器没有授权读取剪贴板");
    return null;
  }
}

/**
 * Saves text or a Blob as a file download.
 * @param {string | Blob} content
 * @param {string} fileName
 * @param {string} [type] MIME type used when content is text.
 */
function downloadFile(content, fileName, type = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** @type {WeakMap<HTMLImageElement, string>} */
const imageObjectUrls = new WeakMap();

/**
 * Shows a Blob in an image through an object URL and releases the URL it showed before.
 * An object URL hands the bytes straight to the image decoder; a multi-MB Data URL would be parsed again.
 * @param {HTMLImageElement} image
 * @param {Blob | null} blob null just clears the image.
 */
function setImageBlob(image, blob) {
  const previousUrl = imageObjectUrls.get(image);
  image.removeAttribute("src");
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
    imageObjectUrls.delete(image);
  }

  if (blob) {
    const url = URL.createObjectURL(blob);
    imageObjectUrls.set(image, url);
    image.src = url;
  }
}

/**
 * @typedef {{ ok: true, value: any, unescaped: boolean } | { ok: false, message: string }} JsonParseResult
 * @typedef {{ text: string, unescaped: boolean }} JsonCandidate
 */

/**
 * Parses JSON leniently: also accepts JSON that was escaped into a string (once or several times),
 * and JSON whose quotes or Unicode characters were escaped.
 * @param {string} raw
 * @returns {JsonParseResult}
 */
function parseJson(raw) {
  const candidates = buildJsonCandidates(raw);
  /** @type {unknown} */
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.text);
      const normalized = unwrapJsonString(parsed, candidate.unescaped);
      return { ok: true, value: normalized.value, unescaped: normalized.unescaped };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    message: formatJsonError(lastError, raw)
  };
}

/**
 * @param {string} raw
 * @returns {JsonCandidate[]}
 */
function buildJsonCandidates(raw) {
  const text = raw.trim();
  /** @type {JsonCandidate[]} */
  const candidates = [{ text, unescaped: false }];

  if (isWrappedInQuotes(text)) {
    try {
      const unwrapped = JSON.parse(text);
      if (typeof unwrapped === "string") {
        candidates.push({ text: unwrapped.trim(), unescaped: true });
      }
    } catch {
      // Keep the original parser error as the useful signal.
    }
  }

  const quoteFixed = text.replace(/\\"/g, '"').replace(/\\\//g, "/");
  if (quoteFixed !== text) {
    candidates.push({ text: quoteFixed, unescaped: true });
  }

  const unicodeFixed = text.replace(/\\u([\dA-Fa-f]{4})/g, (_, code) => {
    return String.fromCharCode(Number.parseInt(code, 16));
  });
  if (unicodeFixed !== text) {
    candidates.push({ text: unicodeFixed, unescaped: true });
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.text)) {
      return false;
    }
    seen.add(candidate.text);
    return true;
  });
}

/**
 * Parses strings that themselves contain JSON, up to four levels deep.
 * @param {unknown} value
 * @param {boolean} wasUnescaped
 * @returns {{ value: unknown, unescaped: boolean }}
 */
function unwrapJsonString(value, wasUnescaped) {
  let current = value;
  let unescaped = wasUnescaped;

  for (let i = 0; i < 4; i += 1) {
    if (typeof current !== "string") {
      break;
    }

    const text = current.trim();
    if (!looksLikeJson(text)) {
      break;
    }

    try {
      current = JSON.parse(text);
      unescaped = true;
    } catch {
      break;
    }
  }

  return { value: current, unescaped };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeJson(text) {
  return (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]")) ||
    isWrappedInQuotes(text)
  );
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isWrappedInQuotes(text) {
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"');
}

/**
 * Formats a JSON.parse error, adding the line and column when the message contains a position.
 * @param {unknown} error
 * @param {string} source
 * @returns {string}
 */
function formatJsonError(error, source) {
  const base = (error instanceof Error && error.message) || "无法解析 JSON";
  const position = extractErrorPosition(base);

  if (position === null) {
    return base;
  }

  const location = getLineColumn(source, position);
  return `${base}\n位置：第 ${location.line} 行，第 ${location.column} 列`;
}

/**
 * @param {string} message
 * @returns {number | null}
 */
function extractErrorPosition(message) {
  const match = message.match(/position\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * @param {string} text
 * @param {number} position
 * @returns {{ line: number, column: number }}
 */
function getLineColumn(text, position) {
  const before = text.slice(0, position);
  const lines = before.split(/\r\n|\r|\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}
