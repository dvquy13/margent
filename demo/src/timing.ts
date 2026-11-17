import type {ClipJson} from './clips';

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
export const BAR_HEIGHT = 40;
// Clip frames are 1280x680 and sit under the 40px browser bar.
export const SHOT_HEIGHT = HEIGHT - BAR_HEIGHT;
export const TRANSITION_FRAMES = 15;

export const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// A browser scene plays its clip at playbackRate, then holds the last frame for holdSeconds.
export const browserSceneFrames = (clip: ClipJson, playbackRate = 1, holdSeconds = 0) =>
  Math.round((clip.duration / playbackRate + holdSeconds) * FPS);
