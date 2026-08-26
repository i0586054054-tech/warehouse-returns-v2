import { Outlet } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';
import BottomNav from './BottomNav';

export default function Layout() {
  const { theme, toggle } = useTheme();

  return (
    <div className="app-layout">
      <button className="theme-toggle" onClick={toggle} title="החלף ערכת נושא">
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <main className="main-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
