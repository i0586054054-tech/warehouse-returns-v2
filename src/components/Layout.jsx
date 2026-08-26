import { Outlet } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';
import BottomNav from './BottomNav';
import BackgroundSlider from './BackgroundSlider';

export default function Layout() {
  const { theme, toggle } = useTheme();

  return (
    <div className="app-layout">
      <BackgroundSlider />
      <button className="theme-toggle" onClick={toggle} title="החלף ערכת נושא">
        {theme === 'dark' ? <Sun size={28} /> : <Moon size={28} />}
      </button>
      <main className="main-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
