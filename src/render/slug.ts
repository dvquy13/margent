// GitHub-style slugs. Duplicates within one page get -2, -3 (spec R1.2), not GitHub's -1.

// Lowercase, drop anything that is not a letter, mark, number, space, hyphen or underscore, then spaces become hyphens.
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

// One per page. Call unique() for each heading in document order.
export class Slugger {
  private readonly used = new Set<string>();

  unique(text: string): string {
    const base = slugify(text) || 'section';
    let candidate = base;
    let n = 2;
    while (this.used.has(candidate)) {
      candidate = `${base}-${n}`;
      n++;
    }
    this.used.add(candidate);
    return candidate;
  }
}
