import React from 'react';
import {useVideoConfig} from 'remotion';
import {clips, replyMarks, replyReloadAt} from '../clips';
import {CaptionBox} from '../components/Caption';
import {PageOutline} from '../components/PageOutline';
import {BAR_HEIGHT, browserSceneFrames, HEIGHT} from '../timing';
import {BrowserScene} from './Browser';

export const REPLY_HOLD_SECONDS = 0.5;

// Page geometry: the page is 680px tall under the browser bar, and its top bar takes the first 56px.
const PAGE_HEIGHT = HEIGHT - BAR_HEIGHT;
const TOP_BAR = 56;
const PAD = 4;
const GAP = 8;
// A caption box needs about this much free height beside the card; below it the caption is the bottom pill.
const MIN_BOX = 110;

// The caption sits in the card's column, in the larger free span above or below the card. Returns undefined when
// neither span is tall enough.
function railCaption(): CaptionBox | undefined {
  const card = replyMarks.card;
  const above = {top: TOP_BAR + GAP, bottom: card.y - PAD - GAP};
  const below = {top: card.y + card.height + PAD + GAP, bottom: PAGE_HEIGHT - GAP};
  const aboveHeight = above.bottom - above.top;
  const belowHeight = below.bottom - below.top;
  if (Math.max(aboveHeight, belowHeight) < MIN_BOX) return undefined;
  if (aboveHeight >= belowHeight) {
    return {left: card.x, width: card.width, bottom: HEIGHT - (BAR_HEIGHT + above.bottom)};
  }
  return {left: card.x, width: card.width, top: BAR_HEIGHT + below.top};
}

const captionBox = railCaption();

// The page reloads with the agent's reply. The three outlines mark what changed: the c1 card, the stage the agent
// moved, and the caption it edited. They fade in from the reload, one after another; the mouse is not used here.
export const Reply: React.FC = () => {
  const {fps} = useVideoConfig();
  const reload = Math.round(replyReloadAt * fps);
  const stagger = Math.round(0.15 * fps);
  const endFrame = browserSceneFrames(clips.reply, 1, REPLY_HOLD_SECONDS);
  return (
    <BrowserScene
      clip={clips.reply}
      path="/launch-review.html"
      holdSeconds={REPLY_HOLD_SECONDS}
      showCursor={false}
      caption="The page reloads with the reply. You resolve the thread when it's done."
      captionBox={captionBox}
      captionStart={reload}
    >
      <PageOutline box={replyMarks.card} start={reload} endFrame={endFrame} />
      <PageOutline box={replyMarks.stage} start={reload + stagger} endFrame={endFrame} />
      <PageOutline box={replyMarks.caption} start={reload + 2 * stagger} endFrame={endFrame} />
    </BrowserScene>
  );
};
