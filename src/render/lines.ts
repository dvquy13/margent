// Line and text helpers shared by markdown.ts and comments.ts. Kept apart so that neither imports the other.

export function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === '';
}

// 1-based inclusive "start-end" for a 0-based half-open map, with leading and trailing blank lines excluded.
export function lineRange(lines: string[], map: [number, number]): string {
  let start = map[0] + 1;
  let end = map[1];
  while (start < end && isBlank(lines[start - 1])) start++;
  while (end > start && isBlank(lines[end - 1])) end--;
  return `${start}-${end}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
