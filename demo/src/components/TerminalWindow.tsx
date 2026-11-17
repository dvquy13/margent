import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {CLAMP} from '../timing';

export interface TerminalLine {
  text: string;
  color?: string;
  startFrame: number;
  /** Types the text character by character over `typeFrames` frames. */
  typewriter?: boolean;
  typeFrames?: number;
}

// qrec's terminal window, dark variant, with the text colour set for it.
export const TerminalWindow: React.FC<{
  lines: TerminalLine[];
  title?: string;
  width?: number;
  fontSize?: number;
}> = ({
  lines,
  title = 'zsh',
  width = 820,
  fontSize = 15,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        width,
        background: theme.termBg,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        fontFamily: theme.mono,
      }}
    >
      <div
        style={{
          background: theme.termBar,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{display: 'flex', gap: 6}}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div key={c} style={{width: 12, height: 12, borderRadius: '50%', background: c}} />
          ))}
        </div>
        <span style={{color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 'auto', marginRight: 'auto'}}>
          {title}
        </span>
      </div>
      <div style={{padding: '16px 20px', minHeight: 120}}>
        {lines.map((line, i) => {
          if (frame < line.startFrame) return null;
          let text = line.text;
          if (line.typewriter) {
            const total = line.typeFrames ?? line.text.length * 1.5;
            const chars = Math.floor(
              interpolate(frame - line.startFrame, [0, total], [0, line.text.length], CLAMP),
            );
            text = line.text.slice(0, chars);
          }
          return (
            <div key={i} style={{color: line.color ?? theme.termText, fontSize, lineHeight: 1.7, whiteSpace: 'pre'}}>
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
};
