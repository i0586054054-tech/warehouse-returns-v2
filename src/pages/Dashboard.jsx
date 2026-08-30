import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { getFormattedDate, getNextWeekDate } from '../lib/helpers';
import { useNavigate } from 'react-router-dom';
import { UserCheck, ArrowLeftRight, Package, Clock, AlertCircle, Download, X, Box, ChevronDown, Check } from 'lucide-react';
import BackgroundSlider from '../components/BackgroundSlider';
import toast from 'react-hot-toast';

const WORK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [agentCompanies, setAgentCompanies] = useState([]);
  const [noAgentCompanies, setNoAgentCompanies] = useState([]);
  const [boxData, setBoxData] = useState({});
  const [expandedBox, setExpandedBox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissedAgents, setDismissedAgents] = useState(() => {
    try {
      const stored = localStorage.getItem('dismissed-agents');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === new Date().toISOString().split('T')[0]) {
          return new Set(parsed.ids);
        }
      }
    } catch {}
    return new Set();
  });
  const [dismissedReturns, setDismissedReturns] = useState(() => {
    try {
      const stored = localStorage.getItem('dismissed-returns');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === new Date().toISOString().split('T')[0]) {
          return new Set(parsed.ids);
        }
      }
    } catch {}
    return new Set();
  });

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

      // --- החזרות היום ---
      // רק חברות שיום האיסוף שלהן היום וכבר עברו סוכן (הוחתם)
      const { data: pickupToday } = await supabase
        .from('companies')
        .select(`*, barcodes(count)`)
        .eq('pickup_day', todayDayIndex)
        .eq('has_agent', true);

      // סינון: רק חברות שלא נדחו
      const filteredPickup = (pickupToday || []).filter((c) => {
        if (!c.next_pickup_override) return true;
        return c.next_pickup_override <= todayDateStr;
      });

      // בודקים שהסוכן כבר הוחתם
      let signedAgentCompanyIds = [];
      if (filteredPickup.length > 0) {
        const pickupIds = filteredPickup.map((c) => c.id);
        const { data: signedVisits } = await supabase
          .from('agent_visits')
          .select('company_id')
          .eq('actual_status', 'הוחתם')
          .in('company_id', pickupIds);
        signedAgentCompanyIds = (signedVisits || []).map((v) => v.company_id);
      }

      // רק חברות שהסוכן שלהן כבר הוחתם
      const returnCandidates = filteredPickup.filter((c) =>
        signedAgentCompanyIds.includes(c.id)
      );

      // בדיקה אם כבר טופלו היום
      const returnIds = returnCandidates.map((c) => c.id);
      let handledReturnIds = [];
      if (returnIds.length > 0) {
        const { data: todayReturns } = await supabase
          .from('returns_log')
          .select('company_id')
          .eq('return_date', todayDateStr)
          .in('company_id', returnIds);
        handledReturnIds = (todayReturns || []).map((r) => r.company_id);
      }

      const activeReturnCompanies = returnCandidates.filter(
        (c) => !handledReturnIds.includes(c.id)
      );

      // מיון: חברות עם ברקודים קודם, אחרי כך ללא
      activeReturnCompanies.sort((a, b) => {
        const aCount = a.barcodes?.[0]?.count || 0;
        const bCount = b.barcodes?.[0]?.count || 0;
        if (aCount > 0 && bCount === 0) return -1;
        if (aCount === 0 && bCount > 0) return 1;
        return 0;
      });

      // --- קופסאות לימים הקרובים (ראשון-חמישי) ---
      const { data: allCompanies } = await supabase
        .from('companies')
        .select('id, name, pickup_day')
        .order('name');

      const { data: allBarcodes } = await supabase
        .from('barcodes')
        .select('id, barcode, quantity, product_name, company_id');

      const barcodesByCompany = {};
      (allBarcodes || []).forEach((b) => {
        if (!barcodesByCompany[b.company_id]) barcodesByCompany[b.company_id] = [];
        barcodesByCompany[b.company_id].push(b);
      });

      const boxes = {};
      for (let i = 0; i <= 4; i++) boxes[i] = []; // 0=ראשון ... 4=חמישי

      (allCompanies || []).forEach((c) => {
        if (c.pickup_day == null || c.pickup_day > 4) return;
        const compBarcodes = barcodesByCompany[c.id] || [];
        if (compBarcodes.length === 0) return;
        boxes[c.pickup_day].push({
          ...c,
          barcodes: compBarcodes,
          totalItems: compBarcodes.reduce((sum, b) => sum + b.quantity, 0),
        });
      });

      Object.keys(boxes).forEach((day) => {
        boxes[day].sort((a, b) => a.name.localeCompare(b.name));
      });

      setBoxData(boxes);
      setAgentCompanies(activeAgentCompanies);
      setNoAgentCompanies(activeReturnCompanies);
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
        user_id: user.id,
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
        user_id: user.id,
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
        user_id: user.id,
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
        user_id: user.id,
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
        user_id: user.id,
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

  async function triggerSync() {
    // שליחת סנכרון ל-Google Sheets ברקע
    const { data: { session } } = await supabase.auth.getSession();
    fetch('/api/sync-sheets', {
      method: 'POST',
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    }).catch(() => {});
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
      <div className="greeting-slider-wrapper">
        <BackgroundSlider />
        <div className="dashboard-greeting">
          <h1>{getGreeting()}, {profile?.display_name || 'מחסנאי'} 👋</h1>
          <p>{getFormattedDate()}</p>
        </div>
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
          <UserCheck size={20} />
          סוכנים שמגיעים היום
        </div>

        {agentCompanies.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Clock size={36} />
              <p>אין סוכנים מתוכננים להיום</p>
            </div>
          </div>
        ) : (
          <>
            {/* סוכנים עם ברקודים — כרטיסים מלאים */}
            {agentCompanies
              .filter((c) => barcodeCount(c) > 0)
              .map((company) => {
                const count = barcodeCount(company);
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
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => exportCSV(company)}
                      >
                        <Download size={16} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                        ייצא CSV
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleReturnedAndDelete(company)}
                      >
                        הוחזר ומחק
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* סוכנים ללא ברקודים — שורות קומפקטיות עם כפתור סגירה */}
            {agentCompanies
              .filter((c) => barcodeCount(c) === 0 && !dismissedAgents.has(c.id))
              .length > 0 && (
              <div className="compact-agents">
                {agentCompanies
                  .filter((c) => barcodeCount(c) === 0 && !dismissedAgents.has(c.id))
                  .map((company) => (
                    <div className="compact-agent-row" key={company.id}>
                      <span className="compact-agent-name">{company.name}</span>
                      <span className="compact-agent-info">
                        {company.agent_name || 'סוכן לא צוין'} · אין חזרות
                      </span>
                      <button
                        className="compact-agent-dismiss"
                        onClick={() => {
                          setDismissedAgents((prev) => {
                            const next = new Set([...prev, company.id]);
                            localStorage.setItem('dismissed-agents', JSON.stringify({
                              date: new Date().toISOString().split('T')[0],
                              ids: [...next],
                            }));
                            return next;
                          });
                        }}
                        title="הסר מהדשבורד היום"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* החזרות ללא סוכן */}
      <div className="section">
        <div className="section-title">
          <Package size={20} />
          החזרות היום — עברו סוכן
        </div>

        {noAgentCompanies.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <ArrowLeftRight size={36} />
              <p>אין החזרות מתוכננות להיום</p>
            </div>
          </div>
        ) : (
          <>
            {/* חברות עם ברקודים — כרטיסים מלאים */}
            {noAgentCompanies
              .filter((c) => barcodeCount(c) > 0)
              .map((company) => {
                const count = barcodeCount(company);
                return (
                  <div className="company-card" key={company.id}>
                    <div className="company-info">
                      <h3>{company.name}</h3>
                      <p>
                        <strong>{count}</strong> ברקודים להחזרה
                      </p>
                    </div>
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
                        <Download size={16} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                        ייצא CSV
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* חברות ללא ברקודים — שורות קומפקטיות עם כפתור סגירה */}
            {noAgentCompanies
              .filter((c) => barcodeCount(c) === 0 && !dismissedReturns.has(c.id))
              .length > 0 && (
              <div className="compact-agents">
                {noAgentCompanies
                  .filter((c) => barcodeCount(c) === 0 && !dismissedReturns.has(c.id))
                  .map((company) => (
                    <div className="compact-agent-row" key={company.id}>
                      <span className="compact-agent-name">{company.name}</span>
                      <span className="compact-agent-info">אין ברקודים פתוחים</span>
                      <button
                        className="compact-agent-dismiss"
                        onClick={() => {
                          setDismissedReturns((prev) => {
                            const next = new Set([...prev, company.id]);
                            localStorage.setItem('dismissed-returns', JSON.stringify({
                              date: new Date().toISOString().split('T')[0],
                              ids: [...next],
                            }));
                            return next;
                          });
                        }}
                        title="הסר מהדשבורד היום"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* קופסאות החזרה — סקירה שבועית */}
      <div className="section">
        <div className="section-title" style={{ cursor: 'pointer' }} onClick={() => navigate('/boxes')}>
          <Box size={20} />
          קופסאות החזרה
        </div>

        <div className="boxes-week-grid">
          {[0, 1, 2, 3, 4].map((dayIndex) => {
            const companies = boxData[dayIndex] || [];
            const isToday = dayIndex === todayDayIndex;
            const totalBarcodes = companies.reduce((sum, c) => sum + c.barcodes.length, 0);
            const totalItems = companies.reduce((sum, c) => sum + c.totalItems, 0);
            const isOpen = expandedBox === dayIndex;

            return (
              <div
                className={`box-week-card ${isToday ? 'box-week-today' : ''}`}
                key={dayIndex}
                onClick={() => setExpandedBox(isOpen ? null : dayIndex)}
              >
                <div className="box-week-header">
                  <span className="box-week-day">
                    יום {WORK_DAYS[dayIndex]}
                    {isToday && <span className="badge badge-info" style={{ marginRight: 6, fontSize: 13 }}>היום</span>}
                  </span>
                  {totalBarcodes > 0 ? (
                    <span className="box-week-count">{totalBarcodes}</span>
                  ) : (
                    <Check size={16} style={{ color: 'var(--success)' }} />
                  )}
                </div>

                {companies.length > 0 ? (
                  <p className="box-week-meta">
                    {companies.length} חברות · {totalItems} פריטים
                  </p>
                ) : (
                  <p className="box-week-meta">ריק</p>
                )}

                {isOpen && companies.length > 0 && (
                  <div className="box-week-details" onClick={(e) => e.stopPropagation()}>
                    {companies.map((company) => (
                      <div className="box-week-company" key={company.id}>
                        <strong>{company.name}</strong>
                        <span>{company.barcodes.length} ברקודים · {company.totalItems} פריטים</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
