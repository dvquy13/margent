---
title: Hostile doc
status: draft
updated: 2026-10-24
---

# Hostile doc

Every island and every raw HTML element below tries to run or to reach the save endpoint.

<!-- island evil -->
| Item | Count |
|---|---|
| alpha | 1 |
| beta | 2 |

<script>window.__pwnScript = 1</script>

<img src="nope.png" onerror="window.__pwnImg = 1">

<form action="/_save" method="post"><input name="x" value="y"><button id="pwn-form">go</button></form>
