---
name: negative-fix-failing-test
tags: [no-trigger]
allowed_tools: [Read, Glob, Grep, Skill]
---

This test is failing: `npm test -- test/render.test.mjs` reports that the golden file does not match after my last change to the slug function. Find the likely cause and tell me what to change.
