## 09 LLM usage

LLM calls make most of the agent's judgments. This section lists every call, the rules they all run under, and how each is evaluated. Labels, current numbers and known weaknesses live in the [eval setup](../evals/eval-setup.md).

<!-- island llm-calls total=3.87 -->
| Call | What it decides, and when | Model | Cost, average month | Evaluated by |
|---|---|---|---|---|
| Filter | Does a review comment ask for an edit? Every comment | Messages API on Claude Haiku, keep at p ≥ 0.5 | \$1.58 (41%) | Recall on labeled comments, and the share of comments dropped (eval setup, Eval 1) |
| Extraction | Which edits does a kept comment ask for, each with a verbatim quote? Every kept comment | Claude Haiku, effort low | \$1.84 (48%) | Precision and recall against labeled edits through the matcher, plus a string check on quotes (Eval 3) |
| Resolution judge | Does a comment belong to one of its 5 nearest threads, or does it start a new one? Every comment | Claude Haiku, effort low | \$0.44 (11%) | Pairwise precision and recall on lead-labeled pairs (Eval 4) |
| Canonical statement | Writes a thread's title in general form, and rewrites it after several new comments | Claude Haiku, proposed for M2 | Not measured | Only indirectly, through the merge pass eval |
| Merge pass | Should two threads whose topics drifted close become one? Nightly | Claude Haiku, proposed for M2 | Not measured | Labeled cross-thread pairs, planned for M2 |
| Scope gate | Does an edit reach beyond one file (rule 2)? Once, when it first crosses a count rule | Claude Haiku, proposed for M3 | A few cents | None yet |
| `fit` rubric | How well does a section suit `style.md`? Each ranked section | Proposed for M4 | Not measured | Only indirectly, through ranking precision@5 |
| Agent | Chats with you, writes docs, proposes `style.md` changes | Claude through the Agent SDK, model chosen in M5 | Outside the pipeline figures | Confinement tests (S7). No quality eval |
| Matcher, evals only | Do two comments ask for the same edit? Only when scoring extraction | Messages API on Claude Haiku, same at p ≥ 0.5 | Eval runs only | Its own lead-labeled pairs (Eval 2) |

*Costs are the average month across the sample repos (\$3.87) split by stage. Review comments drive every row, because the filter keeps 96% of them.*
