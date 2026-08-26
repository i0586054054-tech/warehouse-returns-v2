import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Key, Copy, RefreshCw, User } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, profile } = useAuth();
  const [apiToken, setApiToken] = useState(profile?.chatgpt_api_token || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setApiToken(profile.chatgpt_api_token || '');
      setDisplayName(profile.display_name || '');
    }
  }, [profile]);

  async function generateToken() {
    const token = crypto.randomUUID();
    setApiToken(token);
    await supabase
      .from('profiles')
      .update({ chatgpt_api_token: token })
      .eq('id', user.id);
    toast.success('טוקן חדש נוצר');
  }

  function copyToken() {
    navigator.clipboard.writeText(apiToken);
    toast.success('הטוקן הועתק');
  }

  async function saveName() {
    if (!displayName.trim()) {
      toast.error('הזן שם');
      return;
    }
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id);
    toast.success('השם עודכן');
    setSaving(false);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
        <p className="page-subtitle">הגדרות אישיות וחיבור ChatGPT</p>
      </div>

      {/* פרופיל */}
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 25, fontWeight: 900 }}>
          <User size={20} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 8 }} />
          פרופיל
        </h3>
        <div className="form-group">
          <label className="form-label">שם תצוגה</label>
          <input
            className="form-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">אימייל</label>
          <input
            className="form-input"
            value={profile?.email || ''}
            disabled
            dir="ltr"
            style={{ opacity: 0.6 }}
          />
        </div>
        <button
          className="btn btn-primary btn-block"
          onClick={saveName}
          disabled={saving}
        >
          {saving ? 'שומר...' : 'שמור שינויים'}
        </button>
      </div>

      {/* ChatGPT API Token */}
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 25, fontWeight: 900 }}>
          <Key size={20} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 8 }} />
          טוקן ChatGPT
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 18, marginBottom: 16 }}>
          צור טוקן אישי לחיבור שיחת ChatGPT למערכת שלך.
          הכנס את הטוקן ב-ChatGPT Action כדי שברקודים ייכנסו ישירות למערכת.
        </p>

        {apiToken ? (
          <div className="form-group">
            <label className="form-label">הטוקן שלך</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                value={apiToken}
                readOnly
                dir="ltr"
                style={{ fontFamily: 'monospace', fontSize: 16 }}
              />
              <button className="btn btn-outline" onClick={copyToken} title="העתק">
                <Copy size={18} />
              </button>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
            אין טוקן — צור אחד כדי לחבר ChatGPT
          </p>
        )}

        <button className="btn btn-primary btn-block" onClick={generateToken}>
          <RefreshCw size={18} />
          {apiToken ? 'צור טוקן חדש' : 'צור טוקן'}
        </button>
      </div>
    </div>
  );
}
