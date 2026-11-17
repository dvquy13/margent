import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {changedLines, insertedSpan} from '../diff';
import {CLAMP} from '../timing';
import {theme} from '../theme';

// Slides up over the lower part of the browser and shows the saved line: the removed line and the added one.
// The part of the added line that is new is highlighted.
export const DiffCard: React.FC<{before: string; after: string; start: number}> = ({before, after, start}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = interpolate(frame, [start, start + Math.round(0.5 * fps)], [0, 1], {
    ...CLAMP,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const changes = changedLines(before, after);

  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: 96,
        background: '#ffffff',
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
        padding: '16px 22px',
        opacity: p,
        translate: `0 ${(1 - p) * 40}px`,
        fontFamily: theme.mono,
      }}
    >
      <div style={{fontSize: 14, color: theme.muted, marginBottom: 10}}>launch-review.md</div>
      {changes.map((c, i) => {
        const added = insertedSpan(c.before, c.after);
        const line = {display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 6, marginBottom: 8, fontSize: 15, lineHeight: 1.5};
        return (
          <React.Fragment key={i}>
            <div style={{...line, background: theme.removedBg, color: theme.removedText}}>
              <span style={{flexShrink: 0}}>-</span>
              <span style={{wordBreak: 'break-word', whiteSpace: 'pre-wrap'}}>{c.before}</span>
            </div>
            <div style={{...line, background: theme.addedBg, color: theme.addedText}}>
              <span style={{flexShrink: 0}}>+</span>
              <span style={{wordBreak: 'break-word', whiteSpace: 'pre-wrap'}}>
                {added.head}
                <span style={{background: theme.addedHighlight, borderRadius: 3}}>{added.inserted}</span>
                {added.tail}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
