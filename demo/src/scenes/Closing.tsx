import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FadeIn} from '../components/FadeIn';
import {theme} from '../theme';

export const CLOSING_SECONDS = 5;

const lines = [
  {text: 'npm i -g margent', color: theme.text, start: 40},
  {text: 'margent serve docs/', color: theme.text, start: 80},
  {text: 'github.com/dvquy13/margent', color: theme.accent, start: 120},
];

export const Closing: React.FC = () => (
  <AbsoluteFill style={{background: theme.bg, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 22}}>
    <FadeIn start={0} duration={14}>
      <div style={{fontFamily: theme.sans, fontSize: 24, color: theme.muted, marginBottom: 14}}>
        Markdown for the agent. A page for you. Edits flow back.
      </div>
    </FadeIn>
    {lines.map((line) => (
      <FadeIn key={line.text} start={line.start} duration={14}>
        <div style={{fontFamily: theme.mono, fontSize: 36, color: line.color}}>{line.text}</div>
      </FadeIn>
    ))}
  </AbsoluteFill>
);
