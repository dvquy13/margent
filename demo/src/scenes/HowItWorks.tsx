import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {diffs, sizes} from '../clips';
import {FadeIn} from '../components/FadeIn';
import {FlowArrow} from '../components/FlowArrow';
import {MarkdownCard} from '../components/MarkdownCard';
import {MiniBrowser} from '../components/MiniBrowser';
import {SizeBand} from '../components/SizeBand';
import {TerminalWindow} from '../components/TerminalWindow';
import {theme} from '../theme';

export const HOW_IT_WORKS_SECONDS = 12;

// Geometry in video pixels. The row of three nodes spans x 80 to 1200; the two gaps between nodes are equal and
// hold the arrows and their labels. The cards are centred on ROW_CENTER_Y.
const ROW_LEFT = 80;
const ROW_WIDTH = 1120;
const ROW_TOP = 146;
const ROW_HEIGHT = 260;
const ROW_CENTER_Y = ROW_TOP + ROW_HEIGHT / 2;
const TERMINAL_W = 260;
const PAPER_W = 280;
const BROWSER_SCALE = 0.25;
const BROWSER_W = 1280 * BROWSER_SCALE;
const BROWSER_H = 720 * BROWSER_SCALE;
const GAP = (ROW_WIDTH - TERMINAL_W - PAPER_W - BROWSER_W) / 2;
const TERMINAL_X = ROW_LEFT;
const PAPER_X = TERMINAL_X + TERMINAL_W + GAP;
const BROWSER_X = PAPER_X + PAPER_W + GAP;
const ARROW_PAD = 6;
const MUTED_TERMINAL = '#94a3b8';

// The head of the file, up to the first table row, without the blank lines: twelve lines.
const sourceLines = diffs.comment.before.split('\n');
const invitedRow = sourceLines.findIndex((l) => l.startsWith('| Invited'));
const sourceHead = sourceLines.slice(0, invitedRow + 1).filter((l) => l.trim() !== '');
if (sourceHead.length !== 12) throw new Error(`How it works: expected 12 markdown lines, got ${sourceHead.length}`);

// A label in a gap, above its arrow.
const labelStyle = (left: number, width: number): React.CSSProperties => ({
  position: 'absolute',
  left,
  width,
  top: ROW_CENTER_Y - 58,
  textAlign: 'center',
  fontSize: 14,
  lineHeight: '20px',
  color: theme.text,
});

// Arrowhead for a line that ends at (x, y) pointing right.
const headRight = (x: number, y: number) => `${x},${y} ${x - 8},${y - 5} ${x - 8},${y + 5}`;

