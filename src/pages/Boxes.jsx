import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Box, ChevronDown, Download, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function Boxes() {
  const { user } = useAuth();
  const [dayData, setDayData] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState({});
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const todayIndex = new Date().getDay();

  useEffect(() => {
    loadBoxes();
    // Auto-expand today
    setExpandedDays({ [todayIndex]: true });
  }, []);

  async function loadBoxes() {
    setLoading(true);

    // Load all companies with their pickup_day and barcodes
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, pickup_day, agent_visit_day, has_agent, agent_name')
      .order('name');

    // Load all barcodes grouped by company
    const { data: barcodes } = await supabase
      .from('barcodes')
      .select('id, barcode, quantity, product_name, company_id')
      .order('barcode');

    // Build barcode map by company_id
    const barcodeMap = {};
    (barcodes || []).forEach((b) => {
      if (!barcodeMap[b.company_id]) barcodeMap[b.company_id] = [];
      barcodeMap[b.company_id].push(b);
    });

    // Group companies by their effective return day (pickup_day)
    const grouped = {};
    for (let i = 0; i < 7; i++) grouped[i] = [];

    (companies || []).forEach((company) => {
      const day = company.pickup_day;
      if (day == null) return;
      const companyBarcodes = barcodeMap[company.id] || [];
      grouped[day].push({
        ...company,
        barcodes: companyBarcodes,
        totalItems: companyBarcodes.reduce((sum, b) => sum + b.quantity, 0),
      });
    });

    // Sort within each day: companies with barcodes first
    Object.keys(grouped).forEach((day) => {
      grouped[day].sort((a, b) => {
        if (a.barcodes.length > 0 && b.barcodes.length === 0) return -1;
        if (a.barcodes.length === 0 && b.barcodes.length > 0) return 1;
        return a.name.localeCompare(b.name);
      });
    });

    setDayData(grouped);
    setLoading(false);
  }

  function toggleDay(dayIndex) {
    setExpandedDays((prev) => ({ ...prev, [dayIndex]: !prev[dayIndex] }));
  }

  function toggleCompany(key) {
    setExpandedCompanies((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function exportDayCSV(dayIndex) {
    const companies = dayData[dayIndex] || [];
    const withBarcodes = companies.filter((c) => c.barcodes.length > 0);
    if (withBarcodes.length === 0) {
      toast.error('אין ברקודים ליום הזה');
      return;
    }

    let csv = '\uFEFF';
    csv += 'חברה,ברקוד,מוצר,כמות\n';
    withBarcodes.forEach((company) => {
      company.barcodes.forEach((b) => {
        csv += `${company.name},${b.barcode},${b.product_name || ''},${b.quantity}\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `קופסא_יום_${DAYS[dayIndex]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('הקובץ הורד');
  }

  if (loading) {
    return <div className="empty-state"><p>טוען...</p></div>;
  }

  // Count total barcodes across all days
  const totalBarcodes = Object.values(dayData).reduce(
    (sum, companies) => sum + companies.reduce((s, c) => s + c.barcodes.length, 0),
    0
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">קופסאות החזרה</h1>
        <p className="page-subtitle">ארגון ברקודים לפי ימים · {totalBarcodes} ברקודים</p>
      </div>

      {DAYS.map((dayName, dayIndex) => {
        const companies = dayData[dayIndex] || [];
        const isToday = dayIndex === todayIndex;
        const isOpen = expandedDays[dayIndex] || false;
        const dayBarcodeCount = companies.reduce((sum, c) => sum + c.barcodes.length, 0);
        const dayItemCount = companies.reduce((sum, c) => sum + c.totalItems, 0);
        const companiesWithBarcodes = companies.filter((c) => c.barcodes.length > 0).length;

        return (
          <div
            className={`box-day ${isToday ? 'box-day-today' : ''}`}
            key={dayIndex}
          >
            <div className="box-day-header" onClick={() => toggleDay(dayIndex)}>
              <div className="box-day-title">
                <Box size={20} />
                <h2>יום {dayName}</h2>
                {isToday && <span className="badge badge-info">היום</span>}
              </div>
              <div className="box-day-meta">
                {dayBarcodeCount > 0 && (
                  <span className="box-day-count">
                    {companiesWithBarcodes} חברות · {dayBarcodeCount} ברקודים · {dayItemCount} פריטים
                  </span>
                )}
                {dayBarcodeCount === 0 && companies.length > 0 && (
                  <span className="box-day-count">{companies.length} חברות · אין ברקודים</span>
                )}
                <ChevronDown
                  size={20}
                  className={`box-day-chevron ${isOpen ? 'open' : ''}`}
                />
              </div>
            </div>

            {isOpen && (
              <div className="box-day-body">
                {companies.length === 0 ? (
                  <p className="box-empty">אין חברות משוייכות ליום הזה</p>
                ) : (
                  <>
                    {/* Export button */}
                    {dayBarcodeCount > 0 && (
                      <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={(e) => { e.stopPropagation(); exportDayCSV(dayIndex); }}
                        >
                          <Download size={16} />
                          ייצא CSV ליום
                        </button>
                      </div>
                    )}

                    {companies.map((company) => {
                      const companyKey = `${dayIndex}-${company.id}`;
                      const isCompanyOpen = expandedCompanies[companyKey] || false;
                      const hasBarcodes = company.barcodes.length > 0;

                      return (
                        <div
                          className={`box-company ${hasBarcodes ? '' : 'box-company-empty'}`}
                          key={company.id}
                        >
                          <div
                            className="box-company-header"
                            onClick={() => hasBarcodes && toggleCompany(companyKey)}
                          >
                            <div className="box-company-info">
                              <strong>{company.name}</strong>
                              {hasBarcodes ? (
                                <span>
                                  {company.barcodes.length} ברקודים · {company.totalItems} פריטים
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>אין ברקודים פתוחים</span>
                              )}
                            </div>
                            {hasBarcodes && (
                              <ChevronDown
                                size={18}
                                className={`box-day-chevron ${isCompanyOpen ? 'open' : ''}`}
                              />
                            )}
                            {!hasBarcodes && (
                              <Check size={18} style={{ color: 'var(--success)' }} />
                            )}
                          </div>

                          {isCompanyOpen && hasBarcodes && (
                            <div className="box-company-items">
                              <table>
                                <thead>
                                  <tr>
                                    <th>ברקוד</th>
                                    <th>מוצר</th>
                                    <th>כמות</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {company.barcodes.map((item) => (
                                    <tr key={item.id}>
                                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                        {item.barcode}
                                      </td>
                                      <td>{item.product_name || '—'}</td>
                                      <td>{item.quantity}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
