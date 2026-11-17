import {clips} from './clips';
import {browserSceneFrames, FPS, TRANSITION_FRAMES} from './timing';
import {TITLE_SECONDS} from './scenes/Title';
import {HOW_IT_WORKS_SECONDS} from './scenes/HowItWorks';
import {TERMINAL_SECONDS} from './scenes/Terminal';
import {AGENT_SECONDS} from './scenes/Agent';
import {REPLY_HOLD_SECONDS} from './scenes/Reply';
import {CLOSING_SECONDS} from './scenes/Closing';

// Playback rates of the browser clips. The clip time, the cursor and the mouse log all follow the same rate.
export const RATES = {page: 1.4, comment: 1.25, edit: 1.25} as const;

// The scenes in order, with their lengths in frames. Browser scenes take their length from the clip.
export const SCENE_FRAMES = {
  title: Math.round(TITLE_SECONDS * FPS),
  terminal: Math.round(TERMINAL_SECONDS * FPS),
  index: browserSceneFrames(clips.index),
  page: browserSceneFrames(clips.page, RATES.page),
  comment: browserSceneFrames(clips.comment, RATES.comment, 3.5),
  agent: Math.round(AGENT_SECONDS * FPS),
  reply: browserSceneFrames(clips.reply, 1, REPLY_HOLD_SECONDS),
  edit: browserSceneFrames(clips.edit, RATES.edit, 3.5),
  how: Math.round(HOW_IT_WORKS_SECONDS * FPS),
  closing: Math.round(CLOSING_SECONDS * FPS),
};

const sceneTotal = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0);
// Scenes entered by a hard cut, not a fade: the browser clips before them end on the very frame they start on (the
// capture continues one session), so a cut is invisible and the cursor never doubles.
export const HARD_JOINS: ReadonlySet<keyof typeof SCENE_FRAMES> = new Set(['page', 'comment', 'edit']);

// Each fade overlaps both scenes, so every scene entered by a fade shortens the timeline by one fade.
const fades = Object.keys(SCENE_FRAMES).length - 1 - HARD_JOINS.size;
export const DEMO_FRAMES = sceneTotal - fades * TRANSITION_FRAMES;