// The explanation: the agent writes one markdown file, margent renders the page from it, and edits flow back.
// The size band at the end says the agent only handles the small file.
export const HowItWorks: React.FC = () => {
  const {fps} = useVideoConfig();
  const at = (seconds: number) => Math.round(seconds * fps);
  const browserBottom = ROW_CENTER_Y + BROWSER_H / 2;
  const paperBottom = ROW_TOP + ROW_HEIGHT;
  const paperCx = PAPER_X + PAPER_W / 2;
  const browserCx = BROWSER_X + BROWSER_W / 2;

  return (
    <AbsoluteFill style={{background: theme.bg, fontFamily: theme.sans}}>
      <FadeIn start={0} style={{position: 'absolute', left: 80, top: 36}}>
        <div style={{fontSize: 40, fontWeight: 600, color: theme.text, letterSpacing: -0.5, lineHeight: '48px'}}>
          How it works
        </div>
      </FadeIn>

      {[
        {label: 'Your agent', x: TERMINAL_X, start: 0.1},
        {label: 'The markdown', x: PAPER_X, start: 0.3},
        {label: 'Your browser', x: BROWSER_X, start: 0.5},
      ].map((node) => (
        <FadeIn key={node.label} start={at(node.start)} style={{position: 'absolute', left: node.x, top: 110}}>
          <div style={{fontSize: 16, color: theme.muted, lineHeight: '24px'}}>{node.label}</div>
        </FadeIn>
      ))}

      <div style={{position: 'absolute', left: TERMINAL_X, top: ROW_TOP, width: ROW_WIDTH, height: ROW_HEIGHT, display: 'flex'}}>
        <div style={{width: TERMINAL_W, height: ROW_HEIGHT, display: 'flex', alignItems: 'center'}}>
          <FadeIn start={at(0.2)} style={{width: TERMINAL_W}}>
            <TerminalWindow
              title="agent"
              width={TERMINAL_W}
              fontSize={12}
              lines={[
                {text: '> write the launch review', color: MUTED_TERMINAL, startFrame: 0},
                {text: '● wrote docs/launch-review.md', color: MUTED_TERMINAL, startFrame: 0},
              ]}
            />
          </FadeIn>
        </div>
        <div style={{width: GAP}} />
        <div style={{width: PAPER_W, height: ROW_HEIGHT, display: 'flex', alignItems: 'center'}}>
          <FadeIn start={at(0.4)} style={{width: PAPER_W}}>
            <MarkdownCard title="launch-review.md" lines={sourceHead} width={PAPER_W} height={ROW_HEIGHT} />
          </FadeIn>
        </div>
        <div style={{width: GAP}} />
        <div style={{width: BROWSER_W, height: ROW_HEIGHT, display: 'flex', alignItems: 'center'}}>
          <FadeIn start={at(0.6)} style={{width: BROWSER_W}}>
            <MiniBrowser scale={BROWSER_SCALE} />
          </FadeIn>
        </div>
      </div>

      <svg width={1280} height={720} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}}>
        <FlowArrow
          d={`M${TERMINAL_X + TERMINAL_W + ARROW_PAD} ${ROW_CENTER_Y} L${PAPER_X - ARROW_PAD} ${ROW_CENTER_Y}`}
          head={headRight(PAPER_X - ARROW_PAD, ROW_CENTER_Y)}
          start={0.8}
          duration={0.8}
        />
        <FlowArrow
          d={`M${PAPER_X + PAPER_W + ARROW_PAD} ${ROW_CENTER_Y} L${BROWSER_X - ARROW_PAD} ${ROW_CENTER_Y}`}
          head={headRight(BROWSER_X - ARROW_PAD, ROW_CENTER_Y)}
          start={2.8}
          duration={0.8}
        />
        <FlowArrow
          // The curve ends in a short straight rise into the head's base, so the head points the way the line arrives.
          d={`M${browserCx} ${browserBottom + ARROW_PAD} C${browserCx} 476, ${paperCx} 476, ${paperCx} ${paperBottom + ARROW_PAD + 26} L${paperCx} ${paperBottom + ARROW_PAD + 9}`}
          head={`${paperCx},${paperBottom + ARROW_PAD} ${paperCx - 6},${paperBottom + ARROW_PAD + 10} ${paperCx + 6},${paperBottom + ARROW_PAD + 10}`}
          start={4.8}
          duration={1.2}
        />
      </svg>

      <FadeIn start={at(1.2)} style={labelStyle(TERMINAL_X + TERMINAL_W, GAP)}>
        writes and reads<br />only this
      </FadeIn>
      <FadeIn start={at(3.2)} style={labelStyle(PAPER_X + PAPER_W, GAP)}>
        margent renders<br />the page
      </FadeIn>
      <FadeIn start={at(5.4)} style={{position: 'absolute', left: paperCx + 20, width: browserCx - paperCx - 40, top: 462, textAlign: 'center', fontSize: 16, lineHeight: '22px', color: theme.text}}>
        your comments and edits are written back here
      </FadeIn>

      <FadeIn start={at(7)} style={{position: 'absolute', left: 0, top: 0, width: 1280, height: 720}}>
        <SizeBand mdBytes={sizes.md} htmlBytes={sizes.html} start={7} top={545} barLeft={340} barMax={520} />
      </FadeIn>
      <FadeIn start={at(8.7)} style={{position: 'absolute', left: 80, top: 634, fontSize: 26, fontWeight: 600, color: theme.text, lineHeight: '34px'}}>
        The agent never generates, reads or patches the HTML.
      </FadeIn>
    </AbsoluteFill>
  );
};
