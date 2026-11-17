import React from 'react';
import {staticFile, Img} from 'remotion';
import {BAR_HEIGHT, HEIGHT, SHOT_HEIGHT, WIDTH} from '../timing';
import {theme} from '../theme';
import {BrowserBar} from './BrowserBar';

// The browser bar and the first captured page, drawn at full size and scaled down as a whole.
// The outer box is the scaled size; `scale` is the factor (the page is 1280 wide).
export const MiniBrowser: React.FC<{scale: number}> = ({scale}) => (
  <div
    style={{
      position: 'relative',
      width: WIDTH * scale,
      height: HEIGHT * scale,
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
      overflow: 'hidden',
      background: theme.bg,
    }}
  >
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: WIDTH,
        height: HEIGHT,
        scale: String(scale),
        transformOrigin: '0 0',
      }}
    >
      <BrowserBar path="/launch-review.html" />
      <Img
        src={staticFile('capture/page/0.jpg')}
        style={{position: 'absolute', left: 0, top: BAR_HEIGHT, width: WIDTH, height: SHOT_HEIGHT}}
      />
    </div>
  </div>
);
