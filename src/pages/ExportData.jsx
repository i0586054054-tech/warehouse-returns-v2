import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ExportData() {
  const [companiesWithBarcodes, setCompaniesWithBarcodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      // Load companies that have at least one barcode
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name, barcodes(count)')
        .order('name');

      const withBarcodes = (companies || []).filter(
        (c) => (c.barcodes?.[0]?.count || 0) > 0
      );

      // For each company with barcodes, load the barcode rows
      const results = await Promise.all(
        withBarcodes.map(async (company) => {
          const { data: barcodes } = await supabase
            .from('barcodes')
            .select('barcode, quantity, product_name')
            .eq('company_id', company.id)
            .order('barcode');

          return {
            id: company.id,
            name: company.name,
            count: company.barcodes[0].count,
            barcodes: barcodes || [],
          };
        })
      );

      setCompaniesWithBarcodes(results);
    } catch {
      toast.error('שגיאה בטעינת נתונים');
    }
    setLoading(false);
  }

  function exportCSV(company) {
    if (company.barcodes.length === 0) {
      toast.error('אין נתונים לייצוא');
      return;
    }

    // CSV with BOM for Hebrew filename support, no headers
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

    toast.success('הקובץ הורד בהצלחה');
  }

  async function handleMarkReturned(company) {
    if (
      !confirm(
        `לסמן שכל המוצרים של ${company.name} הוחזרו? (${company.barcodes.length} ברקודים יימחקו)`
      )
    ) {
      return;
    }

    try {
      // מחיקת כל הברקודים
      await supabase.from('barcodes').delete().eq('company_id', company.id);

      // רישום בלוג
      await supabase.from('returns_log').insert({
        company_id: company.id,
        status: 'הוחזר',
      });

      toast.success(`${company.name} — הברקודים נמחקו`);

      // סנכרון
      fetch('/api/sync-sheets', { method: 'POST' }).catch(() => {});

      // רענון
      loadAll();
    } catch {
      toast.error('שגיאה');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ייצוא נתונים</h1>
        <p className="page-subtitle">חברות עם ברקודים פתוחים להחזרה</p>
      </div>

      {loading ? (
        <div className="empty-state">
          <p>טוען...</p>
        </div>
      ) : companiesWithBarcodes.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <FileSpreadsheet size={40} />
            <p>אין חברות עם ברקודים פתוחים</p>
          </div>
        </div>
      ) : (
        companiesWithBarcodes.map((company) => (
          <div key={company.id} className="card" style={{ marginBottom: 16, padding: 0 }}>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <strong>{company.name}</strong> — {company.count} ברקודים
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ברקוד</th>
                    <th>מוצר</th>
                    <th>כמות</th>
                  </tr>
                </thead>
                <tbody>
                  {company.barcodes.map((b, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{b.barcode}</td>
                      <td>{b.product_name || '—'}</td>
                      <td>{b.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => exportCSV(company)}
              >
                <Download size={18} />
                הורד CSV
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={() => handleMarkReturned(company)}
              >
                <Trash2 size={18} />
                סמן הוחזר ומחק
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
