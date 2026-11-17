import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Caption} from '../components/Caption';
import {FadeIn} from '../components/FadeIn';
import {FileTree, TREE_ROW, TREE_PAD, TREE_WIDTH} from '../components/FileTree';
import {TerminalWindow} from '../components/TerminalWindow';
import {serveLine} from '../clips';
import {theme} from '../theme';

export const TERMINAL_SECONDS = 7;

// Layout in video pixels. The tree (x 80) and the terminal sit side by side and are both centred on CENTER_Y.
// The terminal is drawn at 680px and scaled to 1.15, so its right edge lands on x 1200.
const CENTER_Y = 360;
const TREE_X = 80;
const TREE_HEIGHT = 2 * TREE_PAD + 8 * TREE_ROW + 2;
const TREE_TOP = CENTER_Y - TREE_HEIGHT / 2;
const TREE_BOTTOM = TREE_TOP + TREE_HEIGHT;
const TERM_W = 680;
const TERM_SCALE = 1.15;
const TERM_X = TREE_X + TREE_WIDTH + 26;
// The terminal's height at 1x: title bar, the 120px content area and the border.
const TERM_H = 157;
const TERM_TOP = CENTER_Y - (TERM_H * TERM_SCALE) / 2;

const TYPE_START = 15;
const TYPE_FRAMES = 40;
// The command is typed out at this frame: the docs/ block and its command text are highlighted together.
const TYPE_END = TYPE_START + TYPE_FRAMES;

export const Terminal: React.FC = () => (
  <AbsoluteFill style={{background: theme.bg}}>
    <FadeIn start={0} duration={15} style={{position: 'absolute', left: TREE_X, top: TREE_TOP, width: TREE_WIDTH}}>
      <FileTree highlightFrame={TYPE_END} />
    </FadeIn>
    <FadeIn
      start={TYPE_END}
      duration={8}
      style={{
        position: 'absolute',
        left: TREE_X,
        top: TREE_BOTTOM + 14,
        fontFamily: theme.sans,
        fontSize: 16,
        lineHeight: '22px',
        color: theme.accent,
        whiteSpace: 'nowrap',
      }}
    >
      the folder with your markdown
    </FadeIn>

    <div
      style={{
        position: 'absolute',
        left: TERM_X,
        top: TERM_TOP,
        width: TERM_W,
        scale: String(TERM_SCALE),
        transformOrigin: '0 0',
      }}
    >
      <TerminalWindow
        width={TERM_W}
        fontSize={13}
        lines={[
          {
            text: '~/search-beta $ margent serve docs/',
            color: theme.termText,
            startFrame: TYPE_START,
            typewriter: true,
            typeFrames: TYPE_FRAMES,
            highlight: {text: 'docs/', startFrame: TYPE_END},
          },
          {text: serveLine, color: theme.termAccent, startFrame: 100},
        ]}
      />
    </div>

    <Caption text="Serve the folder with your markdown. Every .md in it becomes a page." start={110} />
  </AbsoluteFill>
);
