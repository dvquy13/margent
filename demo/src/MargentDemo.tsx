import React from 'react';
import {AbsoluteFill} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {clips, diffs} from './clips';
import {Title} from './scenes/Title';
import {HowItWorks} from './scenes/HowItWorks';
import {Terminal} from './scenes/Terminal';
import {BrowserScene} from './scenes/Browser';
import {Closing} from './scenes/Closing';
import {Agent} from './scenes/Agent';
import {Reply} from './scenes/Reply';
import {RATES, SCENE_FRAMES} from './timeline';
import {TRANSITION_FRAMES} from './timing';
import {theme} from './theme';

const cut = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_FRAMES})} />;

export const MargentDemo: React.FC = () => (
  <AbsoluteFill style={{background: theme.bg}}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Title" durationInFrames={SCENE_FRAMES.title}>
        <Title />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="How it works" durationInFrames={SCENE_FRAMES.how}>
        <HowItWorks />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="Terminal" durationInFrames={SCENE_FRAMES.terminal}>
        <Terminal />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="Index" durationInFrames={SCENE_FRAMES.index}>
        <BrowserScene clip={clips.index} path="/" caption="Your browser opens on the docs. Click one to read it." />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="Page" durationInFrames={SCENE_FRAMES.page}>
        <BrowserScene
          clip={clips.page}
          path="/launch-review.html"
          playbackRate={RATES.page}
          caption="Charts and diagrams render from the markdown."
        />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="Comment" durationInFrames={SCENE_FRAMES.comment}>
        <BrowserScene
          clip={clips.comment}
          path="/launch-review.html"
          playbackRate={RATES.comment}
          holdSeconds={3.5}
          caption="Select words and comment. The note is saved into the .md."
          diff={diffs.comment}
        />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="Agent" durationInFrames={SCENE_FRAMES.agent}>
        <Agent />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="Reply" durationInFrames={SCENE_FRAMES.reply}>
        <Reply />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="Edit" durationInFrames={SCENE_FRAMES.edit}>
        <BrowserScene
          clip={clips.edit}
          path="/launch-review.html"
          playbackRate={RATES.edit}
          holdSeconds={3.5}
          caption="Click a paragraph to edit. It saves when you click away."
          diff={diffs.edit}
        />
      </TransitionSeries.Sequence>
      {cut}
      <TransitionSeries.Sequence name="Closing" durationInFrames={SCENE_FRAMES.closing}>
        <Closing />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
