import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DAY_OPTIONS } from '../lib/helpers';
import Modal from '../components/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const emptyForm = {
  name: '',
  agent_name: '',
  agent_phone: '',
  pickup_day: '',
  agent_visit_day: '',
  has_agent: false,
  notes: '',
};

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    setLoading(true);
    const { data } = await supabase
      .from('companies')
      .select('*, barcodes(count)')
      .order('name');
    setCompanies(data || []);
    setLoading(false);
  }

  function openAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(company) {
    setForm({
      name: company.name || '',
      agent_name: company.agent_name || '',
      agent_phone: company.agent_phone || '',
      pickup_day: company.pickup_day ?? '',
      agent_visit_day: company.agent_visit_day ?? '',
      has_agent: company.has_agent || false,
      notes: company.notes || '',
    });
    setEditingId(company.id);
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('הזן שם חברה');
      return;
    }

    const payload = {
      ...form,
      pickup_day: form.pickup_day === '' ? null : parseInt(form.pickup_day),
      agent_visit_day: form.agent_visit_day === '' ? null : parseInt(form.agent_visit_day),
    };

    try {
      if (editingId) {
        await supabase.from('companies').update(payload).eq('id', editingId);
        toast.success('חברה עודכנה');
      } else {
        await supabase.from('companies').insert(payload);
        toast.success('חברה נוספה');
      }
      setModalOpen(false);
      triggerSync();
      loadCompanies();
    } catch (err) {
      toast.error('שגיאה בשמירה');
    }
  }

  function triggerSync() {
    fetch('/api/sync-sheets', { method: 'POST' }).catch(() => {});
  }

  async function handleDelete(company) {
    if (!confirm(`למחוק את ${company.name}? כל הברקודים שלה יימחקו.`)) return;
    try {
      await supabase.from('companies').delete().eq('id', company.id);
      toast.success('חברה נמחקה');
      triggerSync();
      loadCompanies();
    } catch (err) {
      toast.error('שגיאה במחיקה');
    }
  }

  const filtered = companies
    .filter(
      (c) =>
        c.name.includes(search) ||
        (c.agent_name && c.agent_name.includes(search))
    )
    .sort((a, b) => {
      const aCount = a.barcodes?.[0]?.count || 0;
      const bCount = b.barcodes?.[0]?.count || 0;
      if (aCount > 0 && bCount === 0) return -1;
      if (aCount === 0 && bCount > 0) return 1;
      return a.name.localeCompare(b.name);
    });

  const dayLabel = (dayIndex) => {
    if (dayIndex == null) return '—';
    return DAY_OPTIONS.find((d) => d.value === dayIndex)?.label || '—';
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">חברות</h1>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <Plus size={16} /> הוסף
          </button>
        </div>
        <p className="page-subtitle">{companies.length} חברות במערכת</p>
      </div>

      {/* חיפוש */}
      <div className="search-box">
        <Search />
        <input
          placeholder="חפש חברה או סוכן..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state"><p>טוען...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>לא נמצאו חברות</p></div>
      ) : (
        filtered.map((company) => (
          <div className="company-card" key={company.id} style={(company.barcodes?.[0]?.count || 0) > 0 ? { background: 'rgba(255, 107, 53, 0.1)', borderColor: 'rgba(255, 107, 53, 0.3)' } : undefined}>
            <div className="company-info">
              <h3>{company.name}</h3>
              <p>
                {company.has_agent
                  ? `סוכן: ${company.agent_name || 'לא צוין'} · הגעה: ${dayLabel(company.agent_visit_day)}`
                  : `איסוף: ${dayLabel(company.pickup_day)}`}
                {' · '}
                {company.barcodes?.[0]?.count || 0} ברקודים
              </p>
            </div>
            <div className="action-row">
              <button className="btn btn-outline btn-sm" onClick={() => openEdit(company)}>
                <Pencil size={14} />
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(company)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))
      )}

      {/* מודל הוספה/עריכה */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'עריכת חברה' : 'הוספת חברה'}
      >
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">שם חברה *</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.has_agent}
                onChange={(e) => setForm({ ...form, has_agent: e.target.checked })}
              />
              <span className="form-label" style={{ margin: 0 }}>יש סוכן</span>
            </label>
          </div>

          {form.has_agent && (
            <>
              <div className="form-group">
                <label className="form-label">שם סוכן</label>
                <input
                  className="form-input"
                  value={form.agent_name}
                  onChange={(e) => setForm({ ...form, agent_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">טלפון סוכן</label>
                <input
                  className="form-input"
                  type="tel"
                  value={form.agent_phone}
                  onChange={(e) => setForm({ ...form, agent_phone: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">יום הגעת סוכן</label>
                <select
                  className="form-select"
                  value={form.agent_visit_day}
                  onChange={(e) => setForm({ ...form, agent_visit_day: e.target.value })}
                >
                  <option value="">— בחר —</option>
                  {DAY_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">יום איסוף</label>
            <select
              className="form-select"
              value={form.pickup_day}
              onChange={(e) => setForm({ ...form, pickup_day: e.target.value })}
            >
              <option value="">— בחר —</option>
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">הערות</label>
            <input
              className="form-input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            {editingId ? 'שמור שינויים' : 'הוסף חברה'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
