import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {BAR_HEIGHT, CLAMP} from '../timing';
import {theme} from '../theme';

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A soft accent outline around a box of the page. `box` is in page pixels; the browser bar is added here.
// It fades in from `start` (a frame) and fades out before `endFrame`, so it is gone when the scene cuts.
export const PageOutline: React.FC<{box: PageBox; start: number; endFrame: number}> = ({box, start, endFrame}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [start, start + 12], [0, 1], CLAMP);
  const fadeOut = interpolate(frame, [endFrame - 18, endFrame - 15], [1, 0], CLAMP);
  const pad = 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x - pad,
        top: BAR_HEIGHT + box.y - pad,
        width: box.width + 2 * pad,
        height: box.height + 2 * pad,
        border: `2px solid ${theme.accent}`,
        borderRadius: 8,
        opacity: fadeIn * fadeOut,
        pointerEvents: 'none',
      }}
    />
  );
};
