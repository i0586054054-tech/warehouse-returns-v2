import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './lib/ThemeContext';
import { AuthProvider } from './lib/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ScanBarcode from './pages/ScanBarcode';
import Companies from './pages/Companies';
import Barcodes from './pages/Barcodes';
import AdminPanel from './pages/AdminPanel';
import Settings from './pages/Settings';

function App() {
  return (
    <AuthProvider>
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
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="scan" element={<ScanBarcode />} />
                <Route path="companies" element={<Companies />} />
                <Route path="barcodes" element={<Barcodes />} />
                <Route path="settings" element={<Settings />} />
                <Route path="admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
