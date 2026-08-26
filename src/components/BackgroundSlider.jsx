import { useState, useEffect, useCallback } from 'react';
import { Pause, Play, Lock, Unlock } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';

const SLIDE_COUNT = 3;
const INTERVAL = 8000;

export default function BackgroundSlider() {
  const { theme } = useTheme();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [locked, setLocked] = useState(false);

  const advance = useCallback(() => {
    setActive((prev) => (prev + 1) % SLIDE_COUNT);
  }, []);

  useEffect(() => {
    if (paused || locked) return;
    const id = setInterval(advance, INTERVAL);
    return () => clearInterval(id);
  }, [paused, locked, advance]);

  if (theme === 'dark') return null;

  return (
    <>
      <div className="bg-slider">
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <div
            key={i}
            className={`bg-slider-slide bg-slide-${i} ${i === active ? 'active' : ''}`}
          />
        ))}
      </div>

      <div className="bg-slider-controls">
        <button
          className="bg-slider-btn"
          onClick={() => {
            if (locked) {
              setLocked(false);
            } else {
              setPaused((p) => !p);
            }
          }}
          title={locked ? 'שחרר נעילה' : paused ? 'המשך' : 'עצור'}
        >
          {locked ? <Unlock size={18} /> : paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
        <button
          className="bg-slider-btn"
          onClick={() => {
            setLocked((l) => !l);
            if (!locked) setPaused(false);
          }}
          title={locked ? 'בטל קיבוע' : 'קבע תמונה נוכחית'}
        >
          <Lock size={18} />
        </button>
        <div className="bg-slider-dots">
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <button
              key={i}
              className={`bg-slider-dot ${i === active ? 'active' : ''}`}
              onClick={() => {
                setActive(i);
                setLocked(true);
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
