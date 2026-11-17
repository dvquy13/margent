import React from 'react';

// Three dots in the accent blue, as in qrec's demo, for the light browser bar.
export const TrafficDots: React.FC = () => (
  <div style={{display: 'flex', gap: 6, alignItems: 'center', width: 56}}>
    {[1, 0.55, 0.28].map((alpha, i) => (
      <div
        key={i}
        style={{width: 12, height: 12, borderRadius: '50%', background: `rgba(0,98,168,${alpha})`}}
      />
    ))}
  </div>
);
