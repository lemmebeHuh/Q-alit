import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  handleReset = () => {
    // Clear localStorage in case of corrupted state
    localStorage.removeItem('qalita_active_queue');
    
    // Unregister service workers to clear bad caches
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          registration.unregister();
        }
      });
    }

    // Reload page completely
    window.location.href = "/";
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl w-full max-w-md border border-red-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-gray-800 mb-2">Oops! Terjadi Kesalahan</h1>
            <p className="text-gray-500 text-sm mb-6">
              Aplikasi mengalami kendala teknis (kemungkinan *cache* lama atau data tidak valid).
            </p>
            
            <div className="bg-gray-100 p-4 rounded-xl text-left overflow-auto mb-6 text-xs text-red-600 font-mono max-h-32">
              {this.state.error && this.state.error.toString()}
            </div>

            <button 
              onClick={this.handleReset}
              className="w-full bg-emerald-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-emerald-700 transition flex items-center justify-center gap-2 active:scale-95"
            >
              <RefreshCw className="w-5 h-5" /> Bersihkan Cache & Muat Ulang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
