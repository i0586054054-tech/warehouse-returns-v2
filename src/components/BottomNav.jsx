import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ScanBarcode, Building2, Package } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'דשבורד' },
  { to: '/scan', icon: ScanBarcode, label: 'סריקה' },
  { to: '/companies', icon: Building2, label: 'חברות' },
  { to: '/barcodes', icon: Package, label: 'ברקודים' },
];

export default function BottomNav() {
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
