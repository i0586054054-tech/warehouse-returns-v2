import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Pencil, Trash2, Package } from 'lucide-react';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

export default function Barcodes() {
  const [barcodes, setBarcodes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(null);
  const [editQty, setEditQty] = useState(1);

  useEffect(() => {
    loadData();
  }, [filterCompany]);

  async function loadData() {
    setLoading(true);

    // טוען חברות לסינון
    const { data: compData } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');
    setCompanies(compData || []);

    // טוען ברקודים
    let query = supabase
      .from('barcodes')
      .select('*, companies(name)')
      .order('updated_at', { ascending: false });

    if (filterCompany) {
      query = query.eq('company_id', filterCompany);
    }

    const { data } = await query;
    setBarcodes(data || []);
    setLoading(false);
  }

  async function handleDelete(item) {
    if (!confirm(`למחוק ברקוד ${item.barcode}?`)) return;
    await supabase.from('barcodes').delete().eq('id', item.id);
    toast.success('ברקוד נמחק');
    triggerSync();
    loadData();
  }

  async function handleUpdateQty() {
    if (!editModal) return;
    await supabase
      .from('barcodes')
      .update({ quantity: editQty })
      .eq('id', editModal.id);
    toast.success('כמות עודכנה');
    setEditModal(null);
    triggerSync();
    loadData();
  }

  function triggerSync() {
    fetch('/api/sync-sheets', { method: 'POST' }).catch(() => {});
  }

  const filtered = barcodes.filter(
    (b) =>
      b.barcode.includes(search) ||
      b.companies?.name?.includes(search) ||
      (b.product_name && b.product_name.includes(search))
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ברקודים פתוחים</h1>
        <p className="page-subtitle">{barcodes.length} ברקודים במערכת</p>
      </div>

      {/* סינון */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div className="search-box" style={{ flex: 1, marginBottom: 0 }}>
          <Search />
          <input
            placeholder="חפש ברקוד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 'auto', minWidth: 120 }}
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
        >
          <option value="">כל החברות</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="empty-state"><p>טוען...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Package size={48} />
          <p>אין ברקודים</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ברקוד</th>
                  <th>מוצר</th>
                  <th>כמות</th>
                  <th>חברה</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.barcode}</td>
                    <td>{item.product_name || '—'}</td>
                    <td>{item.quantity}</td>
                    <td>{item.companies?.name || '—'}</td>
                    <td>
                      <div className="action-row">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setEditModal(item);
                            setEditQty(item.quantity);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(item)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* עריכת כמות */}
      <Modal
        isOpen={!!editModal}
        onClose={() => setEditModal(null)}
        title={`עריכת כמות — ${editModal?.barcode}`}
      >
        <div className="form-group">
          <label className="form-label">כמות</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setEditQty(Math.max(1, editQty - 1))}
              style={{ width: 40, justifyContent: 'center' }}
            >
              −
            </button>
            <input
              className="form-input"
              type="number"
              min="1"
              value={editQty}
              onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 80, textAlign: 'center' }}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setEditQty(editQty + 1)}
              style={{ width: 40, justifyContent: 'center' }}
            >
              +
            </button>
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={handleUpdateQty}>
          שמור
        </button>
      </Modal>
    </div>
  );
}
