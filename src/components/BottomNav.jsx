import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ScanBarcode, Building2, Package, Shield, Cog } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function BottomNav() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'דשבורד' },
    { to: '/scan', icon: ScanBarcode, label: 'סריקה' },
    { to: '/companies', icon: Building2, label: 'חברות' },
    { to: '/barcodes', icon: Package, label: 'ברקודים' },
    { to: '/settings', icon: Cog, label: 'הגדרות' },
    ...(isAdmin ? [{ to: '/admin', icon: Shield, label: 'ניהול' }] : []),
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
