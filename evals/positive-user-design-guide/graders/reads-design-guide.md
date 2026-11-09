---
type: llm
focus: trace
criteria: The assistant tried to find or read the user's design guide at ~/.margent/design.md (or $MARGENT_HOME/design.md), through any tool call (Read, Glob, Grep or a shell command), before designing the visual. Merely quoting the skill's instructions does not count; there must be a tool call whose input names .margent.
---
