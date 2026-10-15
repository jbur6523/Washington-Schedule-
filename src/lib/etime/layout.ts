import widths from "./glyph-widths.json";
import type { Entry } from "./model";
// At most two 11pt lines in each approved row. Overflow continues on another
// original-format row, retaining the logical entry and its acknowledgment.
export function splitReason(text: string) {
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const char of text) {
    const w = (widths as Record<string, number>)[char] ?? 10;
    if (width + w > 155) {
      lines.push(line.trim());
      line = "";
      width = 0;
    }
    line += char;
    width += w;
  }
  if (line.trim()) lines.push(line.trim());
  const chunks: string[] = [];
  chunks.push(lines.slice(0, 2).join("\n"));
  for (let i = 2; i < lines.length; i++) chunks.push(lines[i]);
  return chunks.length ? chunks : [""];
}
export function layoutRows(entries: Entry[]) {
  return entries.flatMap((entry) =>
    splitReason(entry.reason).map((reason, index) => ({
      ...entry,
      reason,
      continuation: index > 0,
    })),
  );
}
