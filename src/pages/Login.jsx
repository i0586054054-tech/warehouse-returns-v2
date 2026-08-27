import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { LogIn } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in — redirect to dashboard
  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('הזן אימייל וסיסמה');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      toast.error('אימייל או סיסמה שגויים');
    } else {
      navigate('/', { replace: true });
    }
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>מערכת החזרות</h1>
          <p>התחבר כדי להמשיך</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">אימייל</label>
            <input
              className="form-input"
              type="email"
              placeholder="הזן אימייל..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">סיסמה</label>
            <input
              className="form-input"
              type="password"
              placeholder="הזן סיסמה..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            <LogIn size={18} />
            {loading ? 'מתחבר...' : 'התחבר'}
          </button>
        </form>

        <p className="login-footer">
          רק משתמשים מוזמנים יכולים להתחבר
        </p>
      </div>
    </div>
  );
}
