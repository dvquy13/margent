import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLAMP} from '../timing';
import {theme} from '../theme';

// An accent arrow that draws itself along `d` from `start` (seconds) over `duration` (seconds).
// The head appears once the line has reached it. Coordinates are video pixels.
export const FlowArrow: React.FC<{
  d: string;
  head: string;
  start: number;
  duration: number;
}> = ({d, head, start, duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const from = Math.round(start * fps);
  const to = Math.round((start + duration) * fps);
  const draw = interpolate(frame, [from, to], [0, 1], {...CLAMP, easing: Easing.bezier(0.45, 0, 0.2, 1)});
  const headOpacity = interpolate(frame, [to - 2, to + 4], [0, 1], CLAMP);
  return (
    <>
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke={theme.accent}
        strokeWidth={2}
        strokeLinecap="round"
        style={{strokeDasharray: 1, strokeDashoffset: 1 - draw}}
      />
      <polygon points={head} fill={theme.accent} opacity={headOpacity} />
    </>
  );
};
