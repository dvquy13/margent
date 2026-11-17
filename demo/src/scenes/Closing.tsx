import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FadeIn} from '../components/FadeIn';
import {theme} from '../theme';

export const CLOSING_SECONDS = 5;

const lines = [
  {text: 'npm i -g margent', color: theme.text, start: 10},
  {text: 'margent serve docs', color: theme.text, start: 50},
  {text: 'github.com/dvquy13/margent', color: theme.accent, start: 90},
];

export const Closing: React.FC = () => (
  <AbsoluteFill style={{background: theme.bg, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 22}}>
    {lines.map((line) => (
      <FadeIn key={line.text} start={line.start} duration={14}>
        <div style={{fontFamily: theme.mono, fontSize: 36, color: line.color}}>{line.text}</div>
      </FadeIn>
    ))}
  </AbsoluteFill>
);
