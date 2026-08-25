import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getFormattedDate, getNextWeekDate } from '../lib/helpers';
import { UserCheck, ArrowLeftRight, Package, Clock, AlertCircle } from 'lucide-react';
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">דשבורד</h1>
      </div>

      <div className="date-display">{getFormattedDate()}</div>

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
          agentCompanies.map((company) => (
            <div className="company-card" key={company.id}>
              <div className="company-info">
                <h3>{company.name}</h3>
                <p>
                  סוכן: {company.agent_name || 'לא צוין'}
                  {company.agent_phone && ` · ${company.agent_phone}`}
                  {' · '}
                  <strong>{barcodeCount(company)}</strong> ברקודים
                </p>
              </div>
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
              </div>
            </div>
          ))
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
          noAgentCompanies.map((company) => (
            <div className="company-card" key={company.id}>
              <div className="company-info">
                <h3>{company.name}</h3>
                <p>
                  <strong>{barcodeCount(company)}</strong> ברקודים להחזרה
                </p>
                {barcodeCount(company) === 0 && (
                  <p style={{ color: 'var(--warning)', fontSize: 12 }}>
                    <AlertCircle size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> אין ברקודים פתוחים
                  </p>
                )}
              </div>
              <div className="action-row">
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleReturnedToCompany(company)}
                  disabled={barcodeCount(company) === 0}
                >
                  הוחזר
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleNotCollected(company)}
                >
                  לא נאסף
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
