---
title: First public release, generic fixtures and release-please
status: accepted
updated: 2026-10-25
---

# 0031 First public release, generic fixtures and release-please

## Context

Other machines need margent from npm (the CLI) and GitHub (`npx skills add`, the plugin marketplace), so the repo goes public. Until now its tests, spikes and acceptance evidence carried copies of a private project's docs: the frozen corpus walks, the M2/M3 edit corpus, spike inputs and outputs, goldens, and session transcripts with local paths. History carried them in every commit. Releases were a manual list of steps, and the version lives in `package.json`, the plugin manifest and every skill.

## Decision

- **Fresh public history.** The public `main` starts from one commit of the cleaned tree. The earlier history stays in a local tag, `archive/pre-public`, which is never pushed.
- **Generic content only.** Every published fixture, test doc and example is written for margent: where content needs a real subject, the subject is margent itself. The edit corpus runs on one maintainer handbook (`test/edit-corpus/docs/handbook.md`) that holds every block kind the cases need. Cases that repeated a behavior across docs were dropped, leaving 52 ported cases plus the margent-written ones. The corpus walks read a frozen copy of this repo's `docs/`.
- **Spikes and acceptance evidence are not published.** `spikes/`, `docs/results/` and `evals/results/` are removed. Specs keep their outcomes, with evidence noted as kept in the archive.
- **release-please.** Commits on `main` follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). release-please keeps a release PR open with the next version and its `CHANGELOG.md` entry. It bumps `package.json`, `package-lock.json`, `.claude-plugin/plugin.json` and every version inside the `x-release-please-start-version` / `x-release-please-end` markers in `skills/`. Merging the PR tags the release and creates the GitHub Release.
- **npm trusted publishing.** The release workflow publishes with `npm publish --provenance` over GitHub's OIDC token, with no stored npm token. A package must exist before a trusted publisher can be set, so 0.1.0 is published by hand once.
- **CI** runs typecheck, the fast tier and `check docs/` on Ubuntu with Node 22 and 24. The full tier stays a local gate before merging a release PR.

## Consequences

- Moving to margent's own docs exposed two harness limits, now explicit in the tests: A3 measures only docs that start with no comment markup (two docs quote the syntax literally), and the no-op walk skips, and lists, blocks whose text is all inside links. Six blocks in margent's docs were rewritten into house style so the gate check stays strict.
- Porting exposed a bug: a heading like `## 2. Release process` failed the gate, because the line-start `1.` escape applied inside headings. The heading rule now undoes it.
- A release PR opened by the workflow's token doesn't start CI on itself (a GitHub limit). The release job runs the fast tier again before it publishes.
- Commit messages are now part of the release: a commit without a Conventional Commits type is left out of the changelog.

## Alternatives considered

- Rewriting history with `git filter-repo` to keep the 124 commits public. Rejected: the private content touched spikes, transcripts, goldens and the edit corpus across most commits, and verifying every rewritten commit is harder than checking one tree.
- A hand-written changelog with a tag-triggered publish, or Changesets. Rejected in favor of release-please, which needs no extra step per change beyond the commit message.
- An `NPM_TOKEN` secret. Rejected: trusted publishing leaves no long-lived token to rotate or leak.
