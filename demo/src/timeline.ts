import {clips} from './clips';
import {browserSceneFrames, FPS, TRANSITION_FRAMES} from './timing';
import {TITLE_SECONDS} from './scenes/Title';
import {TERMINAL_SECONDS} from './scenes/Terminal';
import {CLOSING_SECONDS} from './scenes/Closing';

// The scenes in order, with their lengths in frames. Browser scenes take their length from the clip.
export const SCENE_FRAMES = {
  title: Math.round(TITLE_SECONDS * FPS),
  terminal: Math.round(TERMINAL_SECONDS * FPS),
  index: browserSceneFrames(clips.index),
  page: browserSceneFrames(clips.page, 1.3),
  comment: browserSceneFrames(clips.comment, 1, 3.5),
  edit: browserSceneFrames(clips.edit, 1, 3.5),
  closing: Math.round(CLOSING_SECONDS * FPS),
};

const sceneTotal = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0);
// Seven scenes make six cuts, and each cut is a fade that overlaps both scenes.
export const DEMO_FRAMES = sceneTotal - 6 * TRANSITION_FRAMES;
