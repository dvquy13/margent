// Frozen copy of this repo's docs/ that the corpus walks read (test/fixtures/corpus/README.md). Tests never write it.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MARGENT_CORPUS = join(repo, 'test', 'fixtures', 'corpus', 'margent');
