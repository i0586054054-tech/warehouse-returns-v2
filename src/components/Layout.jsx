import { Outlet } from 'react-router-dom';
import { Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';
import { useAuth } from '../lib/AuthContext';
import BottomNav from './BottomNav';

export default function Layout() {
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();

  return (
    <div className="app-layout">
      <div className="top-bar">
        <button className="theme-toggle" onClick={toggle} title="החלף ערכת נושא">
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button className="signout-btn" onClick={signOut} title="התנתק">
          <LogOut size={18} />
        </button>
      </div>
      <main className="main-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
