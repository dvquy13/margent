import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, HEIGHT, WIDTH} from '../timing';
import {theme} from '../theme';

// Lower-third pill, bottom centre. Fades in over 8 frames from `start`.
export const Caption: React.FC<{text: string; start?: number}> = ({text, start = 0}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + 8], [0, 1], CLAMP);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: HEIGHT - 84,
        width: WIDTH,
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
          borderRadius: 999,
          padding: '12px 28px',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  );
};
