import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {replyReload} from '../clips';
import {BAR_HEIGHT, CLAMP} from '../timing';
import {theme} from '../theme';

// Soft outline in the reply clip, drawn in video pixels: a box in page pixels from reply/5.jpg plus the browser bar.
// It fades in from the frame where the reply lands.
export const RailOutline: React.FC<{left: number; top: number; width: number; height: number}> = ({left, top, width, height}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const start = Math.round(replyReload!.t * fps);
  const opacity = interpolate(frame, [start, start + Math.round(0.4 * fps)], [0, 1], CLAMP);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: BAR_HEIGHT + top,
        width,
        height,
        border: `2px solid ${theme.accent}`,
        borderRadius: 8,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};
