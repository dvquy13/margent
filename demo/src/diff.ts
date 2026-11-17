export interface LineChange {
  before: string;
  after: string;
}

// Each saved edit changes whole lines of the .md; the capture's diffs change exactly one.
export function changedLines(before: string, after: string): LineChange[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length !== b.length) {
    throw new Error(`diff: the saved file has ${b.length} lines, the file before the save has ${a.length}`);
  }
  return a.flatMap((line, i) => (line === b[i] ? [] : [{before: line, after: b[i]}]));
}

// The part of `after` that is not in `before`: the text shared at the start and end is kept as is.
export function insertedSpan(before: string, after: string) {
  const max = Math.min(before.length, after.length);
  let head = 0;
  while (head < max && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return {
    head: after.slice(0, head),
    inserted: after.slice(head, after.length - tail),
    tail: after.slice(after.length - tail),
  };
}
