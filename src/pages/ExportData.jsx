import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ExportData() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [barcodes, setBarcodes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('id, name, barcodes(count)')
      .order('name');
    setCompanies(data || []);
  }

  async function loadBarcodes(companyId) {
    setSelectedCompany(companyId);
    if (!companyId) {
      setBarcodes([]);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from('barcodes')
      .select('barcode, quantity')
      .eq('company_id', companyId)
      .order('barcode');

    setBarcodes(data || []);
    setLoading(false);
  }

  function exportCSV() {
    if (barcodes.length === 0) {
      toast.error('אין נתונים לייצוא');
      return;
    }

    const companyName = companies.find((c) => c.id === selectedCompany)?.name || 'export';

    // יצירת CSV עם BOM לתמיכה בעברית
    let csv = '\uFEFF';
    csv += 'ברקוד,כמות\n';
    barcodes.forEach((b) => {
      csv += `${b.barcode},${b.quantity}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `החזרות_${companyName}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('הקובץ הורד בהצלחה');
  }

  async function handleMarkReturned() {
    if (!selectedCompany) return;
    const companyName = companies.find((c) => c.id === selectedCompany)?.name;

    if (!confirm(`לסמן שכל המוצרים של ${companyName} הוחזרו? (${barcodes.length} ברקודים יימחקו)`)) {
      return;
    }

    try {
      // מחיקת כל הברקודים
      await supabase.from('barcodes').delete().eq('company_id', selectedCompany);

      // רישום בלוג
      await supabase.from('returns_log').insert({
        company_id: selectedCompany,
        status: 'הוחזר',
      });

      toast.success(`${companyName} — הברקודים נמחקו`);

      // סנכרון
      fetch('/api/sync-sheets', { method: 'POST' }).catch(() => {});

      // רענון
      setBarcodes([]);
      setSelectedCompany('');
      loadCompanies();
    } catch (err) {
      toast.error('שגיאה');
    }
  }

  const selectedCompanyName = companies.find((c) => c.id === selectedCompany)?.name;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ייצוא נתונים</h1>
        <p className="page-subtitle">ייצא רשימת ברקודים לחברה ספציפית</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label className="form-label">בחר חברה</label>
          <select
            className="form-select"
            value={selectedCompany}
            onChange={(e) => loadBarcodes(e.target.value)}
          >
            <option value="">— בחר חברה —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.barcodes?.[0]?.count || 0} ברקודים)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* תצוגה מקדימה */}
      {selectedCompany && (
        <>
          {loading ? (
            <div className="empty-state"><p>טוען...</p></div>
          ) : barcodes.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <FileSpreadsheet size={40} />
                <p>אין ברקודים לחברה {selectedCompanyName}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-200)' }}>
                  <strong>{selectedCompanyName}</strong> — {barcodes.length} ברקודים
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>ברקוד</th>
                        <th>כמות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barcodes.map((b, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{b.barcode}</td>
                          <td>{b.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={exportCSV}>
                  <Download size={18} />
                  הורד CSV
                </button>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleMarkReturned}>
                  <Trash2 size={18} />
                  סמן הוחזר ומחק
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
