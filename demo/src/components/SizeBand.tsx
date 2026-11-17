import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLAMP} from '../timing';
import {theme} from '../theme';

// Two bars on one scale: the markdown the agent handles against the page you read. Widths are proportional to the
// byte counts, with the small bar kept at least 6px wide so it stays visible. `top` is the first row's y.
export const SizeBand: React.FC<{
  mdBytes: number;
  htmlBytes: number;
  start: number;
  top: number;
  barLeft: number;
  barMax: number;
}> = ({mdBytes, htmlBytes, start, top, barLeft, barMax}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const from = Math.round(start * fps);
  const grow = interpolate(frame, [from, from + Math.round(0.8 * fps)], [0, 1], {
    ...CLAMP,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  // KiB, one decimal under 10 and a whole number from 10 up.
  const kb = (bytes: number) => {
    const k = bytes / 1024;
    return k < 10 ? k.toFixed(1) : String(Math.round(k));
  };
  const rows = [
    {label: 'What the agent handles', width: Math.max(6, (barMax * mdBytes) / htmlBytes), color: theme.accent, value: `${kb(mdBytes)} KB of markdown`, y: top},
    {label: 'What you read', width: barMax, color: theme.text, value: `${kb(htmlBytes)} KB page: theme, layout, charts`, y: top + 34},
  ];
  return (
    <>
      {rows.map((row) => (
        <React.Fragment key={row.label}>
          <div
            style={{
              position: 'absolute',
              left: 80,
              top: row.y - 1,
              width: barLeft - 80 - 16,
              fontFamily: theme.sans,
              fontSize: 18,
              color: theme.muted,
              lineHeight: '26px',
            }}
          >
            {row.label}
          </div>
          <div
            style={{
              position: 'absolute',
              left: barLeft,
              top: row.y + 6,
              width: row.width * grow,
              height: 14,
              borderRadius: 3,
              background: row.color,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: barLeft + row.width * grow + 14,
              top: row.y - 1,
              fontFamily: theme.sans,
              fontSize: 18,
              color: theme.text,
              lineHeight: '26px',
              whiteSpace: 'nowrap',
              opacity: grow,
            }}
          >
            {row.value}
          </div>
        </React.Fragment>
      ))}
    </>
  );
};
