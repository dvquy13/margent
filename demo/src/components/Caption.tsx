import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, HEIGHT, WIDTH} from '../timing';
import {theme} from '../theme';

export interface CaptionBox {
  left: number;
  top: number;
  width: number;
}

// Lower-third pill, bottom centre, or a wrapping card at `box` when the bottom holds what the scene is about.
// Fades in over 8 frames from `start`.
export const Caption: React.FC<{text: string; start?: number; box?: CaptionBox}> = ({text, start = 0, box}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + 8], [0, 1], CLAMP);
  return (
    <div
      style={{
        position: 'absolute',
        left: box?.left ?? 0,
        top: box?.top ?? HEIGHT - 84,
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
