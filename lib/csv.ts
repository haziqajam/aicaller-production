/**
 * Legacy naive parser. Kept for backwards compatibility with existing tests.
 * New code should prefer `parseCsv`, which is RFC-4180-aware (quoted fields,
 * embedded commas/newlines, escaped quotes) and returns headers + raw rows so
 * callers can do their own column mapping.
 */
export function parseLeadsCsv(text: string): { name: string; phone: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase();
  const start = header.includes("phone") ? 1 : 0;
  return lines.slice(start).map((line) => {
    const [name, phone] = line.split(",").map((c) => c.trim());
    return { name: name ?? "", phone: phone ?? "" };
  });
}

/**
 * Robustly parse CSV text into a header row and data rows.
 *
 * Handles:
 *  - quoted fields ("Acme, Inc")
 *  - commas and newlines inside quoted fields
 *  - escaped double-quotes inside quotes ("" -> ")
 *  - CRLF and LF line endings
 *  - a leading UTF-8 BOM
 *  - blank trailing line(s)
 *
 * The first non-empty record is treated as the header. Each data row is
 * normalised to the header's column count (extra cells dropped, missing cells
 * padded with empty strings) so callers can index by column position safely.
 *
 * @returns `{ headers, rows }` — `headers` is `string[]`, `rows` is
 *   `string[][]` (one inner array per data row, header excluded).
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // Strip a leading BOM if present.
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let recordHasContent = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };

  const pushRecord = () => {
    pushField();
    // Drop fully-empty records (e.g. blank trailing lines).
    const isBlank = record.length === 1 && record[0] === "";
    if (!isBlank || recordHasContent) {
      records.push(record);
    }
    record = [];
    recordHasContent = false;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          // Escaped quote.
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      recordHasContent = true;
      continue;
    }

    if (ch === ",") {
      recordHasContent = true;
      pushField();
      continue;
    }

    if (ch === "\r") {
      // Handle CRLF: consume the following \n with the newline branch.
      if (input[i + 1] === "\n") i++;
      pushRecord();
      continue;
    }

    if (ch === "\n") {
      pushRecord();
      continue;
    }

    if (ch !== "" ) recordHasContent = true;
    field += ch;
  }

  // Flush any trailing field/record not terminated by a newline.
  if (field !== "" || record.length > 0 || inQuotes) {
    pushRecord();
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const width = headers.length;

  const rows = records.slice(1).map((r) => {
    const normalised = r.slice(0, width);
    while (normalised.length < width) normalised.push("");
    return normalised;
  });

  return { headers, rows };
}
