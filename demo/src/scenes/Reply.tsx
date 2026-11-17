import React from 'react';
import {clips} from '../clips';
import {RailOutline} from '../components/RailOutline';
import {BrowserScene} from './Browser';

export const REPLY_HOLD_SECONDS = 1.5;

// The page reloads with the agent's reply. The mouse is not used here, so no cursor.
export const Reply: React.FC = () => (
  <BrowserScene
    clip={clips.reply}
    path="/launch-review.html"
    holdSeconds={REPLY_HOLD_SECONDS}
    showCursor={false}
    caption="The page reloads with the reply. You resolve the thread when it's done."
    // The bottom of the page holds the funnel caption the agent edited, so the caption sits in the empty rail below the card.
    captionBox={{left: 944, top: 470, width: 324}}
  >
    {/* The c1 card with the reply, and the funnel caption the agent edited. */}
    <RailOutline left={944} top={178} width={324} height={216} />
    <RailOutline left={6} top={590} width={720} height={54} />
  </BrowserScene>
);
