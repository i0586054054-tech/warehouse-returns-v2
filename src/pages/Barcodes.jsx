import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Pencil, Trash2, Package, Download, ChevronDown } from 'lucide-react';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

export default function Barcodes() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [editModal, setEditModal] = useState(null);
  const [editQty, setEditQty] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    // Load all companies with barcodes
    const { data: allCompanies } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');

    const { data: allBarcodes } = await supabase
      .from('barcodes')
      .select('*, companies(name)')
      .order('barcode');

    // Group barcodes by company
    const grouped = {};
    (allBarcodes || []).forEach((b) => {
      const cid = b.company_id || 'unknown';
      if (!grouped[cid]) {
        grouped[cid] = {
          id: cid,
          name: b.companies?.name || 'ללא חברה',
          barcodes: [],
        };
      }
      grouped[cid].barcodes.push(b);
    });

    // Sort: companies with barcodes, most first
    const sorted = Object.values(grouped).sort((a, b) => b.barcodes.length - a.barcodes.length);
    setCompanies(sorted);
    setLoading(false);
  }

  function toggleExpand(companyId) {
    setExpandedCompanies((prev) => ({
      ...prev,
      [companyId]: !prev[companyId],
    }));
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

  async function handleDeleteAll(company) {
    if (!confirm(`לסמן שכל המוצרים של ${company.name} הוחזרו? (${company.barcodes.length} ברקודים יימחקו)`))
      return;
    await supabase.from('barcodes').delete().eq('company_id', company.id);
    await supabase.from('returns_log').insert({
      company_id: company.id,
      status: 'הוחזר',
    });
    toast.success(`${company.name} — הברקודים נמחקו`);
    triggerSync();
    loadData();
  }

  function exportCSV(company) {
    if (company.barcodes.length === 0) {
      toast.error('אין נתונים לייצוא');
      return;
    }
    let csv = '\uFEFF';
    company.barcodes.forEach((b) => {
      csv += `${b.barcode},${b.quantity}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `החזרות_${company.name}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('הקובץ הורד');
  }

  function triggerSync() {
    fetch('/api/sync-sheets', { method: 'POST' }).catch(() => {});
  }

  const totalBarcodes = companies.reduce((sum, c) => sum + c.barcodes.length, 0);

  const filtered = search
    ? companies
        .map((c) => ({
          ...c,
          barcodes: c.barcodes.filter(
            (b) =>
              b.barcode.includes(search) ||
              c.name.includes(search) ||
              (b.product_name && b.product_name.includes(search))
          ),
        }))
        .filter((c) => c.barcodes.length > 0)
    : companies;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ברקודים פתוחים</h1>
        <p className="page-subtitle">{totalBarcodes} ברקודים ב-{companies.length} חברות</p>
      </div>

      <div className="search-box">
        <Search />
        <input
          placeholder="חפש ברקוד, חברה או מוצר..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state"><p>טוען...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Package size={80} />
          <p>אין ברקודים פתוחים</p>
        </div>
      ) : (
        filtered.map((company) => {
          const isOpen = expandedCompanies[company.id] || false;

          return (
            <div className="company-group" key={company.id}>
              <div className="company-group-header" onClick={() => toggleExpand(company.id)}>
                <h3>{company.name}</h3>
                <div className="company-group-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => exportCSV(company)}
                  >
                    <Download size={28} />
                    CSV
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteAll(company)}
                  >
                    <Trash2 size={28} />
                    הוחזר
                  </button>
                </div>
                <span className="company-group-count">{company.barcodes.length}</span>
                <ChevronDown
                  size={32}
                  className={`company-group-chevron ${isOpen ? 'open' : ''}`}
                />
              </div>

              {isOpen && (
                <div className="company-group-body">
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>ברקוד</th>
                          <th>מוצר</th>
                          <th>כמות</th>
                          <th>פעולות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {company.barcodes.map((item) => (
                          <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 36 }}>
                              {item.barcode}
                            </td>
                            <td>{item.product_name || '—'}</td>
                            <td>{item.quantity}</td>
                            <td>
                              <div className="action-row">
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() => {
                                    setEditModal(item);
                                    setEditQty(item.quantity);
                                  }}
                                >
                                  <Pencil size={28} />
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleDelete(item)}
                                >
                                  <Trash2 size={28} />
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
            </div>
          );
        })
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
              style={{ width: 44, justifyContent: 'center' }}
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
              style={{ width: 44, justifyContent: 'center' }}
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
