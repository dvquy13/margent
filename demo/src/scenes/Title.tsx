import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FadeIn} from '../components/FadeIn';
import {theme} from '../theme';

export const TITLE_SECONDS = 3;

export const Title: React.FC = () => (
  <AbsoluteFill
    style={{background: theme.bg, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 28}}
  >
    <FadeIn start={0} duration={18}>
      <div style={{fontFamily: theme.sans, fontSize: 168, fontWeight: 600, letterSpacing: -4, color: theme.accent}}>
        margent
      </div>
    </FadeIn>
    <FadeIn start={30} duration={20}>
      <div style={{fontFamily: theme.sans, fontSize: 36, color: theme.muted}}>
        Your agent writes markdown. You read it as a page.
      </div>
    </FadeIn>
  </AbsoluteFill>
);
