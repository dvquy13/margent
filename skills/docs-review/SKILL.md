---
name: docs-review
description: Address the review comments in a doc or folder of docs (margent CriticMarkup threads)
argument-hint: <file or folder>
# x-release-please-start-version
allowed-tools: Skill, Read, Edit, Bash(margent comments:*), Bash(margent check:*), Bash(npx -y margent@0.7.0:*), Bash(margent --version)
disable-model-invocation: true
---

Run `margent --version` first. If it prints `0.7.0`, use `margent` as written below;
otherwise replace `margent` with `npx -y margent@0.7.0` in every command.
<!-- x-release-please-end -->

Address the review comments in `$ARGUMENTS`. First load the margent skill with the Skill tool and follow its Comments section, which is the contract for this command.

1. Run `margent comments $ARGUMENTS` with the Bash tool. Work only on threads marked `needs agent`. Leave `needs you` threads alone.
2. For each thread, read the `.md` again before editing it: the user may have added a comment in the served page since you last read it.
3. If the comment asks for a change you can make exactly as asked, make it. Either way, append a `Claude` note after the thread's last note with the same ID and leave the thread open: for a change, one line saying what you changed and where; otherwise your answer, question or disagreement. Never delete a thread: the user resolves it. Never cite a thread ID in the doc's own text, since resolving deletes the thread.
4. Run `margent check` on each file you changed. Fix what you broke; do not leave a failing check.
5. Run `margent comments $ARGUMENTS` again. Report in two lines how many threads still need the agent and how many need the user, and list the files you changed.

- If `margent comments` or `margent check` prints a `file:line: message` error, show every such line verbatim and stop unless the fix is clear from the message. Do not retry with different arguments unless the user asks.
