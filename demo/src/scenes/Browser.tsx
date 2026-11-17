import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {BrowserBar} from '../components/BrowserBar';
import {Caption, type CaptionBox} from '../components/Caption';
import {DiffCard} from '../components/DiffCard';
import {ScreencastClip} from '../components/ScreencastClip';
import type {ClipJson} from '../clips';
import {theme} from '../theme';

// A captured clip in the browser bar, with a caption. With `diff`, a card shows the saved line once the clip holds.
// `children` draws on top of the clip (for example an outline).
export const BrowserScene: React.FC<{
  clip: ClipJson;
  path: string;
  caption: string;
  captionBox?: CaptionBox;
  playbackRate?: number;
  holdSeconds?: number;
  showCursor?: boolean;
  diff?: {before: string; after: string};
  children?: React.ReactNode;
}> = ({clip, path, caption, captionBox, playbackRate = 1, holdSeconds = 0, showCursor = true, diff, children}) => {
  const {fps} = useVideoConfig();
  const holdStart = Math.round((clip.duration / playbackRate) * fps);
  return (
    <AbsoluteFill style={{background: theme.bg}}>
      <ScreencastClip clip={clip} playbackRate={playbackRate} holdSeconds={holdSeconds} showCursor={showCursor} />
      <BrowserBar path={path} />
      {children}
      <Caption text={caption} box={captionBox} />
      {diff && <DiffCard before={diff.before} after={diff.after} start={holdStart} />}
    </AbsoluteFill>
  );
};
