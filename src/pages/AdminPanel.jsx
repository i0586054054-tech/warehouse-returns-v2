import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { UserPlus, Users, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error('הזן אימייל');
      return;
    }

    setInviting(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          display_name: inviteName.trim() || inviteEmail.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'שגיאה בהזמנה');
      }

      toast.success(`הזמנה נשלחה ל-${inviteEmail}`);
      setInviteEmail('');
      setInviteName('');
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    }
    setInviting(false);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ניהול משתמשים</h1>
        <p className="page-subtitle">{users.length} משתמשים במערכת</p>
      </div>

      {/* הזמנת משתמש */}
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 25, fontWeight: 900 }}>
          <UserPlus size={20} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 8 }} />
          הזמן משתמש חדש
        </h3>
        <form onSubmit={handleInvite}>
          <div className="form-group">
            <label className="form-label">שם</label>
            <input
              className="form-input"
              placeholder="שם המשתמש..."
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">אימייל *</label>
            <input
              className="form-input"
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={inviting}
          >
            <UserPlus size={18} />
            {inviting ? 'שולח...' : 'שלח הזמנה'}
          </button>
        </form>
      </div>

      {/* רשימת משתמשים */}
      <div className="section">
        <div className="section-title">
          <Users size={20} />
          משתמשים רשומים
        </div>

        {loading ? (
          <div className="empty-state"><p>טוען...</p></div>
        ) : users.length === 0 ? (
          <div className="empty-state"><p>אין משתמשים</p></div>
        ) : (
          users.map((u) => (
            <div className="company-card" key={u.id}>
              <div className="company-info">
                <h3>{u.display_name}</h3>
                <p>
                  {u.email}
                  {' · '}
                  <span className={`badge ${u.role === 'admin' ? 'badge-info' : 'badge-success'}`}>
                    {u.role === 'admin' ? 'אדמין' : 'משתמש'}
                  </span>
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
