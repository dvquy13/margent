import React from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ClipFrame, ClipJson, MouseEvent} from '../clips';
import {BAR_HEIGHT, SHOT_HEIGHT, WIDTH} from '../timing';
import {theme} from '../theme';
import {MouseCursor} from './MouseCursor';

const RIPPLE_SECONDS = 0.3;

// The last captured frame at or before t (frames arrive only when the page changes).
function frameAt(frames: ClipFrame[], t: number): ClipFrame {
  let shot = frames[0];
  for (const f of frames) {
    if (f.t > t) break;
    shot = f;
  }
  return shot;
}

// The cursor's position at t, linear between the two logged mouse events around it.
function cursorAt(mouse: MouseEvent[], t: number): {x: number; y: number} {
  if (t <= mouse[0].t) return mouse[0];
  for (let i = 0; i < mouse.length - 1; i++) {
    const a = mouse[i];
    const b = mouse[i + 1];
    if (t < b.t) {
      const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k};
    }
  }
  return mouse[mouse.length - 1];
}

// The most recent press at or before t, if the ripple for it is still running.
function rippleAt(mouse: MouseEvent[], t: number): {x: number; y: number; progress: number} | null {
  for (let i = mouse.length - 1; i >= 0; i--) {
    const e = mouse[i];
    if (e.t > t) continue;
    if (e.type !== 'down') continue;
    const age = t - e.t;
    return age < RIPPLE_SECONDS ? {x: e.x, y: e.y, progress: age / RIPPLE_SECONDS} : null;
  }
  return null;
}

// Plays a captured clip at 1:1 under the browser bar, with the cursor and click ripples drawn from the mouse log.
// The clip stops at its last frame; holdSeconds is not applied here, the scene's length already includes it.
export const ScreencastClip: React.FC<{
  clip: ClipJson;
  playbackRate?: number;
  holdSeconds?: number;
  showCursor?: boolean;
}> = ({clip, playbackRate = 1, showCursor = true}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = Math.min((frame / fps) * playbackRate, clip.duration);
  const shot = frameAt(clip.frames, t);
  const cursor = cursorAt(clip.mouse, t);
  const ripple = showCursor ? rippleAt(clip.mouse, t) : null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: BAR_HEIGHT,
        width: WIDTH,
        height: SHOT_HEIGHT,
        overflow: 'hidden',
        background: theme.bg,
      }}
    >
      <Img
        src={staticFile(`capture/${clip.name}/${shot.file}`)}
        style={{position: 'absolute', left: 0, top: 0, width: WIDTH, height: SHOT_HEIGHT}}
      />
      {ripple && (
        <div
          style={{
            position: 'absolute',
            left: ripple.x - 16 - ripple.progress * 12,
            top: ripple.y - 16 - ripple.progress * 12,
            width: 32 + ripple.progress * 24,
            height: 32 + ripple.progress * 24,
            borderRadius: '50%',
            border: `2px solid ${theme.accent}`,
            opacity: 0.7 * (1 - ripple.progress),
            boxSizing: 'border-box',
          }}
        />
      )}
      {showCursor && <MouseCursor x={cursor.x} y={cursor.y} />}
    </div>
  );
};
