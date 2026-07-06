import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db, cancelQueue, getTodayStr } from '../firebase/db';
import { BellRing, Flame, UserCheck, Clock, ChevronLeft, Sparkles, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export default function PatientDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patientData, setPatientData] = useState(null);
  const [peopleAhead, setPeopleAhead] = useState(null);
  const [currentServing, setCurrentServing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(null);
  const [config, setConfig] = useState(null);
  const [lastNotifiedCount, setLastNotifiedCount] = useState(null);
  const [totalWaiting, setTotalWaiting] = useState(0);

  useEffect(() => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const sendPushNotification = (title, options) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        icon: '/vite.svg',
        ...options
      });
    }
  };

  useEffect(() => {
    let unsubQueues;
    let unsubConfig;

    const setupSubscriptions = async () => {
      // 1. Listen to config
      unsubConfig = onSnapshot(doc(db, "system_config", "main"), (docSnap) => {
        if (docSnap.exists()) {
          setConfig(docSnap.data());
        }
      });

      // 2. We need to query queues to find the patient and calculate people ahead.
      // For simplicity in a live dashboard, we subscribe to all queues or a specific query.
      // To get people ahead, we need all waiting queues ordered by queueNumber.
      const qQuery = query(collection(db, "queues"), orderBy("queueNumber", "asc"));

      unsubQueues = onSnapshot(qQuery, (snapshot) => {
        const allQueues = [];
        snapshot.forEach(d => allQueues.push({ id: d.id, ...d.data() }));

        // Find our patient by either phone (legacy) or queueCode (new)
        const me = allQueues.find(q => q.queueCode === id || q.phone === id);

        if (me) {
          setTracking(me);
          setPatientData(me);

          if (me.status === 'waiting') {
            const waitingList = allQueues.filter(q => q.status === 'waiting');
            setTotalWaiting(waitingList.length);
            const myIndex = waitingList.findIndex(q => q.id === me.id);
            setPeopleAhead(myIndex !== -1 ? myIndex : 0);
          } else {
            setPeopleAhead(0);
          }
        } else {
          setTracking(null);
        }

        // Find current serving
        const serving = allQueues.filter(q => q.status === 'in_progress');
        if (serving.length > 0) {
          setCurrentServing(serving[serving.length - 1]);
        } else {
          setCurrentServing(null);
        }

        setLoading(false);
      });
    };

    setupSubscriptions();

    return () => {
      if (unsubQueues) unsubQueues();
      if (unsubConfig) unsubConfig();
    };
  }, [id]);

  const handleCancel = async () => {
    if (window.confirm("Apakah Anda yakin ingin membatalkan antrean? Anda tidak dapat mengembalikan tindakan ini.")) {
      try {
        await cancelQueue(tracking.id);
      } catch (error) {
        alert("Gagal membatalkan antrean.");
      }
    }
  };

  // Notification logic
  useEffect(() => {
    if (!tracking) return;

    if (tracking.status === 'skipped' && lastNotifiedCount !== 'skipped') {
      sendPushNotification("Antrean Dilewati", { body: "Maaf, nomor antrean Anda telah dilewati karena Anda tidak hadir saat dipanggil." });
      setLastNotifiedCount('skipped');
      return;
    }

    if (peopleAhead === null || peopleAhead > 3) return;
    if (lastNotifiedCount === peopleAhead) return;

    if (peopleAhead === 3 || peopleAhead === 2 || peopleAhead === 1) {
      const messages = {
        3: "Yuk, Siap-siap Berangkat! Pakai sendalnya, jalan santai ke klinik ya!",
        2: "Makin Dekat Nih! Cuma sisa 2 orang lagi. Duduk manis dulu sambil ngopi tipis-tipis.",
        1: "Satu Langkah Lagi! Tarik napas panjang. Begitu pasien di dalam selesai, Anda yang masuk!"
      };

      sendPushNotification(`Antrean Sisa ${peopleAhead} Orang`, { body: messages[peopleAhead] });
      setLastNotifiedCount(peopleAhead);
    }
  }, [peopleAhead, tracking, lastNotifiedCount]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-16 h-16 bg-gray-200 rounded-2xl mb-4"></div>
        <div className="w-32 h-4 bg-gray-200 rounded-full mb-2"></div>
        <div className="w-24 h-3 bg-gray-200 rounded-full"></div>
      </div>
    </div>
  );

  if (!tracking) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white p-8 rounded-[2rem] shadow-xl text-center max-w-md w-full border border-gray-100">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-gray-800 mb-2">Tiket Tidak Valid</h2>
          <p className="text-gray-500 mb-8 font-medium">Nomor antrean atau kode unik tidak ditemukan di sistem kami. Mungkin antrean Anda sudah selesai atau dibatalkan.</p>
          <button onClick={() => navigate('/')} className="w-full bg-emerald-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95">
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  const isFuture = patientData.targetDate && patientData.targetDate > getTodayStr();
  const isAlmostTurn = !isFuture && peopleAhead !== null && peopleAhead <= 3;
  const isServing = tracking.status === 'in_progress';
  const isCompleted = tracking.status === 'completed';
  const isSkipped = tracking.status === 'skipped';
  const isCancelled = tracking.status === 'cancelled';
  const isWaiting = tracking.status === 'waiting';

  const formattedWaitTime = parseFloat(config?.lastPrediction || 15).toFixed(1).replace('.', ',');

  // Calculate Progress Percentage (0 to 100)
  const progressPercent = isServing ? 100 : (isWaiting && totalWaiting > 0 ? Math.max(5, ((totalWaiting - peopleAhead) / totalWaiting) * 100) : 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto p-4 sm:p-6 font-sans relative">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-800 p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="font-bold tracking-widest uppercase text-xs text-gray-400">Live Ticket</span>
        <div className="w-10"></div>
      </div>

      {/* Break Banner */}
      {config?.isPaused && (
        <div className="bg-amber-100 text-amber-800 p-4 rounded-2xl flex items-center gap-4 border border-amber-300 mb-6 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="bg-amber-200 text-amber-700 p-3 rounded-xl shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 11V9a2 2 0 00-2-2m2 4v4a2 2 0 104 0v-1m-4-3H9m2 0h4m6 1a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div>
            <p className="font-bold text-sm uppercase tracking-widest mb-1">Klinik Sedang Istirahat</p>
            <p className="font-medium text-xs leading-relaxed opacity-90">
              Pelayanan sedang dijeda sementara. Estimasi waktu istirahat sekitar <span className="font-bold">20 menit</span>.
            </p>
          </div>
        </div>
      )}

      {/* Main Ticket Card */}
      <div className={`relative rounded-[2.5rem] shadow-2xl overflow-hidden transition-all duration-700 mb-6 ${isServing ? 'bg-gradient-to-br from-orange-500 to-red-600 scale-[1.02] shadow-orange-500/40' :
          isCompleted ? 'bg-gradient-to-br from-gray-700 to-gray-900' :
            isSkipped ? 'bg-gradient-to-br from-rose-600 to-red-800' :
              isCancelled ? 'bg-gradient-to-br from-gray-400 to-gray-600' :
                isFuture ? 'bg-gradient-to-br from-blue-500 to-indigo-700 shadow-blue-500/30' :
                isAlmostTurn ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/30' :
                  'bg-gradient-to-br from-emerald-500 to-teal-700'
        }`}>
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-white opacity-10 rounded-full blur-2xl"></div>

        {/* Ticket cutouts */}
        <div className="absolute top-1/2 -left-3 w-6 h-6 bg-gray-50 rounded-full -translate-y-1/2"></div>
        <div className="absolute top-1/2 -right-3 w-6 h-6 bg-gray-50 rounded-full -translate-y-1/2"></div>

        <div className="p-8 text-center text-white relative z-10 border-b border-white/20 border-dashed">
          <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-2">Nomor Antrean</p>
          <h1 className={`text-8xl font-black mb-4 tracking-tighter drop-shadow-lg leading-none ${isAlmostTurn && isWaiting && 'animate-pulse'}`}>
            {patientData.queueNumber}
          </h1>
          <p className="bg-black/20 inline-block px-5 py-2 rounded-xl text-sm font-bold tracking-widest backdrop-blur-sm border border-white/10">
            {patientData.queueCode}
          </p>
        </div>

        <div className="p-6 bg-black/10 backdrop-blur-md relative z-10 flex flex-col items-center">
          <div className={`px-6 py-2.5 rounded-xl font-bold text-sm tracking-wider flex items-center gap-2 shadow-lg ${isServing ? 'bg-white text-orange-600 animate-bounce' :
              isCompleted ? 'bg-white text-gray-800' :
                isSkipped ? 'bg-white text-rose-600' :
                  isCancelled ? 'bg-gray-200 text-gray-600' :
                    isFuture ? 'bg-white text-blue-600' :
                    isAlmostTurn ? 'bg-white text-amber-600' :
                      'bg-emerald-800/80 text-white border border-emerald-400/30'
            }`}>
            {isServing && <BellRing className="w-4 h-4" />}
            {isAlmostTurn && isWaiting && <Flame className="w-4 h-4" />}
            {isSkipped && <AlertCircle className="w-4 h-4" />}
            {isServing ? 'SILAKAN MASUK' : isCompleted ? 'SELESAI' : isSkipped ? 'DILEWATI' : isCancelled ? 'DIBATALKAN' : isFuture ? 'MENUNGGU HARI H' : isAlmostTurn ? 'HAMPIR GILIRAN ANDA!' : 'TUNGGU DI LUAR'}
          </div>
          <p className="text-white/90 font-medium text-sm mt-4">{patientData.name}</p>
        </div>
      </div>

      {isFuture && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-6 rounded-[2rem] text-center mb-6 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar mx-auto mb-2 text-blue-500"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          <h3 className="text-lg font-black mb-1">Booking Dikonfirmasi</h3>
          <p className="text-sm font-medium">Jadwal berobat Anda pada tanggal:</p>
          <p className="text-xl font-bold mt-2 text-blue-900">{format(new Date(patientData.targetDate), 'dd MMMM yyyy', { locale: idLocale })}</p>
          <p className="text-xs text-blue-600 mt-4 opacity-80">Silakan cek kembali halaman ini di hari H untuk memantau pergerakan antrean.</p>
        </div>
      )}

      {/* Progress Bar for Waiting Patients (ONLY FOR TODAY) */}
      {isWaiting && !isFuture && (
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 mb-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Posisi Anda</p>
              <h3 className="text-2xl font-black text-gray-800">{peopleAhead} <span className="text-base text-gray-500 font-medium tracking-normal">Orang di depan</span></h3>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Estimasi</p>
              <h3 className="text-xl font-black text-emerald-600">{formattedWaitTime} <span className="text-sm">mnt/org</span></h3>
            </div>
          </div>

          <div className="relative w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out ${isAlmostTurn ? 'bg-amber-400' : 'bg-emerald-500'}`}
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-widest">
            <span>Daftar</span>
            <span>Ruang Dokter</span>
          </div>
        </div>
      )}

      {/* Dynamic Engaging Status Card (ONLY FOR TODAY) */}
      {isWaiting && !isFuture && (
        <div className={`rounded-3xl p-5 border shadow-sm flex items-start gap-4 transition-all duration-500 mb-6 ${isAlmostTurn ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'}`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${isAlmostTurn ? 'bg-amber-200 text-amber-700' : 'bg-blue-200 text-blue-700'}`}>
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <p className={`text-base font-bold mb-1 ${isAlmostTurn ? 'text-amber-800' : 'text-blue-800'}`}>
              {peopleAhead === 3 ? 'Ayo Siap-siap!' :
                peopleAhead === 2 ? 'Makin Dekat!' :
                  peopleAhead === 1 ? 'Satu Langkah Lagi!' : 'Santai Sejenak'}
            </p>
            <p className={`text-xs leading-relaxed font-medium ${isAlmostTurn ? 'text-amber-700/80' : 'text-blue-700/80'}`}>
              {peopleAhead === 3 ? 'Pakai sendalnya, jalan santai ke klinik ya! Sebentar lagi giliran Anda.' :
                peopleAhead === 2 ? 'Sudah sampai di klinik belum? Duduk manis dulu sambil ngopi tipis-tipis.' :
                  peopleAhead === 1 ? 'Tarik napas panjang. Begitu pasien di dalam selesai, Anda yang masuk!' :
                    'Sistem akan memberi tahu otomatis saat antrean tersisa 3 orang. Silakan melakukan aktivitas lain.'}
            </p>
          </div>
        </div>
      )}

      {/* Info Cards */}
      {!isCompleted && !isCancelled && !isSkipped && !isFuture && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
            <UserCheck className="text-emerald-500 w-6 h-6 mb-2" />
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Sedang Dilayani</p>
            <p className="text-2xl font-black text-gray-800">{currentServing ? currentServing.queueNumber : '-'}</p>
          </div>

          <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
            <Clock className="text-blue-500 w-6 h-6 mb-2" />
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Jam Estimasi</p>
            <p className="text-lg font-black text-gray-800">
              {patientData.estimatedTime ? format(new Date(patientData.estimatedTime), 'HH:mm', { locale: idLocale }) : '-:-'}
            </p>
          </div>
        </div>
      )}

      {/* States: Serving, Skipped, Cancelled */}
      {isServing && (
        <div className="bg-orange-50 rounded-[2rem] p-6 border border-orange-100 text-center animate-in zoom-in duration-500">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-orange-500 animate-bounce" />
          </div>
          <h3 className="text-2xl font-black text-orange-600 mb-2">Giliran Anda Tiba!</h3>
          <p className="text-orange-800 font-medium text-sm">Silakan masuk ke ruang terapi / rendam kaki sekarang.</p>
        </div>
      )}

      {isSkipped && (
        <div className="bg-rose-50 rounded-[2rem] p-6 border border-rose-100 text-center animate-in zoom-in duration-500">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h3 className="text-xl font-black text-rose-700 mb-2">Antrean Terlewat</h3>
          <p className="text-rose-600/80 font-medium text-sm">Mohon maaf, antrean Anda telah dilewati karena Anda tidak hadir saat dipanggil. Silakan melapor ke resepsionis.</p>
        </div>
      )}

      {isCancelled && (
        <div className="bg-gray-100 rounded-[2rem] p-6 text-center">
          <XCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-700 mb-2">Antrean Dibatalkan</h3>
          <p className="text-gray-500 text-sm">Anda telah membatalkan antrean ini.</p>
        </div>
      )}

      {isCompleted && (
        <div className="bg-emerald-50 rounded-[2rem] p-6 border border-emerald-100 text-center">
          <h3 className="text-lg font-bold text-emerald-700 mb-2">Selesai Berobat</h3>
          <p className="text-emerald-600/80 text-sm font-medium">Terima kasih atas kunjungan Anda. Semoga lekas sembuh!</p>
        </div>
      )}

      {/* Cancel Button */}
      {isWaiting && (
        <button onClick={handleCancel} className="mt-4 w-full py-4 rounded-xl text-red-500 font-bold text-sm hover:bg-red-50 transition-colors">
          Batalkan Antrean
        </button>
      )}

    </div>
  );
}
