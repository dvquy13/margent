import React from 'react';
import {BAR_HEIGHT, WIDTH} from '../timing';
import {serveHost} from '../clips';
import {theme} from '../theme';
import {TrafficDots} from './TrafficDots';

// The light bar above every browser clip. The URL is the served host plus the page path, never the token.
export const BrowserBar: React.FC<{path: string}> = ({path}) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: WIDTH,
      height: BAR_HEIGHT,
      background: theme.chrome,
      borderBottom: `1px solid ${theme.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
    }}
  >
    <TrafficDots />
    <div
      style={{
        flex: 1,
        maxWidth: 720,
        height: 26,
        margin: '0 auto',
        borderRadius: 13,
        background: '#ffffff',
        border: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        fontFamily: theme.mono,
        fontSize: 13,
        color: '#374151',
        whiteSpace: 'nowrap',
      }}
    >
      {`${serveHost}${path}`}
    </div>
    <div style={{width: 56}} />
  </div>
);
