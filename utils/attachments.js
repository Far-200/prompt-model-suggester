// utils/attachments.js
// Shared utility for attachment context detection.
// PRIVACY: reads only visible DOM text (chip labels / aria-labels / filenames).
// Never reads file contents, never uses FileReader, never opens blob URLs.

/**
 * Map a visible filename string to a category.
 * Operates on the extension only — zero file content access.
 *
 * @param {string} name  Visible filename text, e.g. "report.pdf"
 * @returns {string}     One of: image | document | presentation | spreadsheet | archive | unknown
 */
function classifyAttachmentType(name) {
  if (!name || typeof name !== "string") return "unknown";

  // Extract the extension from the last dot — handles "Remove report.pdf", paths, etc.
  const match = name.match(/\.([a-zA-Z0-9]{1,5})(?:\s|$|\))/);
  if (!match) return "unknown";

  const ext = match[1].toLowerCase();

  const EXT_MAP = {
    // Images (vision tasks)
    png: "image", jpg: "image", jpeg: "image", webp: "image",
    gif: "image", bmp: "image", svg: "image", heic: "image",
    // Documents
    pdf: "document", doc: "document", docx: "document",
    txt: "document", md:  "document", rtf:  "document",
    // Presentations
    ppt: "presentation", pptx: "presentation", key: "presentation",
    // Spreadsheets
    xls: "spreadsheet", xlsx: "spreadsheet", csv: "spreadsheet",
    ods: "spreadsheet", tsv:  "spreadsheet",
    // Archives / code bundles
    zip: "archive", rar: "archive", "7z": "archive",
    tar: "archive", gz:  "archive", tgz: "archive",
  };

  return EXT_MAP[ext] || "unknown";
}

/**
 * Build an attachmentContext object from a list of raw chip text strings.
 * Called by each adapter's getAttachments() method.
 *
 * @param {string[]} rawTexts  Array of visible chip labels / filenames found in the DOM
 * @returns {{ hasAttachment: boolean, count: number, types: string[], names: string[] }}
 */
function buildAttachmentContext(rawTexts) {
  // Filter to strings that actually contain something resembling a filename.
  // This prevents chat history text from leaking in via the broad fallback scan.
  const filenameLike = rawTexts.filter(t => {
    const trimmed = t.trim();
    return (
      trimmed.length > 0 &&
      trimmed.length < 200 &&
      /\.\w{2,5}(\s|$|\)|,)/.test(trimmed + " ") // must have an extension
    );
  });

  if (filenameLike.length === 0) {
    return { hasAttachment: false, count: 0, types: [], names: [] };
  }

  // Deduplicate (same chip may appear in multiple selector passes)
  const unique = [...new Set(filenameLike)];

  const names = unique.map(t => {
    // Best-effort: extract the bare filename from strings like "Remove report.pdf"
    const m = t.match(/[\w\-. ()]+\.\w{2,5}(?:\s|$|\))/);
    return m ? m[0].trim() : t.trim();
  });

  const types = names.map(classifyAttachmentType);

  return {
    hasAttachment: true,
    count: unique.length,
    types,   // e.g. ["document", "image"]
    names,   // e.g. ["report.pdf", "screenshot.png"]  — visible labels only
  };
}
