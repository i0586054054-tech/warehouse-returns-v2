import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ScanBarcode as ScanIcon, Plus, Check, Camera, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ScanBarcode() {
  const [barcode, setBarcode] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [companies, setCompanies] = useState([]);
  const [existingItem, setExistingItem] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    loadCompanies();
    inputRef.current?.focus();

    return () => {
      stopCamera();
    };
  }, []);

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');
    setCompanies(data || []);
  }

  async function searchBarcode(value) {
    const code = (value || barcode).trim();
    if (!code) return;
    setIsSearching(true);

    const { data } = await supabase
      .from('barcodes')
      .select('*, companies(name)')
      .eq('barcode', code)
      .maybeSingle();

    if (data) {
      setExistingItem(data);
      setQuantity(data.quantity);
      setCompanyId(data.company_id || '');
      toast('ברקוד קיים — עדכן כמות', { icon: '📦' });
    } else {
      setExistingItem(null);
      setQuantity(1);
      setCompanyId('');
    }
    setIsSearching(false);
  }

  async function startCamera() {
    try {
      // בדיקה אם html5-qrcode זמין
      const { Html5Qrcode } = await import('html5-qrcode');

      setCameraActive(true);

      // נחכה שה-DOM יתעדכן
      await new Promise((r) => setTimeout(r, 100));

      const scanner = new Html5Qrcode('barcode-scanner');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 150 },
          aspectRatio: 1.5,
        },
        (decodedText) => {
          // ברקוד נמצא!
          setBarcode(decodedText);
          stopCamera();
          searchBarcode(decodedText);
          toast.success(`ברקוד נסרק: ${decodedText}`);
        },
        () => {
          // שגיאת סריקה — ממשיך לנסות
        }
      );
    } catch (err) {
      console.error('Camera error:', err);
      setCameraActive(false);
      if (err.message?.includes('NotAllowedError') || err.name === 'NotAllowedError') {
        toast.error('נדרשת הרשאת מצלמה');
      } else {
        toast.error('שגיאה בפתיחת המצלמה. נסה להזין ברקוד ידנית.');
      }
    }
  }

  async function stopCamera() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        // ignore
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!barcode.trim()) {
      toast.error('הזן ברקוד');
      return;
    }

    if (!companyId) {
      toast.error('בחר חברה');
      return;
    }

    try {
      if (existingItem) {
        // עדכון כמות של ברקוד קיים
        await supabase
          .from('barcodes')
          .update({ quantity, company_id: companyId })
          .eq('id', existingItem.id);
        toast.success('הכמות עודכנה');
      } else {
        // הוספת ברקוד חדש
        const { error } = await supabase.from('barcodes').insert({
          barcode: barcode.trim(),
          quantity,
          company_id: companyId,
        });

        if (error) {
          if (error.code === '23505') {
            toast.error('ברקוד כבר קיים');
          } else {
            throw error;
          }
          return;
        }
        toast.success('ברקוד נוסף בהצלחה');
      }

      // סנכרון ל-Google Sheets ברקע
      triggerSync();

      // איפוס
      setBarcode('');
      setQuantity(1);
      setCompanyId('');
      setExistingItem(null);
      inputRef.current?.focus();
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בשמירה');
    }
  }

  function triggerSync() {
    fetch('/api/sync-sheets', { method: 'POST' }).catch(() => {});
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">סריקת ברקוד</h1>
        <p className="page-subtitle">הזן ברקוד ידנית או סרוק עם המצלמה</p>
      </div>

      {/* מצלמה */}
      {cameraActive && (
        <div className="card" style={{ position: 'relative', padding: 0, overflow: 'hidden' }}>
          <div
            id="barcode-scanner"
            style={{ width: '100%', minHeight: 250 }}
          />
          <button
            className="btn btn-danger btn-sm"
            onClick={stopCamera}
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 10,
              borderRadius: '50%',
              width: 36,
              height: 36,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card">
          {/* שדה ברקוד */}
          <div className="form-group">
            <label className="form-label">ברקוד</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                className="form-input"
                type="text"
                inputMode="numeric"
                placeholder="הזן מספר ברקוד..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onBlur={() => searchBarcode()}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchBarcode())}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => searchBarcode()}
                disabled={isSearching}
                title="חפש ברקוד"
              >
                <ScanIcon size={18} />
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={startCamera}
                disabled={cameraActive}
                title="סרוק מהמצלמה"
              >
                <Camera size={18} />
              </button>
            </div>
          </div>

          {/* סטטוס */}
          {existingItem && (
            <div
              style={{
                padding: '8px 12px',
                background: '#fef3c7',
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 14,
              }}
            >
              ברקוד קיים · חברה: {existingItem.companies?.name || 'לא ידועה'} · כמות נוכחית:{' '}
              {existingItem.quantity}
            </div>
          )}

          {/* כמות */}
          <div className="form-group">
            <label className="form-label">כמות</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{ width: 40, justifyContent: 'center' }}
              >
                −
              </button>
              <input
                className="form-input"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 80, textAlign: 'center' }}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setQuantity(quantity + 1)}
                style={{ width: 40, justifyContent: 'center' }}
              >
                +
              </button>
            </div>
          </div>

          {/* חברה */}
          <div className="form-group">
            <label className="form-label">חברה</label>
            <select
              className="form-select"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">— בחר חברה —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* כפתור שמירה */}
          <button type="submit" className="btn btn-primary btn-block">
            {existingItem ? (
              <>
                <Check size={18} /> עדכן כמות
              </>
            ) : (
              <>
                <Plus size={18} /> הוסף ברקוד
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
