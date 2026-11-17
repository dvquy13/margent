import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {CLAMP} from '../timing';

// Fades a child in and rises it 12px over `duration` frames, starting at frame `start`.
export const FadeIn: React.FC<{
  children: React.ReactNode;
  start?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({children, start = 0, duration = 18, style}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + duration], [0, 1], {
    ...CLAMP,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return <div style={{opacity: p, translate: `0 ${(1 - p) * 12}px`, ...style}}>{children}</div>;
};
