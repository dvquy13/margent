import React from 'react';
import {Composition} from 'remotion';
import './fonts';
import {MargentDemo} from './MargentDemo';
import {DEMO_FRAMES} from './timeline';
import {FPS, HEIGHT, WIDTH} from './timing';

const globalStyles = '* { box-sizing: border-box; margin: 0; padding: 0; }';

export const Root: React.FC = () => (
  <>
    <style>{globalStyles}</style>
    <Composition
      id="MargentDemo"
      component={MargentDemo}
      durationInFrames={DEMO_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);
