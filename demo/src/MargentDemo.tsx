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
import {HARD_JOINS, RATES, SCENE_FRAMES} from './timeline';
import {TRANSITION_FRAMES} from './timing';
import {theme} from './theme';

const cut = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_FRAMES})} />;
// How a scene is entered: a fade, or a hard cut where the clip before ends on the frame this one starts on.
const enter = (scene: keyof typeof SCENE_FRAMES) => (HARD_JOINS.has(scene) ? null : cut);

export const MargentDemo: React.FC = () => (
  <AbsoluteFill style={{background: theme.bg}}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Title" durationInFrames={SCENE_FRAMES.title}>
        <Title />
      </TransitionSeries.Sequence>
      {enter('terminal')}
      <TransitionSeries.Sequence name="Terminal" durationInFrames={SCENE_FRAMES.terminal}>
        <Terminal />
      </TransitionSeries.Sequence>
      {enter('index')}
      <TransitionSeries.Sequence name="Index" durationInFrames={SCENE_FRAMES.index}>
        <BrowserScene clip={clips.index} path="/" caption="Every .md in docs/, as a page. Click one to read it." />
      </TransitionSeries.Sequence>
      {enter('page')}
      <TransitionSeries.Sequence name="Page" durationInFrames={SCENE_FRAMES.page}>
        <BrowserScene
          clip={clips.page}
          path="/launch-review.html"
          playbackRate={RATES.page}
          caption="Charts and diagrams render from the markdown."
        />
      </TransitionSeries.Sequence>
      {enter('comment')}
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
      {enter('agent')}
      <TransitionSeries.Sequence name="Agent" durationInFrames={SCENE_FRAMES.agent}>
        <Agent />
      </TransitionSeries.Sequence>
      {enter('reply')}
      <TransitionSeries.Sequence name="Reply" durationInFrames={SCENE_FRAMES.reply}>
        <Reply />
      </TransitionSeries.Sequence>
      {enter('edit')}
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
      {enter('how')}
      <TransitionSeries.Sequence name="How it works" durationInFrames={SCENE_FRAMES.how}>
        <HowItWorks />
      </TransitionSeries.Sequence>
      {enter('closing')}
      <TransitionSeries.Sequence name="Closing" durationInFrames={SCENE_FRAMES.closing}>
        <Closing />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
