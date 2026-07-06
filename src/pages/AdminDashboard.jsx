import { useState, useEffect } from 'react';
import { subscribeToQueues, subscribeToFutureBookings, subscribeToConfig, callNextPatient, callInitialBatch, finishPatient, skipPatient, restoreQueue, addQueue, getPatients, getPatientHistory, resetDailySystem, getHistoryByDateRange, toggleSystemBreak, getTodayStr, patchLegacyQueues } from '../firebase/db';
import { Users, CheckCircle, SkipForward, Play, AlertTriangle, UserPlus, List, Search, History, ChevronLeft, LayoutDashboard, Clock, Power, BarChart2, Download, Calendar, Coffee } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'directory' | 'analytics'

  // Queue State
  const [queues, setQueues] = useState([]);
  const [futureBookings, setFutureBookings] = useState([]);
  const [config, setConfig] = useState({ currentCapacity: 0, lastPrediction: 15, isPaused: false });
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInData, setWalkInData] = useState({ name: '', phone: '', complaint: '' });

  // Directory State
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Analytics State
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [customReportData, setCustomReportData] = useState([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  useEffect(() => {
    patchLegacyQueues();
    const unsubQueues = subscribeToQueues(setQueues);
    const unsubFuture = subscribeToFutureBookings(setFutureBookings);
    const unsubConfig = subscribeToConfig(setConfig);
    return () => {
      unsubQueues();
      unsubFuture();
      unsubConfig();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'directory') {
      getPatients().then(setPatients).catch(console.error);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchReportData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, startDate, endDate]);

  const fetchReportData = async () => {
    if (!startDate || !endDate) return;
    setIsLoadingReport(true);
    try {
      const data = await getHistoryByDateRange(startDate, endDate);
      setCustomReportData(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleCallNext = async () => {
    try { await callNextPatient(); } catch (e) { alert(e.message); }
  };

  const handleFinish = async (patientId) => {
    try { await finishPatient(patientId); } catch (e) { console.error(e); }
  };

  const handleWalkInSubmit = async (e) => {
    e.preventDefault();
    if (!walkInData.name || !walkInData.phone) return;
    try {
      await addQueue(walkInData);
      setWalkInData({ name: '', phone: '', complaint: '' });
      setShowWalkIn(false);
      alert('Pasien walk-in berhasil didaftarkan!');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Gagal mendaftarkan pasien.');
    }
  };

  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    setIsLoadingHistory(true);
    try {
      const history = await getPatientHistory(patient.phone);
      setPatientHistory(history);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm("PERINGATAN! Anda akan menutup klinik. Semua antrean hari ini akan diarsipkan dan nomor urut akan kembali ke 1 besok. Apakah Anda yakin?")) {
      try {
        await resetDailySystem();
        alert("Sistem berhasil di-reset. Semua antrean telah diarsipkan.");
      } catch (error) {
        alert("Gagal mereset sistem: " + error.message);
      }
    }
  };

  const handleExportExcel = () => {
    if (customReportData.length === 0) {
      alert("Tidak ada data untuk diekspor pada periode ini.");
      return;
    }

    const excelData = customReportData.map((item, index) => ({
      'No': index + 1,
      'Tanggal': item.registeredAt?.seconds ? format(new Date(item.registeredAt.seconds * 1000), 'dd-MM-yyyy HH:mm') : '-',
      'Nama Pasien': item.name,
      'No. WhatsApp': item.phone,
      'Keluhan / Penyakit': item.complaint || '-',
      'Status': item.status === 'completed' ? 'Selesai' : (item.status === 'skipped' ? 'Dilewati' : 'Lainnya'),
      'Waktu Pelayanan': item.actualDuration ? `${item.actualDuration} menit` : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Pasien");
    
    // Auto-size columns
    const wscols = [
      {wch: 5}, {wch: 20}, {wch: 25}, {wch: 15}, {wch: 30}, {wch: 10}, {wch: 15}
    ];
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `Laporan_Klinik_${startDate}_sd_${endDate}.xlsx`);
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.phone.includes(searchQuery)
  );

  const waitingList = queues.filter(q => q.status === 'waiting');
  const inProgressList = queues.filter(q => q.status === 'in_progress');
  const skippedList = queues.filter(q => q.status === 'skipped');
  const isFull = config.currentCapacity >= 20;

  // Custom Report Analytics Calculation
  const reportStats = customReportData.reduce((acc, q) => {
    const c = q.complaint || 'Tidak Diketahui';
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});
  
  const chartData = Object.keys(reportStats).map(key => ({
    name: key.length > 15 ? key.substring(0, 15) + '...' : key,
    Jumlah: reportStats[key],
    fullName: key
  })).sort((a, b) => b.Jumlah - a.Jumlah).slice(0, 5);

  const formattedWaitTime = parseFloat(config.lastPrediction || 15).toFixed(1).replace('.', ',');

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-700 pb-12">
      
      {/* Header Tabs (Enterprise style) */}
      <div className="flex flex-col md:flex-row bg-white rounded-2xl shadow-sm border border-gray-100 p-2 overflow-hidden relative gap-2 md:gap-0">
        <div className="absolute inset-0 bg-gradient-to-r from-gray-50 to-white pointer-events-none"></div>
        <button 
          onClick={() => { setActiveTab('queue'); setSelectedPatient(null); }}
          className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all relative z-10 ${activeTab === 'queue' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
        >
          <LayoutDashboard className="w-4 h-4" /> Live Dashboard
        </button>
        <button 
          onClick={() => { setActiveTab('booking'); setSelectedPatient(null); }}
          className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all relative z-10 ${activeTab === 'booking' ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
        >
          <Calendar className="w-4 h-4" /> Jadwal Booking
        </button>
        <button 
          onClick={() => setActiveTab('directory')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all relative z-10 ${activeTab === 'directory' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
        >
          <List className="w-4 h-4" /> Direktori Pasien
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all relative z-10 ${activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
        >
          <BarChart2 className="w-4 h-4" /> Laporan & Analitik
        </button>
      </div>

      {/* TAB 1: LIVE QUEUE */}
      {activeTab === 'queue' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          
          {/* Top Panel */}
          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -mr-20 -mt-20"></div>
            
            <div className="relative z-10 w-full md:w-auto">
              <p className="text-sm font-bold text-emerald-600 uppercase tracking-widest mb-1">Controller</p>
              <h2 className="text-3xl font-black text-gray-800 mb-2">Live Antrean</h2>
              <p className="text-gray-500 text-sm max-w-sm">Kelola antrean masuk, pantau kapasitas kursi, dan panggil pasien berikutnya secara real-time.</p>
            </div>

            <div className="relative z-10 flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              {/* Capacity Card */}
              <div className={`p-4 rounded-2xl border flex items-center gap-4 min-w-[200px] ${isFull ? 'bg-red-50 border-red-200 shadow-inner shadow-red-100' : 'bg-white border-gray-100 shadow-sm'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isFull ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kapasitas Kursi</p>
                  <p className={`text-2xl font-black ${isFull ? 'text-red-600' : 'text-gray-800'}`}>
                    {config.currentCapacity} <span className="text-sm font-semibold text-gray-400">/ 20</span>
                  </p>
                </div>
              </div>

              {/* Call Next Button Area */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-inner min-w-[250px]">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Giliran Berikutnya</p>
                  <p className="font-bold text-gray-800 truncate w-32">
                    {waitingList.length > 0 ? `No. ${waitingList[0].queueNumber}` : 'Kosong'}
                  </p>
                </div>
                <button
                  onClick={handleCallNext}
                  disabled={isFull || waitingList.length === 0 || config.isPaused}
                  className="ml-auto flex items-center justify-center w-12 h-12 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all shadow-lg shadow-emerald-600/20"
                >
                  <Play className="w-5 h-5 fill-current" />
                </button>
              </div>
            </div>
          </div>

          {isFull && !config.isPaused && (
            <div className="bg-red-50 text-red-700 p-4 rounded-2xl flex items-center gap-3 border border-red-200 animate-pulse">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <p className="font-medium text-sm">Kapasitas kursi penuh! Pasien tidak dapat dipanggil masuk hingga ada yang selesai.</p>
            </div>
          )}

          {config.isPaused && (
            <div className="bg-amber-100 text-amber-800 p-4 rounded-2xl flex items-center gap-3 border border-amber-300">
              <Coffee className="w-6 h-6 shrink-0" />
              <div>
                <p className="font-bold text-sm uppercase tracking-widest mb-0.5">Klinik Sedang Istirahat</p>
                <p className="font-medium text-sm opacity-90">Sistem dijeda sementara. Estimasi waktu antrean di luar telah dibekukan dan akan dihitung ulang secara otomatis saat istirahat selesai.</p>
              </div>
            </div>
          )}

          {/* Debug SES Calculation Card */}
          {config?.lastCalculationDetails && (
            <div className="bg-slate-800 text-slate-200 p-6 rounded-2xl border border-slate-700 font-mono text-sm shadow-xl animate-in slide-in-from-top-4">
              <h3 className="text-emerald-400 font-bold mb-4 uppercase tracking-widest text-xs flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                Transparansi Rumus SES (Single Exponential Smoothing)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p><span className="text-slate-400">Variabel Terakhir (Pasien Selesai):</span></p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-slate-300">
                    <li>Alpha (<span className="text-emerald-400">α</span>) = {config.lastCalculationDetails.alpha}</li>
                    <li>Durasi Aktual Terakhir (<span className="text-emerald-400">X_t</span>) = {config.lastCalculationDetails.Xt} menit</li>
                    <li>Prediksi Sebelumnya (<span className="text-emerald-400">S_t-1</span>) = {config.lastCalculationDetails.St_prev.toFixed(2)} menit</li>
                  </ul>
                </div>
                <div className="space-y-2 bg-slate-900 p-4 rounded-xl border border-slate-700">
                  <p className="text-slate-400 mb-2">Rumus: S_t = (α * X_t) + ((1 - α) * S_t-1)</p>
                  <p className="font-bold text-lg text-white">
                    S_t = ({config.lastCalculationDetails.alpha} * {config.lastCalculationDetails.Xt}) + 
                    ({(1 - config.lastCalculationDetails.alpha).toFixed(1)} * {config.lastCalculationDetails.St_prev.toFixed(2)})
                  </p>
                  <p className="text-emerald-400 font-black text-2xl mt-2 border-t border-slate-700 pt-2">
                    Hasil = {config.lastCalculationDetails.St_new.toFixed(2)} Menit
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                💡 Angka <strong className="text-white">{config.lastCalculationDetails.St_new.toFixed(2)} menit</strong> inilah yang saat ini digunakan untuk mengalikan antrean dan ditampilkan secara live di HP pasien yang menunggu di luar.
              </p>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            <button 
              onClick={handleReset} 
              disabled={waitingList.length > 0 || inProgressList.length > 0}
              title={(waitingList.length > 0 || inProgressList.length > 0) ? "Harap selesaikan semua pasien sebelum menutup klinik!" : ""}
              className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl hover:bg-red-100 text-sm font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto"
            >
              <Power className="w-4 h-4" /> Tutup Klinik (Reset)
            </button>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <button 
                onClick={async () => {
                  const names = ["Budi", "Ani", "Siti", "Agus", "Wati", "Iwan", "Dewi", "Rudi", "Nina", "Eko", "Maya", "Dedi", "Lia", "Heri", "Rina", "Joko", "Yuni", "Tono", "Sri", "Andi", "Fajar", "Gilang", "Hana", "Indra", "Jihan", "Kiki", "Lestari", "Maman", "Nisa", "Oki", "Putri", "Qori", "Reza", "Sinta", "Tari", "Umar", "Vina", "Wawan", "Yana", "Zaki"];
                  const complaints = ["Pegal linu", "Sakit pinggang", "Kolesterol tinggi", "Asam urat", "Darah tinggi", "Rematik", "Pusing sering", "Susah tidur", "Kesemutan", "Nyeri sendi", "Demam", "Batuk pilek", "Sakit perut", "Mual muntah", "Sakit gigi"];
                  for (let i = 0; i < 40; i++) {
                    const phone = (2000 + i).toString();
                    try {
                      await addQueue({ name: names[i % names.length], phone, complaint: complaints[i % complaints.length] });
                    } catch (e) { console.error(e); }
                  }
                  alert("40 Data berhasil dimasukkan!");
                }} 
                className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 px-4 py-2.5 rounded-xl hover:bg-blue-100 text-sm font-bold shadow-sm transition-colors w-full sm:w-auto"
              >
                Seed 40 Data (Test)
              </button>
                <button 
                  onClick={async () => {
                    try {
                      await toggleSystemBreak(!config.isPaused);
                    } catch (e) {
                      alert(e.message);
                    }
                  }} 
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all w-full sm:w-auto ${config.isPaused ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/30' : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'}`}
                >
                  <Coffee className="w-4 h-4" /> {config.isPaused ? 'Selesai Istirahat' : 'Mulai Istirahat'}
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await callInitialBatch(20);
                      alert("20 pasien pertama berhasil dipanggil!");
                    } catch (e) {
                      alert(e.message);
                    }
                  }} 
                  disabled={config.isPaused}
                  className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-600 px-4 py-2.5 rounded-xl hover:bg-emerald-100 text-sm font-bold shadow-sm transition-colors w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Panggil 20 Pasien
                </button>
              <button onClick={() => setShowWalkIn(!showWalkIn)} className="flex items-center justify-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl hover:bg-gray-800 text-sm font-bold shadow-lg shadow-gray-900/20 transition-all active:scale-95 w-full sm:w-auto">
                <UserPlus className="w-4 h-4" /> {showWalkIn ? 'Batal' : 'Daftar Walk-in'}
              </button>
            </div>
          </div>

          {showWalkIn && (
            <form onSubmit={handleWalkInSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100 flex flex-col md:flex-row gap-4 items-start md:items-end animate-in fade-in slide-in-from-top-4">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Nama Pasien</label>
                <input type="text" required value={walkInData.name} onChange={e => setWalkInData({...walkInData, name: e.target.value})} className="w-full border-2 border-gray-100 rounded-xl p-2.5 bg-gray-50 focus:bg-white focus:border-emerald-500 outline-none transition-colors text-sm font-medium" placeholder="Nama" />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">No. WhatsApp</label>
                <input type="text" required value={walkInData.phone} onChange={e => setWalkInData({...walkInData, phone: e.target.value})} className="w-full border-2 border-gray-100 rounded-xl p-2.5 bg-gray-50 focus:bg-white focus:border-emerald-500 outline-none transition-colors text-sm font-medium" placeholder="08..." />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Keluhan</label>
                <input type="text" value={walkInData.complaint} onChange={e => setWalkInData({...walkInData, complaint: e.target.value})} className="w-full border-2 border-gray-100 rounded-xl p-2.5 bg-gray-50 focus:bg-white focus:border-emerald-500 outline-none transition-colors text-sm font-medium" placeholder="Sakit..." />
              </div>
              <button type="submit" className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-600/20 w-full md:w-auto">
                Daftar
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Sedang Dilayani Panel */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
              <div className="bg-gradient-to-r from-orange-50 to-white border-b border-orange-100 p-6 flex justify-between items-center shrink-0">
                <h3 className="font-black text-orange-800 flex items-center gap-3 text-lg">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                  </span>
                  Sedang Dilayani
                </h3>
                <span className="bg-orange-100 text-orange-700 py-1 px-3 rounded-full text-xs font-bold">{inProgressList.length} Pasien</span>
              </div>
              <div className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
                {inProgressList.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Clock className="w-12 h-12 mb-2 opacity-20" />
                    <p className="font-medium text-sm">Tidak ada pasien di ruang terapi.</p>
                  </div>
                )}
                {inProgressList.map(q => (
                  <div key={q.id} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-orange-200 hover:shadow-md transition-all group">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md">{q.queueCode}</span>
                      </div>
                      <p className="font-black text-gray-800 text-xl">No. {q.queueNumber} - {q.name}</p>
                      <p className="text-sm text-gray-500 mt-1 font-medium">{q.complaint}</p>
                    </div>
                    <div className="w-full sm:w-auto flex items-center gap-2">
                      <button onClick={() => skipPatient(q.id)} disabled={config.isPaused} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white px-4 py-2.5 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        Lewati
                      </button>
                      <button onClick={() => handleFinish(q.id)} disabled={config.isPaused} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white px-5 py-2.5 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <CheckCircle className="w-5 h-5" /> Selesai
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Daftar Menunggu Panel */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
              <div className="bg-gray-50 border-b border-gray-100 p-6 flex justify-between items-center shrink-0">
                <h3 className="font-black text-gray-800 text-lg">Daftar Menunggu</h3>
                <span className="bg-gray-200 text-gray-700 py-1 px-3 rounded-full text-xs font-bold">{waitingList.length} Antrean</span>
              </div>
              <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
                {waitingList.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <List className="w-12 h-12 mb-2 opacity-20" />
                    <p className="font-medium text-sm">Antrean kosong.</p>
                  </div>
                )}
                {waitingList.map(q => (
                  <div key={q.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-gray-200 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                        <span className="font-black text-gray-800 text-xl">{q.queueNumber}</span>
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-base">{q.name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{q.queueCode}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Estimasi</p>
                        <p className="font-bold text-emerald-600">{format(new Date(q.estimatedTime), 'HH:mm')}</p>
                      </div>
                      <button onClick={() => skipPatient(q.id)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0" title="Lewati Pasien">
                        <SkipForward className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Antrean Terlewat Panel */}
          {skippedList.length > 0 && (
            <div className="bg-white rounded-[2rem] shadow-sm border border-rose-100 overflow-hidden flex flex-col mt-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-rose-50 border-b border-rose-100 p-6 flex justify-between items-center shrink-0">
                <h3 className="font-black text-rose-800 text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Antrean Terlewat (Hold)
                </h3>
                <span className="bg-rose-200 text-rose-800 py-1 px-3 rounded-full text-xs font-bold">{skippedList.length} Pasien</span>
              </div>
              <div className="p-6 overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="text-gray-400 uppercase text-[10px] tracking-widest font-bold">
                    <tr>
                      <th className="px-4 py-2">Nomor</th>
                      <th className="px-4 py-2">Pasien</th>
                      <th className="px-4 py-2">Keluhan</th>
                      <th className="px-4 py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {skippedList.map(q => (
                      <tr key={q.id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-4 py-4 font-black text-gray-800 text-lg">No. {q.queueNumber}</td>
                        <td className="px-4 py-4">
                          <p className="font-bold text-gray-800">{q.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{q.queueCode}</p>
                        </td>
                        <td className="px-4 py-4 font-medium">{q.complaint || '-'}</td>
                        <td className="px-4 py-4 text-right">
                          <button 
                            onClick={async () => {
                              try {
                                await restoreQueue(q.id);
                              } catch (e) {
                                alert(e.message);
                              }
                            }}
                            className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-emerald-700 active:scale-95 transition-all text-xs"
                          >
                            Pulihkan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 1.5: BOOKING SCHEDULE */}
      {activeTab === 'booking' && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-8 border-b border-gray-100 flex flex-col md:flex-row gap-6 justify-between items-center bg-gradient-to-r from-orange-50 to-white">
            <div>
              <p className="text-sm font-bold text-orange-600 uppercase tracking-widest mb-1">Masa Depan</p>
              <h2 className="text-2xl font-black text-gray-800">Jadwal Booking</h2>
              <p className="text-gray-500 text-sm mt-1">Daftar pasien yang mendaftar untuk hari esok dan seterusnya.</p>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/80 text-gray-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th className="px-8 py-5">Tanggal Berobat</th>
                  <th className="px-8 py-5">No. Antrean</th>
                  <th className="px-8 py-5">Nama Pasien</th>
                  <th className="px-8 py-5">Nomor WhatsApp</th>
                  <th className="px-8 py-5">Keluhan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {futureBookings.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-8 py-12 text-center text-gray-400 font-medium">Belum ada pasien yang booking untuk hari depan.</td>
                  </tr>
                ) : (
                  futureBookings.map(q => (
                    <tr key={q.id} className="hover:bg-orange-50/50 transition-colors group">
                      <td className="px-8 py-5">
                        <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-bold text-xs">
                          {format(new Date(q.targetDate), 'dd MMM yyyy')}
                        </span>
                      </td>
                      <td className="px-8 py-5 font-black text-gray-800 text-lg">No. {q.queueNumber}</td>
                      <td className="px-8 py-5 font-bold text-gray-800">{q.name}</td>
                      <td className="px-8 py-5 font-mono text-gray-500">{q.phone}</td>
                      <td className="px-8 py-5">{q.complaint || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PATIENT DIRECTORY */}
      {activeTab === 'directory' && !selectedPatient && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-8 border-b border-gray-100 flex flex-col md:flex-row gap-6 justify-between items-center bg-gradient-to-r from-blue-50 to-white">
            <div>
              <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-1">Database</p>
              <h2 className="text-2xl font-black text-gray-800">Direktori Pasien</h2>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Cari nama atau No. WA..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border-2 border-white bg-white/50 backdrop-blur-sm shadow-sm rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/80 text-gray-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th className="px-8 py-5">Nama Pasien</th>
                  <th className="px-8 py-5">Nomor WhatsApp</th>
                  <th className="px-8 py-5">Kunjungan Terakhir</th>
                  <th className="px-8 py-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-8 py-12 text-center text-gray-400 font-medium">Belum ada data pasien ditemukan.</td>
                  </tr>
                ) : (
                  filteredPatients.map(p => (
                    <tr key={p.id} className="hover:bg-blue-50/50 transition-colors group">
                      <td className="px-8 py-5 font-bold text-gray-800">{p.name}</td>
                      <td className="px-8 py-5 font-mono text-gray-500">{p.phone}</td>
                      <td className="px-8 py-5">
                        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium text-xs">
                          {p.lastVisitDate ? format(new Date(p.lastVisitDate), 'dd MMM yyyy') : (p.lastVisit?.seconds ? format(new Date(p.lastVisit.seconds * 1000), 'dd MMM yyyy') : '-')}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button 
                          onClick={() => handleSelectPatient(p)}
                          className="text-blue-600 font-bold hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-2"
                        >
                          <History className="w-4 h-4" /> Riwayat
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PATIENT HISTORY DETAIL */}
      {activeTab === 'directory' && selectedPatient && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white flex items-center gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -mr-20 -mt-20"></div>
            
            <button onClick={() => setSelectedPatient(null)} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors backdrop-blur-sm relative z-10">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="relative z-10">
              <h2 className="text-3xl font-black mb-1">{selectedPatient.name}</h2>
              <p className="text-blue-200 font-mono text-sm">{selectedPatient.phone}</p>
            </div>
          </div>

          <div className="p-8">
            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <History className="text-blue-500 w-6 h-6" /> 
              Riwayat Kunjungan ({patientHistory.length} Kali)
            </h3>
            
            {isLoadingHistory ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            ) : patientHistory.length === 0 ? (
              <p className="text-gray-500 text-center py-12 bg-gray-50 rounded-2xl font-medium border border-gray-100 dashed">Belum ada riwayat kunjungan yang selesai.</p>
            ) : (
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.3rem] md:before:mx-auto md:before:translate-x-0 before:h-full before:w-1 before:bg-gradient-to-b before:from-blue-100 before:via-gray-100 before:to-transparent">
                {patientHistory.map((historyItem, idx) => (
                  <div key={historyItem.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-11 h-11 rounded-full border-4 border-white bg-blue-100 text-blue-600 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                      <span className="font-black text-sm">{patientHistory.length - idx}</span>
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group-hover:border-blue-100">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 mb-4">
                        <span className="font-black text-gray-800 text-lg">Antrean No. {historyItem.queueNumber}</span>
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 inline-block w-max">
                          {historyItem.registeredAt?.seconds ? format(new Date(historyItem.registeredAt.seconds * 1000), 'dd MMM yyyy, HH:mm') : '-'}
                        </span>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <span className="font-bold block mb-1.5 text-gray-400 uppercase text-[10px] tracking-widest">Keluhan / Diagnosa Utama</span>
                        <p className="text-gray-700 font-medium text-sm">
                          {historyItem.complaint || 'Tidak ada keluhan dicatat.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ANALYTICS DASHBOARD */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          
          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-20 -mt-20"></div>
            
            <div className="relative z-10">
              <p className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-1">Custom Report</p>
              <h2 className="text-3xl font-black text-gray-800">Laporan & Analitik</h2>
            </div>
            
            <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center bg-gray-50 p-2 rounded-xl border border-gray-200 shadow-inner">
                <Calendar className="w-5 h-5 text-gray-400 ml-3 mr-2" />
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent font-bold text-gray-700 outline-none px-2"
                />
                <span className="text-gray-400 font-medium px-2">-</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent font-bold text-gray-700 outline-none px-2"
                />
              </div>
              <button 
                onClick={handleExportExcel}
                className="flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap"
              >
                <Download className="w-4 h-4" /> Ekspor Excel
              </button>
            </div>
          </div>

          {isLoadingReport ? (
             <div className="flex justify-center py-20">
               <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
             </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-3xl text-white shadow-lg">
                  <p className="text-indigo-100 font-bold uppercase tracking-widest text-[10px] mb-2">Total Pengunjung</p>
                  <h3 className="text-5xl font-black">{customReportData.length}</h3>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl text-white shadow-lg">
                  <p className="text-emerald-100 font-bold uppercase tracking-widest text-[10px] mb-2">Selesai Berobat</p>
                  <h3 className="text-5xl font-black">{customReportData.filter(q => q.status === 'completed').length}</h3>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 rounded-3xl text-white shadow-lg">
                  <p className="text-amber-100 font-bold uppercase tracking-widest text-[10px] mb-2">Estimasi Antrean (Live)</p>
                  <h3 className="text-5xl font-black">{formattedWaitTime} <span className="text-lg">Menit</span></h3>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                  <h3 className="text-xl font-black text-gray-800 mb-6">Top 5 Penyakit</h3>
                  {chartData.length === 0 ? (
                    <div className="py-20 text-center text-gray-400">Belum ada data tercatat.</div>
                  ) : (
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                          <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'}}
                          />
                          <Bar dataKey="Jumlah" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                
                <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="text-xl font-black text-gray-800">Detail Pasien</h3>
                    <span className="bg-indigo-100 text-indigo-700 py-1 px-3 rounded-full text-xs font-bold">{customReportData.length} Data</span>
                  </div>
                  <div className="overflow-x-auto flex-1 max-h-[350px] custom-scrollbar">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-white text-gray-400 uppercase text-[10px] tracking-widest font-bold sticky top-0 z-10 shadow-sm">
                        <tr>
                          <th className="px-6 py-4">Waktu</th>
                          <th className="px-6 py-4">Pasien</th>
                          <th className="px-6 py-4">Keluhan</th>
                          <th className="px-6 py-4">Durasi</th>
                          <th className="px-6 py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {customReportData.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="px-6 py-12 text-center text-gray-400 font-medium">Tidak ada data di periode ini.</td>
                          </tr>
                        ) : (
                          customReportData.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 font-mono text-xs">
                                {p.registeredAt?.seconds ? format(new Date(p.registeredAt.seconds * 1000), 'dd/MM HH:mm') : '-'}
                              </td>
                              <td className="px-6 py-4">
                                <p className="font-bold text-gray-800">{p.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{p.phone}</p>
                              </td>
                              <td className="px-6 py-4 font-medium max-w-[150px] truncate">{p.complaint || '-'}</td>
                              <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-500">
                                {p.actualDuration ? `${p.actualDuration} mnt` : '-'}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : (p.status === 'skipped' ? 'bg-gray-100 text-gray-600' : 'bg-orange-100 text-orange-700')}`}>
                                  {p.status === 'completed' ? 'Selesai' : (p.status === 'skipped' ? 'Skip' : 'Aktif')}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}
