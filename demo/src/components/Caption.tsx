import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, HEIGHT, WIDTH} from '../timing';
import {theme} from '../theme';

export interface CaptionBox {
  left: number;
  width: number;
  /** Anchor the box's top edge, or its bottom edge (video pixels). */
  top?: number;
  bottom?: number;
}

// Lower-third pill, bottom centre, or a wrapping card at `box` when the bottom holds what the scene is about.
// Fades in over 8 frames from `start`, and with `end` (the scene's length) out over its last 8 frames, so a hard cut
// to the next scene never drops it in one frame.
export const Caption: React.FC<{text: string; start?: number; end?: number; box?: CaptionBox}> = ({text, start = 0, end, box}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [start, start + 8], [0, 1], CLAMP);
  const opacity = end === undefined ? fadeIn : Math.min(fadeIn, interpolate(frame, [end - 8, end], [1, 0], CLAMP));
  return (
    <div
      style={{
        position: 'absolute',
        left: box?.left ?? 0,
        top: box ? box.top : HEIGHT - 84,
        bottom: box?.bottom,
        width: box?.width ?? WIDTH,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          background: 'rgba(10,10,10,0.82)',
          color: '#ffffff',
          fontFamily: theme.sans,
          fontSize: 22,
          borderRadius: box ? 16 : 999,
          padding: box ? '14px 20px' : '12px 28px',
          lineHeight: box ? 1.35 : undefined,
          whiteSpace: box ? 'normal' : 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  );
};
