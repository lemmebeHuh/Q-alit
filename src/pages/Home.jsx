import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { addQueue, getQueueByPhone, getQueueByCode, getTodayStr } from '../firebase/db';
import { ArrowRight, Search, Activity, Clock, Users, Phone, Calendar } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('daftar'); // 'daftar' | 'lacak'
  
  // Register State
  const [formData, setFormData] = useState({ name: '', phone: '', complaint: '', targetDate: getTodayStr() });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Tracking State
  const [trackInput, setTrackInput] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [trackError, setTrackError] = useState('');

  // Local Session State
  const [localSession, setLocalSession] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('qalita_active_queue');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const today = getTodayStr();
        if (parsed.targetDate >= today) {
          setLocalSession(parsed);
        } else {
          localStorage.removeItem('qalita_active_queue');
        }
      } catch (e) {
        localStorage.removeItem('qalita_active_queue');
      }
    }
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();

    // Session Rate Limiting (Mitigasi Spam)
    const saved = localStorage.getItem('qalita_active_queue');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.targetDate === formData.targetDate) {
          setError(`Perangkat ini telah mendaftar antrean untuk tanggal ${formData.targetDate}. Satu perangkat fisik hanya dapat mendaftar maksimal 1 kali per hari.`);
          return;
        }
      } catch (e) {}
    }

    setIsSubmitting(true);
    setError('');

    try {
      const newData = await addQueue(formData);
      
      // Save Session Mirroring (Mitigasi Typo)
      localStorage.setItem('qalita_active_queue', JSON.stringify({
        queueCode: newData.queueCode,
        targetDate: newData.targetDate
      }));

      navigate(`/queue/${newData.queueCode}`);
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTrack = async (e) => {
    e.preventDefault();
    if (!trackInput.trim()) return;
    
    setIsTracking(true);
    setTrackError('');

    try {
      let queue;
      if (trackInput.toUpperCase().startsWith('A-')) {
        queue = await getQueueByCode(trackInput.toUpperCase());
      } else {
        queue = await getQueueByPhone(trackInput);
      }

      if (queue) {
        localStorage.setItem('qalita_active_queue', JSON.stringify({
          queueCode: queue.queueCode,
          targetDate: queue.targetDate || getTodayStr()
        }));
        navigate(`/queue/${queue.queueCode}`);
      } else {
        setTrackError("Antrean tidak ditemukan. Pastikan nomor/kode sudah benar.");
      }
    } catch (err) {
      setTrackError("Gagal mencari antrean.");
    } finally {
      setIsTracking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-emerald-200">
      
      {/* Premium Header */}
      <header className="bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-50 border-b border-gray-100/50 backdrop-blur-xl bg-white/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tight text-gray-800 leading-none">Q-Alit</h1>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Klinik Cerdas</p>
          </div>
        </div>
        <button onClick={() => navigate('/admin')} className="text-xs font-bold text-white bg-gray-900 hover:bg-emerald-600 px-4 py-2.5 rounded-xl transition-all uppercase tracking-widest shadow-md hover:shadow-emerald-600/20 active:scale-95 flex items-center gap-2">
          Dashboard Admin <ArrowRight className="w-3 h-3" />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 w-full max-w-lg mx-auto relative z-10 my-8">
        
        {/* Welcome Text */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h2 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tighter mb-4 leading-tight">
            Berobat Jadi <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">Lebih Tenang.</span>
          </h2>
          <p className="text-gray-500 font-medium text-sm sm:text-base max-w-sm mx-auto">
            Daftar dari rumah, pantau sisa antrean lewat HP, dan datang tepat waktu tanpa perlu antre berdiri.
          </p>
        </div>

        {/* Tabbed Interactive Card */}
        <div className="w-full bg-white rounded-[2.5rem] shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-500">
          
          {localSession && (
            <div className="bg-emerald-50 border-b border-emerald-100 p-6 flex flex-col items-center justify-center text-center">
              <span className="text-emerald-800 font-bold mb-3 text-sm">Sesi Tiket Aktif Ditemukan di Perangkat Anda:</span>
              <button 
                onClick={() => navigate(`/queue/${localSession.queueCode}`)}
                className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/30 flex items-center gap-2 active:scale-95"
              >
                Lanjutkan Pantau Antrean ({localSession.queueCode}) <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex p-2 bg-gray-50/50 border-b border-gray-100">
            <button 
              onClick={() => setActiveTab('daftar')}
              className={`flex-1 py-4 text-sm font-bold rounded-2xl transition-all ${activeTab === 'daftar' ? 'bg-white text-emerald-600 shadow-sm border border-gray-100/50' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Daftar Baru
            </button>
            <button 
              onClick={() => setActiveTab('lacak')}
              className={`flex-1 py-4 text-sm font-bold rounded-2xl transition-all ${activeTab === 'lacak' ? 'bg-white text-blue-600 shadow-sm border border-gray-100/50' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Lacak Antrean
            </button>
          </div>

          <div className="p-8">
            {/* DAFTAR FORM */}
            {activeTab === 'daftar' && (
              <form onSubmit={handleRegister} className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm p-4 rounded-2xl border border-red-100 font-medium">
                    {error}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 ml-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full border-2 border-gray-300 bg-white p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-medium text-gray-800 placeholder:text-gray-400"
                    placeholder="Contoh: Sang Kala Aji"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 ml-1">No. WhatsApp</label>
                  <div className="relative">
                    <Phone className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})}
                      className="w-full border-2 border-gray-300 bg-white p-4 pl-12 rounded-2xl focus:border-emerald-500 outline-none transition-all font-medium text-gray-800 placeholder:text-gray-400"
                      placeholder="08123456789"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 ml-1">Tanggal Berobat</label>
                  <div className="relative">
                    <Calendar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      required
                      min={getTodayStr()}
                      value={formData.targetDate}
                      onChange={(e) => setFormData({...formData, targetDate: e.target.value})}
                      className="w-full border-2 border-gray-300 bg-white p-4 pl-12 rounded-2xl focus:border-emerald-500 outline-none transition-all font-medium text-gray-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 ml-1">Keluhan (Opsional)</label>
                  <input
                    type="text"
                    value={formData.complaint}
                    onChange={(e) => setFormData({...formData, complaint: e.target.value})}
                    className="w-full border-2 border-gray-300 bg-white p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-medium text-gray-800 placeholder:text-gray-400"
                    placeholder="Sakit perut, pegal, dll"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !formData.name || !formData.phone}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-lg p-4 rounded-2xl flex items-center justify-center gap-2 hover:from-emerald-600 hover:to-teal-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all shadow-xl shadow-emerald-500/20 mt-4"
                >
                  {isSubmitting ? 'Memproses...' : 'Ambil Nomor Antrean'} 
                  {!isSubmitting && <ArrowRight className="w-5 h-5" />}
                </button>
              </form>
            )}

            {/* LACAK FORM */}
            {activeTab === 'lacak' && (
              <form onSubmit={handleTrack} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-black text-gray-800 mb-1">Cek Status Antrean</h3>
                  <p className="text-sm text-gray-500 font-medium">Masukkan Kode Unik (A-XXX) atau No. WhatsApp Anda untuk melacak posisi.</p>
                </div>

                {trackError && (
                  <div className="bg-red-50 text-red-600 text-sm p-4 rounded-2xl border border-red-100 font-medium text-center">
                    {trackError}
                  </div>
                )}
                
                <div>
                  <input
                    type="text"
                    required
                    value={trackInput}
                    onChange={(e) => setTrackInput(e.target.value)}
                    className="w-full border-2 border-gray-300 bg-white p-4 rounded-2xl focus:border-blue-500 outline-none transition-all font-bold text-center text-xl text-gray-800 placeholder:text-gray-400 tracking-wider"
                    placeholder="A-XXX / 0812..."
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isTracking || !trackInput}
                  className="w-full bg-blue-600 text-white font-bold text-lg p-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all shadow-xl shadow-blue-600/20"
                >
                  {isTracking ? 'Mencari...' : 'Lacak Sekarang'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Features Indicator */}
        <div className="flex items-center justify-center gap-6 mt-10">
          <div className="flex flex-col items-center gap-2 opacity-60">
            <Clock className="w-5 h-5 text-gray-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Real-time</span>
          </div>
          <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
          <div className="flex flex-col items-center gap-2 opacity-60">
            <Users className="w-5 h-5 text-gray-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Prediktif</span>
          </div>
        </div>

      </main>

      {/* Background Decor */}
      <div className="fixed top-0 left-0 w-full h-[50vh] bg-emerald-50/50 -z-10" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 80%)' }}></div>
    </div>
  );
}
