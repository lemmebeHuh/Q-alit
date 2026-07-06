import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import Home from './pages/Home';
import PatientDashboard from './pages/PatientDashboard';
import AdminDashboard from './pages/AdminDashboard';
import TvDisplay from './pages/TvDisplay';
import { seedDummyData } from './firebase/db';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // Seed dummy data for testing UI
    seedDummyData();
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
          {/* Simple Header */}
          <header className="bg-emerald-600 text-white shadow-md">
            <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
              <h1 className="text-xl font-bold tracking-wider">Q-Alit</h1>
            </div>
          </header>

          {/* Main Content Container */}
          <main className="max-w-4xl mx-auto p-4 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/queue/:id" element={<PatientDashboard />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/tv" element={<TvDisplay />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
