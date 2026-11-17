import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Same loading pattern as qrec's demo: loadFont registers the face and holds the render until it is ready.
loadFont({
  family: 'Google Sans Flex',
  url: staticFile('fonts/GoogleSansFlex-latin.woff2'),
  format: 'woff2',
  weight: '100 900',
  display: 'block',
});

loadFont({
  family: 'Google Sans Code',
  url: staticFile('fonts/GoogleSansCode-VariableFont_wght.ttf'),
  format: 'truetype',
  weight: '100 900',
  display: 'block',
});
