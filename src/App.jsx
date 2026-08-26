import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './lib/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScanBarcode from './pages/ScanBarcode';
import Companies from './pages/Companies';
import Barcodes from './pages/Barcodes';

function App() {
  return (
    <ThemeProvider>
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
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
