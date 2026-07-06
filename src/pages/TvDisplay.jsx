import { useState, useEffect } from 'react';
import { subscribeToQueues, subscribeToConfig } from '../firebase/db';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export default function TvDisplay() {
  const [queues, setQueues] = useState([]);
  const [config, setConfig] = useState({});

  useEffect(() => {
    const unsubQueues = subscribeToQueues(setQueues);
    const unsubConfig = subscribeToConfig(setConfig);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      unsubQueues();
      unsubConfig();
      clearInterval(timer);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const inProgressList = queues.filter(q => q.status === 'in_progress');
  const waitingList = queues.filter(q => q.status === 'waiting').slice(0, 5); // Take next 5

  const currentServing = inProgressList.length > 0 ? inProgressList[inProgressList.length - 1] : null;

  return (
    <div className="fixed inset-0 bg-gray-900 text-white flex overflow-hidden font-sans">
      
      {/* Pause Overlay */}
      {config?.isPaused && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="bg-amber-500/10 border border-amber-500/30 p-16 rounded-[3rem] text-center max-w-4xl shadow-2xl">
            <svg className="w-32 h-32 text-amber-500 mx-auto mb-8 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <h1 className="text-6xl font-black text-amber-400 mb-6 tracking-tight">Klinik Sedang Istirahat</h1>
            <p className="text-2xl text-amber-100/80 font-medium leading-relaxed">
              Pelayanan sedang dijeda sementara.<br/>
              Estimasi waktu istirahat sekitar <span className="font-bold text-amber-400">20 Menit</span>.
            </p>
          </div>
        </div>
      )}

      {/* Left Panel - Current Serving (Big) */}
      <div className="w-2/3 h-full flex flex-col items-center justify-center relative p-12 bg-gradient-to-br from-emerald-800 to-gray-900 border-r border-emerald-900/50">
        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-600/20 via-transparent to-transparent"></div>
        
        <div className="absolute top-12 left-12 flex items-center gap-4">
          <div 
            onClick={toggleFullscreen}
            className="w-16 h-16 bg-white/10 hover:bg-white/20 transition-colors cursor-pointer rounded-2xl flex items-center justify-center backdrop-blur-md"
            title="Klik untuk Fullscreen"
          >
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-widest text-emerald-100">KLINIK SEHAT</h1>
            <p className="text-emerald-400 font-bold uppercase tracking-widest">Sistem Antrean</p>
          </div>
        </div>

        <div className="text-center z-10 w-full animate-in zoom-in duration-1000">
          <p className="text-3xl font-bold uppercase tracking-[0.5em] text-emerald-300 mb-8 opacity-80">Nomor Antrean</p>
          <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-[3rem] p-16 mx-auto inline-block shadow-2xl">
            <h2 className="text-[14rem] font-black leading-none tracking-tighter text-white drop-shadow-[0_0_40px_rgba(52,211,153,0.5)]">
              {currentServing ? currentServing.queueNumber : '-'}
            </h2>
          </div>
          <p className="text-5xl font-black mt-12 text-emerald-100">
            {currentServing ? currentServing.name : 'Kosong'}
          </p>
          <p className="text-2xl mt-4 text-emerald-400/80 font-bold uppercase tracking-widest bg-emerald-900/30 inline-block px-8 py-3 rounded-full border border-emerald-500/20">
            SILAKAN MASUK KE RUANG TERAPI
          </p>
        </div>
      </div>

      {/* Right Panel - Up Next */}
      <div className="w-1/3 h-full bg-gray-950 flex flex-col relative">
        <div className="p-10 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-2xl font-black text-gray-200">Menunggu</h3>
            <p className="text-gray-500">{waitingList.length > 0 ? '5 Antrean Berikutnya' : 'Antrean Kosong'}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-emerald-400">{format(currentTime, 'HH:mm')}</p>
            <p className="text-sm font-bold text-gray-500 uppercase">{format(currentTime, 'dd MMM', { locale: idLocale })}</p>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-8 flex flex-col gap-6 justify-center">
          {waitingList.length === 0 ? (
            <div className="text-center text-gray-600 opacity-50">
              <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <p className="text-xl font-bold">Tidak ada antrean</p>
            </div>
          ) : (
            waitingList.map((q, idx) => (
              <div key={q.id} className="bg-gray-900 border border-gray-800 rounded-3xl p-6 flex items-center gap-6 shadow-xl animate-in slide-in-from-right duration-700" style={{ animationDelay: `${idx * 100}ms` }}>
                <div className="w-20 h-20 bg-emerald-900/50 border border-emerald-500/30 rounded-2xl flex items-center justify-center shrink-0">
                  <span className="text-4xl font-black text-emerald-400">{q.queueNumber}</span>
                </div>
                <div className="overflow-hidden">
                  <p className="text-2xl font-black text-gray-100 truncate w-full">{q.name}</p>
                  <p className="text-gray-500 font-bold uppercase tracking-wider text-sm mt-1 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Estimasi {format(new Date(q.estimatedTime), 'HH:mm')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Footer info */}
        <div className="p-6 bg-emerald-950/30 border-t border-emerald-900/30 text-center">
          <p className="text-emerald-500/80 font-bold tracking-widest uppercase text-sm">
            Pantau antrean Anda melalui HP di q-alit.com
          </p>
        </div>
      </div>
      
    </div>
  );
}
