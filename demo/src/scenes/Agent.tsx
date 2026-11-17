import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Caption} from '../components/Caption';
import {TerminalWindow} from '../components/TerminalWindow';
import {commentsOutput} from '../clips';
import {theme} from '../theme';

export const AGENT_SECONDS = 8;

const muted = '#94a3b8';

// The agent's side of the loop: the user says they commented, the agent runs `margent comments` and replies.
export const Agent: React.FC = () => (
  <AbsoluteFill style={{background: theme.bg, justifyContent: 'center', alignItems: 'center'}}>
    {/* Scaled like the Terminal scene so the window fills the frame; drawn at 820px. */}
    <div style={{scale: '1.35'}}>
      <TerminalWindow
        title="agent"
        lines={[
          {text: '> I commented on the launch review', color: theme.termText, startFrame: 20, typewriter: true, typeFrames: 50},
          {text: '● margent comments docs/launch-review.md', color: muted, startFrame: 90},
          ...commentsOutput.lines.map((line, i) => ({
            text: `  ${line}`,
            color: muted,
            startFrame: 120 + i * 20,
          })),
          {
            text: '● Defined week 2 in the funnel caption, replied under c1',
            color: theme.termAccent,
            startFrame: 195,
          },
        ]}
      />
    </div>
    <Caption text="Tell your agent you commented. It reads every note and replies in the doc." start={30} />
  </AbsoluteFill>
);
