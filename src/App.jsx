import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScanBarcode from './pages/ScanBarcode';
import Companies from './pages/Companies';
import Barcodes from './pages/Barcodes';
import ExportData from './pages/ExportData';

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2500,
          style: { direction: 'rtl', fontFamily: 'inherit' },
        }}
      />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="scan" element={<ScanBarcode />} />
          <Route path="companies" element={<Companies />} />
          <Route path="barcodes" element={<Barcodes />} />
          <Route path="export" element={<ExportData />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
