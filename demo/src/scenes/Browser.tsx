import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {BrowserBar} from '../components/BrowserBar';
import {Caption} from '../components/Caption';
import {DiffCard} from '../components/DiffCard';
import {ScreencastClip} from '../components/ScreencastClip';
import type {ClipJson} from '../clips';
import {theme} from '../theme';

// A captured clip in the browser bar, with a caption. With `diff`, a card shows the saved line once the clip holds.
export const BrowserScene: React.FC<{
  clip: ClipJson;
  path: string;
  caption: string;
  playbackRate?: number;
  holdSeconds?: number;
  diff?: {before: string; after: string};
}> = ({clip, path, caption, playbackRate = 1, holdSeconds = 0, diff}) => {
  const {fps} = useVideoConfig();
  const holdStart = Math.round((clip.duration / playbackRate) * fps);
  return (
    <AbsoluteFill style={{background: theme.bg}}>
      <ScreencastClip clip={clip} playbackRate={playbackRate} holdSeconds={holdSeconds} />
      <BrowserBar path={path} />
      <Caption text={caption} />
      {diff && <DiffCard before={diff.before} after={diff.after} start={holdStart} />}
    </AbsoluteFill>
  );
};
