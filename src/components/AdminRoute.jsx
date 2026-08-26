import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function AdminRoute({ children }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="empty-state">
        <p>טוען...</p>
      </div>
    );
  }

  if (profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}
