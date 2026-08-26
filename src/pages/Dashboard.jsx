import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getFormattedDate, getNextWeekDate } from '../lib/helpers';
import { UserCheck, ArrowLeftRight, Package, Clock, AlertCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [agentCompanies, setAgentCompanies] = useState([]);
  const [noAgentCompanies, setNoAgentCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const todayDayIndex = today.getDay();
  const todayDateStr = today.toISOString().split('T')[0];

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      // --- חברות עם סוכן שמגיע היום ---
      const { data: withAgent } = await supabase
        .from('companies')
        .select(`*, barcodes(count)`)
        .eq('has_agent', true)
        .eq('agent_visit_day', todayDayIndex);

      // סינון: רק חברות שלא נדחו (next_visit_override null או <= היום)
      const filteredWithAgent = (withAgent || []).filter((c) => {
        if (!c.next_visit_override) return true;
        return c.next_visit_override <= todayDateStr;
      });

      // בדיקה אם כבר טופלו היום
      const agentCompanyIds = filteredWithAgent.map((c) => c.id);
      let handledAgentIds = [];
      if (agentCompanyIds.length > 0) {
        const { data: todayVisits } = await supabase
          .from('agent_visits')
          .select('company_id')
          .eq('scheduled_date', todayDateStr)
          .in('company_id', agentCompanyIds)
          .neq('actual_status', 'ממתין');
        handledAgentIds = (todayVisits || []).map((v) => v.company_id);
      }

      const activeAgentCompanies = filteredWithAgent.filter(
        (c) => !handledAgentIds.includes(c.id)
      );

      // מיון: חברות עם ברקודים קודם, אחרי כך ללא
      activeAgentCompanies.sort((a, b) => {
        const aCount = a.barcodes?.[0]?.count || 0;
        const bCount = b.barcodes?.[0]?.count || 0;
        if (aCount > 0 && bCount === 0) return -1;
        if (aCount === 0 && bCount > 0) return 1;
        return 0;
      });

      // --- חברות ללא סוכן שיום האיסוף שלהן היום ---
      const { data: withoutAgent } = await supabase
        .from('companies')
        .select(`*, barcodes(count)`)
        .eq('has_agent', false)
        .eq('pickup_day', todayDayIndex);

      // סינון: רק חברות שלא נדחו
      const filteredWithoutAgent = (withoutAgent || []).filter((c) => {
        if (!c.next_pickup_override) return true;
        return c.next_pickup_override <= todayDateStr;
      });

      // בדיקה אם כבר טופלו היום
      const noAgentIds = filteredWithoutAgent.map((c) => c.id);
      let handledReturnIds = [];
      if (noAgentIds.length > 0) {
        const { data: todayReturns } = await supabase
          .from('returns_log')
          .select('company_id')
          .eq('return_date', todayDateStr)
          .in('company_id', noAgentIds);
        handledReturnIds = (todayReturns || []).map((r) => r.company_id);
      }

      const activeNoAgentCompanies = filteredWithoutAgent.filter(
        (c) => !handledReturnIds.includes(c.id)
      );

      // מיון: חברות עם ברקודים קודם, אחרי כך ללא
      activeNoAgentCompanies.sort((a, b) => {
        const aCount = a.barcodes?.[0]?.count || 0;
        const bCount = b.barcodes?.[0]?.count || 0;
        if (aCount > 0 && bCount === 0) return -1;
        if (aCount === 0 && bCount > 0) return 1;
        return 0;
      });

      setAgentCompanies(activeAgentCompanies);
      setNoAgentCompanies(activeNoAgentCompanies);
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בטעינת הנתונים');
    }
    setLoading(false);
  }

  async function handleAgentSigned(company) {
    if (!confirm(`לסמן שסוכן ${company.agent_name || company.name} הוחתם?`)) return;

    try {
      // רושם ביקור סוכן
      await supabase.from('agent_visits').insert({
        company_id: company.id,
        scheduled_date: todayDateStr,
        actual_status: 'הוחתם',
      });

      // מנקה override אם היה
      await supabase
        .from('companies')
        .update({ next_visit_override: null })
        .eq('id', company.id);

      toast.success(`סוכן ${company.agent_name || company.name} הוחתם`);

      // סנכרון ל-Google Sheets
      triggerSync();
      loadDashboard();
    } catch (err) {
      toast.error('שגיאה בעדכון');
    }
  }

  async function handlePostponeAgent(company) {
    if (!confirm(`לדחות את ${company.name} לשבוע הבא?`)) return;

    try {
      // רושם ביקור נדחה
      await supabase.from('agent_visits').insert({
        company_id: company.id,
        scheduled_date: todayDateStr,
        actual_status: 'נדחה לשבוע הבא',
      });

      // קובע override לשבוע הבא
      const nextWeek = getNextWeekDate(todayDateStr);
      await supabase
        .from('companies')
        .update({ next_visit_override: nextWeek })
        .eq('id', company.id);

      toast.success(`סוכן ${company.name} נדחה לשבוע הבא`);
      loadDashboard();
    } catch (err) {
      toast.error('שגיאה בעדכון');
    }
  }

  async function handleReturnedToCompany(company) {
    const count = barcodeCount(company);
    if (!confirm(`לסמן שהמוצרים של ${company.name} הוחזרו? (${count} ברקודים יימחקו)`)) return;

    try {
      // מחיקת כל הברקודים של החברה
      await supabase.from('barcodes').delete().eq('company_id', company.id);

      // רישום בלוג
      await supabase.from('returns_log').insert({
        company_id: company.id,
        status: 'הוחזר',
      });

      // מנקה override אם היה
      await supabase
        .from('companies')
        .update({ next_pickup_override: null })
        .eq('id', company.id);

      toast.success(`המוצרים של ${company.name} הוחזרו ונמחקו`);

      // סנכרון ל-Google Sheets
      triggerSync();
      loadDashboard();
    } catch (err) {
      toast.error('שגיאה בעדכון');
    }
  }

  async function handleReturnedAndDelete(company) {
    const count = barcodeCount(company);
    if (!confirm(`לסמן שהמוצרים של ${company.name} הוחזרו ולמחוק? (${count} ברקודים יימחקו)`)) return;

    try {
      // מחיקת כל הברקודים של החברה
      await supabase.from('barcodes').delete().eq('company_id', company.id);

      // רישום בלוג
      await supabase.from('returns_log').insert({
        company_id: company.id,
        status: 'הוחזר',
      });

      // מנקה override אם היה
      await supabase
        .from('companies')
        .update({ next_visit_override: null })
        .eq('id', company.id);

      toast.success(`המוצרים של ${company.name} הוחזרו ונמחקו`);

      // סנכרון ל-Google Sheets
      triggerSync();
      loadDashboard();
    } catch (err) {
      toast.error('שגיאה בעדכון');
    }
  }

  async function handleNotCollected(company) {
    if (!confirm(`${company.name} לא נאסף — לדחות לשבוע הבא?`)) return;

    try {
      // רישום בלוג
      await supabase.from('returns_log').insert({
        company_id: company.id,
        status: 'לא נאסף',
      });

      // קובע override לשבוע הבא
      const nextWeek = getNextWeekDate(todayDateStr);
      await supabase
        .from('companies')
        .update({ next_pickup_override: nextWeek })
        .eq('id', company.id);

      toast.success(`${company.name} נדחה לשבוע הבא`);
      loadDashboard();
    } catch (err) {
      toast.error('שגיאה בעדכון');
    }
  }

  async function exportCSV(company) {
    try {
      const { data: barcodes, error } = await supabase
        .from('barcodes')
        .select('barcode, quantity')
        .eq('company_id', company.id);

      if (error) throw error;

      if (!barcodes || barcodes.length === 0) {
        toast.error(`אין ברקודים לייצוא עבור ${company.name}`);
        return;
      }

      // יצירת CSV ללא כותרות — רק barcode,quantity
      const csvRows = barcodes.map((b) => `${b.barcode},${b.quantity ?? 1}`);
      const csvContent = csvRows.join('\n');

      // הוספת BOM לתמיכה בעברית
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `החזרות_${company.name}_${todayDateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`קובץ CSV יוצא עבור ${company.name}`);
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בייצוא CSV');
    }
  }

  function triggerSync() {
    // שליחת סנכרון ל-Google Sheets ברקע
    fetch('/api/sync-sheets', { method: 'POST' }).catch(() => {
      // שגיאה שקטה — הסנכרון לא קריטי
    });
  }

  const barcodeCount = (company) => {
    return company.barcodes?.[0]?.count || 0;
  };

  if (loading) {
    return (
      <div className="empty-state">
        <p>טוען...</p>
      </div>
    );
  }

  const totalAgents = agentCompanies.length;
  const totalReturns = noAgentCompanies.length;
  const totalWithBarcodes = [...agentCompanies, ...noAgentCompanies].filter(
    (c) => barcodeCount(c) > 0
  ).length;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'בוקר טוב';
    if (hour < 17) return 'צהריים טובים';
    if (hour < 21) return 'ערב טוב';
    return 'לילה טוב';
  };

  return (
    <div>
      <div className="dashboard-greeting">
        <h1>{getGreeting()}, מחסנאי 👋</h1>
        <p>{getFormattedDate()}</p>
      </div>

      {/* סטטיסטיקות */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-number purple">{totalAgents}</div>
          <div className="stat-label">סוכנים היום</div>
        </div>
        <div className="stat-card">
          <div className="stat-number green">{totalReturns}</div>
          <div className="stat-label">החזרות היום</div>
        </div>
        <div className="stat-card">
          <div className="stat-number orange">{totalWithBarcodes}</div>
          <div className="stat-label">עם ברקודים</div>
        </div>
      </div>

      {/* סוכנים שמגיעים היום */}
      <div className="section">
        <div className="section-title">
          <UserCheck size={18} />
          סוכנים שמגיעים היום
        </div>

        {agentCompanies.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Clock size={32} />
              <p>אין סוכנים מתוכננים להיום</p>
            </div>
          </div>
        ) : (
          agentCompanies.map((company) => {
            const count = barcodeCount(company);
            const hasBarcodes = count > 0;

            return (
              <div className="company-card" key={company.id}>
                <div className="company-info">
                  <h3>{company.name}</h3>
                  <p>
                    סוכן: {company.agent_name || 'לא צוין'}
                    {company.agent_phone && ` · ${company.agent_phone}`}
                    {' · '}
                    <strong>{count}</strong> ברקודים
                  </p>
                  {!hasBarcodes && (
                    <p style={{ color: 'var(--warning)', fontSize: 12 }}>
                      <AlertCircle size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                      מגיע היום — אין חזרות פתוחות
                    </p>
                  )}
                </div>
                {hasBarcodes && (
                  <div className="action-row">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleAgentSigned(company)}
                    >
                      הוחתם
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handlePostponeAgent(company)}
                    >
                      דחה שבוע
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => exportCSV(company)}
                    >
                      <Download size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                      ייצא CSV
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleReturnedAndDelete(company)}
                    >
                      הוחזר ומחק
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* החזרות ללא סוכן */}
      <div className="section">
        <div className="section-title">
          <Package size={18} />
          החזרות ללא סוכן — היום
        </div>

        {noAgentCompanies.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <ArrowLeftRight size={32} />
              <p>אין החזרות מתוכננות להיום</p>
            </div>
          </div>
        ) : (
          noAgentCompanies.map((company) => {
            const count = barcodeCount(company);
            const hasBarcodes = count > 0;

            return (
              <div className="company-card" key={company.id}>
                <div className="company-info">
                  <h3>{company.name}</h3>
                  <p>
                    <strong>{count}</strong> ברקודים להחזרה
                  </p>
                  {!hasBarcodes && (
                    <p style={{ color: 'var(--warning)', fontSize: 12 }}>
                      <AlertCircle size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                      אין ברקודים פתוחים
                    </p>
                  )}
                </div>
                {hasBarcodes && (
                  <div className="action-row">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleReturnedToCompany(company)}
                    >
                      הוחזר
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleNotCollected(company)}
                    >
                      לא נאסף
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => exportCSV(company)}
                    >
                      <Download size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                      ייצא CSV
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
