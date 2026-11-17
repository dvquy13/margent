import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Caption} from '../components/Caption';
import {TerminalWindow} from '../components/TerminalWindow';
import {serveLine} from '../clips';
import {theme} from '../theme';

export const TERMINAL_SECONDS = 5;

export const Terminal: React.FC = () => (
  <AbsoluteFill style={{background: theme.bg, justifyContent: 'center', alignItems: 'center'}}>
    {/* Scaled up so a one-command scene fills the frame; the window is drawn at 820px. */}
    <div style={{scale: '1.35'}}>
    <TerminalWindow
      lines={[
        {text: '~/search-beta $ margent serve docs', color: theme.termText, startFrame: 20, typewriter: true, typeFrames: 45},
        {text: serveLine, color: theme.termAccent, startFrame: 90},
      ]}
    />
    </div>
    <Caption text="One command serves every doc in the folder." start={100} />
  </AbsoluteFill>
);
