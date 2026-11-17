// The captured data from demo/capture.mjs. Import-time checks fail loudly if the capture is malformed.
import diffsJson from '../public/capture/diffs.json';
import editJson from '../public/capture/edit/frames.json';
import commentJson from '../public/capture/comment/frames.json';
import indexJson from '../public/capture/index/frames.json';
import pageJson from '../public/capture/page/frames.json';
import replyJson from '../public/capture/reply/frames.json';
import commentsJson from '../public/capture/comments.json';
import serveJson from '../public/capture/serve.json';
import sizesJson from '../public/capture/sizes.json';

export interface ClipFrame {
  t: number;
  file: string;
}

export interface MouseEvent {
  t: number;
  x: number;
  y: number;
  type: 'move' | 'down' | 'up';
}

export interface ClipJson {
  name: string;
  width: number;
  height: number;
  duration: number;
  frames: ClipFrame[];
  mouse: MouseEvent[];
  errors: string[];
}

export const clips = {
  index: indexJson as ClipJson,
  page: pageJson as ClipJson,
  comment: commentJson as ClipJson,
  edit: editJson as ClipJson,
  reply: replyJson as ClipJson,
};

// The output of `margent comments` on the doc, shown in the agent scene.
export const commentsOutput = commentsJson;

// When the agent's edit lands in the reply clip (clip seconds), and the page boxes the reply outlines sit in
// (page pixels: add the browser bar for video y).
export const replyReloadAt: number = replyJson.reloadAt;
export const replyMarks = replyJson.marks;

const serveMatch = /^margent serving (.+) at (https?:\/\/\S+)$/.exec(serveJson.line);
if (!serveMatch) {
  throw new Error(`capture/serve.json: unexpected serve line "${serveJson.line}"`);
}
const serveUrl = new URL(serveMatch[2]);
const token = serveUrl.searchParams.get('token');
if (!token) {
  throw new Error('capture/serve.json: the serve URL has no token parameter');
}

// Host and port without the token, for the browser bar.
export const serveHost = serveUrl.host;
// The terminal shows the real line with the token cut to six characters.
export const serveLine = serveJson.line.replace(token, `${token.slice(0, 6)}…`);

export const diffs = diffsJson;

// Bytes of launch-review.md and of the page margent renders from it.
export const sizes = sizesJson;
