import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP} from '../timing';
import {theme} from '../theme';

// The folder the command serves. The docs/ block is highlighted from `highlightFrame` on: the block gets a tint,
// the markdown files get a "→ page" tag, and README.md and src/ dim.
export const TREE_WIDTH = 312;
export const TREE_PAD = 18;
export const TREE_ROW = 24;
const DOCS_FIRST = 3;
const DOCS_ROWS = 5;

const rows: {text: string; dim?: boolean; docs?: boolean; page?: boolean}[] = [
  {text: 'search-beta/'},
  {text: '├─ README.md', dim: true},
  {text: '├─ src/', dim: true},
  {text: '└─ docs/', docs: true},
  {text: '   ├─ launch-review.md', docs: true, page: true},
  {text: '   ├─ notes/', docs: true},
  {text: '   │  └─ retro.md', docs: true, page: true},
  {text: '   └─ islands/', docs: true},
];

export const FileTree: React.FC<{highlightFrame: number}> = ({highlightFrame}) => {
  const frame = useCurrentFrame();
  const on = interpolate(frame, [highlightFrame, highlightFrame + 12], [0, 1], CLAMP);
  const tags = interpolate(frame, [highlightFrame + 6, highlightFrame + 18], [0, 1], CLAMP);
  const dim = interpolate(frame, [highlightFrame, highlightFrame + 12], [1, 0.4], CLAMP);
  const lit = frame >= highlightFrame;

  return (
    <div
      style={{
        position: 'relative',
        width: TREE_WIDTH,
        padding: `${TREE_PAD}px 20px`,
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        fontFamily: theme.mono,
        fontSize: 15,
        lineHeight: `${TREE_ROW}px`,
        color: theme.text,
        whiteSpace: 'pre',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 4,
          right: 4,
          top: TREE_PAD + DOCS_FIRST * TREE_ROW,
          height: DOCS_ROWS * TREE_ROW,
          borderRadius: 8,
          background: 'rgba(0,98,168,0.08)',
          opacity: on,
        }}
      />
      {rows.map((row, i) => (
        <div
          key={row.text}
          style={{
            position: 'relative',
            height: TREE_ROW,
            opacity: row.dim ? dim : 1,
            color: row.docs && lit && i === DOCS_FIRST ? theme.accent : theme.text,
          }}
        >
          {row.text}
          {row.page && (
            <span
              style={{
                position: 'absolute',
                right: 0,
                top: 3,
                opacity: tags,
                fontFamily: theme.sans,
                fontSize: 11,
                lineHeight: '18px',
                color: theme.accent,
                background: theme.bg,
                border: `1px solid ${theme.accent}`,
                borderRadius: 10,
                padding: '0 8px',
              }}
            >
              → page
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
