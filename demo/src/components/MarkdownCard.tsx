import React from 'react';
import {theme} from '../theme';

// A light paper card showing the head of a markdown file, as the agent sees it. Lines past the card's width are cut
// with an ellipsis, so every source line keeps its row.
export const MarkdownCard: React.FC<{title: string; lines: string[]; width: number; height: number}> = ({
  title,
  lines,
  width,
  height,
}) => (
  <div
    style={{
      width,
      height,
      background: '#ffffff',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}
  >
    <div style={{fontFamily: theme.mono, fontSize: 13, color: theme.text, marginBottom: 10}}>{title}</div>
    {lines.map((line, i) => (
      <div
        key={i}
        style={{
          fontFamily: theme.mono,
          fontSize: 12,
          lineHeight: '16px',
          color: theme.muted,
          whiteSpace: 'pre',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minHeight: 16,
        }}
      >
        {line}
      </div>
    ))}
  </div>
);
