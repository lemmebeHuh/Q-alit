import { 
  collection, doc, onSnapshot, runTransaction, 
  setDoc, addDoc, serverTimestamp, query, orderBy, getDocs, writeBatch, where, updateDoc, getDoc
} from "firebase/firestore";
import { db } from "./config";
import { addMinutes } from "date-fns";

// Collections
const queuesRef = collection(db, "queues");
const configRef = doc(db, "system_config", "main");

export const getTodayStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const callInitialBatch = async (count = 20) => {
  return runTransaction(db, async (transaction) => {
    const configSnap = await transaction.get(configRef);
    if (!configSnap.exists()) throw new Error("Config not found");
    const config = configSnap.data();

    if (config.isPaused) {
      throw new Error('Sistem sedang dalam mode istirahat. Harap lanjutkan sistem terlebih dahulu.');
    }

    if (config.currentCapacity >= 20) {
      throw new Error('Kapasitas Penuh.');
    }

    // Find the waiting patients FOR TODAY
    const todayStr = getTodayStr();
    const qSnapshot = await getDocs(query(queuesRef, where("targetDate", "==", todayStr)));
    let allDocs = [];
    qSnapshot.forEach(d => allDocs.push(d));
    allDocs.sort((a, b) => (a.data().queueNumber || 0) - (b.data().queueNumber || 0));

    let waitingDocs = [];
    allDocs.forEach(docSnap => {
      if (docSnap.data().status === 'waiting') {
        waitingDocs.push(docSnap);
      }
    });

    const docsToCall = waitingDocs.slice(0, count);
    const capacityToAdd = docsToCall.length;

    if (capacityToAdd === 0) {
      throw new Error('Tidak ada antrean menunggu untuk hari ini.');
    }

    if (config.currentCapacity + capacityToAdd > 20) {
      throw new Error(`Tidak bisa memanggil ${capacityToAdd} pasien. Kapasitas tersisa: ${20 - config.currentCapacity}`);
    }

    docsToCall.forEach(docSnap => {
      transaction.update(docSnap.ref, { 
        status: 'in_progress',
        startedAt: serverTimestamp()
      });
    });

    // Inisialisasi estimatedTime untuk sisa pasien yang menunggu hari ini (jika mereka hasil booking sebelumnya)
    const St = config.lastPrediction || 15;
    let remainingAhead = capacityToAdd;
    
    waitingDocs.slice(count).forEach(docSnap => {
      const estimatedWaitMins = remainingAhead * St;
      const newEstimatedTime = addMinutes(new Date(), Math.round(estimatedWaitMins)).toISOString();
      transaction.update(docSnap.ref, { estimatedTime: newEstimatedTime });
      remainingAhead++;
    });

    transaction.update(configRef, { currentCapacity: config.currentCapacity + capacityToAdd });
  });
};

export const subscribeToQueues = (callback, dateStr = null) => {
  const target = dateStr || getTodayStr();
  const q = query(queuesRef, where("targetDate", "==", target));
  return onSnapshot(q, (snapshot) => {
    let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    data.sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0));
    callback(data);
  });
};

export const subscribeToFutureBookings = (callback) => {
  const todayStr = getTodayStr();
  const q = query(queuesRef, where("targetDate", ">", todayStr), orderBy("targetDate", "asc"));
  return onSnapshot(q, (snapshot) => {
    let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    data = data.filter(q => q.status !== 'cancelled');
    // Client-side sort by queueNumber to avoid Firestore composite index requirement
    data.sort((a, b) => {
      if (a.targetDate === b.targetDate) {
        return (a.queueNumber || 0) - (b.queueNumber || 0);
      }
      return 0; // Already sorted by targetDate via query
    });
    callback(data);
  });
};

export const patchLegacyQueues = async () => {
  try {
    const snapshot = await getDocs(queuesRef);
    const batch = writeBatch(db);
    let count = 0;
    const todayStr = getTodayStr();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.targetDate) {
        batch.update(docSnap.ref, { targetDate: todayStr });
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
      console.log(`Patched ${count} legacy queues with targetDate.`);
    }
  } catch (error) {
    console.error("Error patching legacy queues:", error);
  }
};

export const subscribeToConfig = (callback) => {
  return onSnapshot(configRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback({ currentCapacity: 0, alpha: 0.3, lastPrediction: 15, lastDuration: 15, isPaused: false });
    }
  });
};

export const getQueueByPhone = async (phone) => {
  const q = query(queuesRef, where("phone", "==", phone), where("status", "in", ["waiting", "in_progress"]));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  // Prioritaskan antrean hari ini jika ada multiple
  const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const todayQueue = docs.find(d => d.targetDate === getTodayStr());
  return todayQueue || docs[0];
};

export const getQueueByCode = async (code) => {
  const q = query(queuesRef, where("queueCode", "==", code), where("status", "in", ["waiting", "in_progress"]));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
};

export { db };

export const addQueue = async (patientData) => {
  return runTransaction(db, async (transaction) => {
    const todayDateStr = getTodayStr();
    const targetDate = patientData.targetDate || todayDateStr;

    // Check if patient exists AND is verified
    const patientRef = doc(db, "patients", patientData.phone);
    const patientSnap = await transaction.get(patientRef);
    
    if (!patientSnap.exists()) {
      throw new Error(`Nomor ${patientData.phone} belum terdaftar. Silakan lakukan 'Pendaftaran Profil Baru' terlebih dahulu.`);
    }
    
    const existingPatient = patientSnap.data();
    if (existingPatient.status !== 'verified') {
      throw new Error(`Profil Anda masih berstatus Menunggu Verifikasi. Silakan hubungi Admin via WhatsApp.`);
    }
    
    // Validasi nama tidak lagi diperlukan saat ambil antrean 
    // karena nama sudah terikat pada nomor HP saat pembuatan profil.

    // 1. Cek apakah pasien sudah mendaftar di tanggal yang sama (targetDate)
    const activeQueuesQuery = query(queuesRef, where("targetDate", "==", targetDate));
    const qSnapshot = await getDocs(activeQueuesQuery);
    
    let totalQueues = 0;
    let waitingCount = 0;
    let alreadyRegistered = false;

    qSnapshot.forEach(doc => {
      totalQueues++;
      const data = doc.data();
      if (data.phone === patientData.phone && data.status !== 'cancelled') {
        alreadyRegistered = true;
      }
      if (data.status === 'waiting' || data.status === 'in_progress') {
        waitingCount++;
      }
    });

    // Limit 1x per hari target
    if (alreadyRegistered) {
      throw new Error(`Pasien dengan nomor ${patientData.phone} sudah terdaftar untuk tanggal ${targetDate}.`);
    }

    const configSnap = await transaction.get(configRef);
    let config = configSnap.exists() ? configSnap.data() : { lastPrediction: 15, currentCapacity: 0 };
    
    // --- ALL READS DONE --- //

    // Update profil pasien
    transaction.update(patientRef, {
      lastVisitDate: targetDate
    });

    const newQueueNumber = totalQueues + 1;
    const queueCode = `A-${newQueueNumber.toString().padStart(3, '0')}-${patientData.phone.slice(-4)}`;
    
    // SES Estimate hanya dihitung jika pendaftaran untuk hari ini
    let estimatedTime = null;
    if (targetDate === todayDateStr) {
      const estimatedWaitMins = (waitingCount + 1) * (config.lastPrediction || 15);
      estimatedTime = addMinutes(new Date(), Math.round(estimatedWaitMins)).toISOString();
    }

    const newDocRef = doc(queuesRef);
    const newData = {
      queueNumber: newQueueNumber,
      queueCode: queueCode,
      name: patientSnap.exists() ? patientSnap.data().name : patientData.name,
      phone: patientData.phone,
      complaint: patientData.complaint,
      status: 'waiting',
      registeredAt: serverTimestamp(),
      targetDate: targetDate, // NEW FIELD
      estimatedTime: estimatedTime,
      patientId: patientData.phone
    };

    transaction.set(newDocRef, newData);
    return newData;
  });
};

export const registerNewPatient = async (name, phone) => {
  return runTransaction(db, async (transaction) => {
    const patientRef = doc(db, "patients", phone);
    const patientSnap = await transaction.get(patientRef);
    
    if (patientSnap.exists()) {
      throw new Error(`Nomor telepon ${phone} sudah terdaftar sebelumnya.`);
    }

    transaction.set(patientRef, {
      name: name,
      phone: phone,
      status: 'unverified',
      registeredAt: serverTimestamp()
    });
    
    return true;
  });
};

export const verifyPatientProfile = async (phone) => {
  const patientRef = doc(db, "patients", phone);
  await updateDoc(patientRef, {
    status: 'verified',
    verifiedAt: serverTimestamp()
  });
};

export const getUnverifiedPatients = async () => {
  const q = query(collection(db, "patients"), where("status", "==", "unverified"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getPatients = async () => {
  const patientsQuery = query(collection(db, "patients"));
  const snapshot = await getDocs(patientsQuery);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getPatientHistory = async (phone) => {
  try {
    const queuesRef = collection(db, "queues");
    const qQuery = query(queuesRef, where("patientId", "==", phone), where("status", "==", "completed"));
    const activeSnap = await getDocs(qQuery);
    
    const historyRef = collection(db, "queue_history");
    const hQuery = query(historyRef, where("patientId", "==", phone), where("status", "==", "completed"));
    const historySnap = await getDocs(hQuery);

    const history = [];
    activeSnap.forEach((doc) => history.push({ id: doc.id, ...doc.data() }));
    historySnap.forEach((doc) => history.push({ id: doc.id, ...doc.data() }));

    return history.sort((a, b) => b.registeredAt?.seconds - a.registeredAt?.seconds);
  } catch (error) {
    throw error;
  }
};

export const resetDailySystem = async () => {
  try {
    const snapshot = await getDocs(queuesRef);
    const todayStr = getTodayStr();
    
    let hasActive = false;
    let queuesToArchive = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const tDate = data.targetDate || todayStr; 
      
      // HANYA arsipkan data hari ini atau yang tertinggal dari masa lalu
      if (tDate <= todayStr) {
        queuesToArchive.push({ ref: docSnap.ref, data: data });
        const status = data.status;
        if (status !== 'completed' && status !== 'skipped' && status !== 'cancelled') {
          hasActive = true;
        }
      }
    });

    if (hasActive) {
      throw new Error("Masih ada pasien HARI INI yang belum selesai! Tolong selesaikan atau skip semua pasien hari ini sebelum menutup klinik.");
    }

    const batch = writeBatch(db);
    const dateStr = getTodayStr();
    let totalPatients = 0;
    const complaints = {};
    
    queuesToArchive.forEach(({ ref, data }) => {
      if (data.status !== 'cancelled') {
        const c = data.complaint || 'Tidak Diketahui';
        complaints[c] = (complaints[c] || 0) + 1;
        totalPatients++;
      }

      const historyDocRef = doc(collection(db, "queue_history"));
      batch.set(historyDocRef, {
        ...data,
        archivedAt: serverTimestamp()
      });
      batch.delete(ref);
    });

    if (totalPatients > 0) {
      const reportRef = doc(db, "daily_reports", dateStr);
      batch.set(reportRef, {
        date: dateStr,
        timestamp: serverTimestamp(),
        totalPatients,
        complaints
      });
    }

    const configRef = doc(db, "system_config", "main");
    batch.update(configRef, { currentCapacity: 0 });

    await batch.commit();
    return true;
  } catch (error) {
    console.error("Error resetting system:", error);
    throw error;
  }
};

export const getDailyReports = async () => {
  try {
    const reportsRef = collection(db, "daily_reports");
    const snapshot = await getDocs(query(reportsRef, orderBy("date", "desc")));
    const reports = [];
    snapshot.forEach(doc => reports.push({ id: doc.id, ...doc.data() }));
    return reports;
  } catch (error) {
    throw error;
  }
};

export const getHistoryByDateRange = async (startDateStr, endDateStr) => {
  try {
    const startObj = new Date(startDateStr);
    startObj.setHours(0, 0, 0, 0);
    const endObj = new Date(endDateStr);
    endObj.setHours(23, 59, 59, 999);

    let results = [];

    const historyRef = collection(db, "queue_history");
    const hQuery = query(
      historyRef,
      where("registeredAt", ">=", startObj),
      where("registeredAt", "<=", endObj)
    );
    const historySnap = await getDocs(hQuery);
    historySnap.forEach(doc => {
      if (doc.data().status !== 'cancelled') {
        results.push({ id: doc.id, ...doc.data() });
      }
    });

    const todayObj = new Date();
    todayObj.setHours(0,0,0,0);
    if (endObj >= todayObj) {
      const qQuery = query(
        queuesRef,
        where("registeredAt", ">=", startObj),
        where("registeredAt", "<=", endObj)
      );
      const queuesSnap = await getDocs(qQuery);
      queuesSnap.forEach(doc => {
        if (doc.data().status !== 'cancelled') {
          results.push({ id: doc.id, ...doc.data() });
        }
      });
    }

    return results.sort((a, b) => b.registeredAt?.seconds - a.registeredAt?.seconds);
  } catch (error) {
    throw error;
  }
};

export const callNextPatient = async () => {
  return runTransaction(db, async (transaction) => {
    const configSnap = await transaction.get(configRef);
    if (!configSnap.exists()) throw new Error("Config not found");
    const config = configSnap.data();

    if (config.isPaused) {
      throw new Error('Sistem sedang dalam mode istirahat. Harap lanjutkan sistem terlebih dahulu.');
    }

    if (config.currentCapacity >= 20) {
      throw new Error('Kapasitas Penuh (20/20).');
    }

    const todayStr = getTodayStr();
    const qSnapshot = await getDocs(query(queuesRef, where("targetDate", "==", todayStr)));
    let allDocs = [];
    qSnapshot.forEach(d => allDocs.push(d));
    allDocs.sort((a, b) => (a.data().queueNumber || 0) - (b.data().queueNumber || 0));

    let nextPatientDoc = null;
    allDocs.forEach(docSnap => {
      if (!nextPatientDoc && docSnap.data().status === 'waiting') {
        nextPatientDoc = docSnap;
      }
    });

    if (nextPatientDoc) {
      transaction.update(nextPatientDoc.ref, { 
        status: 'in_progress',
        startedAt: serverTimestamp()
      });
      transaction.update(configRef, { currentCapacity: config.currentCapacity + 1 });
    }
  });
};

export const finishPatient = async (id, actualDurationMins = null) => {
  return runTransaction(db, async (transaction) => {
    const patientRef = doc(db, "queues", id);
    const patientSnap = await transaction.get(patientRef);
    if (!patientSnap.exists() || patientSnap.data().status !== 'in_progress') return;

    const patientData = patientSnap.data();

    const configSnap = await transaction.get(configRef);
    const config = configSnap.exists() ? configSnap.data() : { currentCapacity: 1, alpha: 0.3, lastPrediction: 15 };

    const newCapacity = Math.max(0, config.currentCapacity - 1);
    const now = new Date();

    let calculatedDuration = null;
    if (patientData.startedAt) {
      const patientStartTime = patientData.startedAt.toDate ? patientData.startedAt.toDate() : new Date(patientData.startedAt);
      
      let effectiveStartTime = patientStartTime;
      if (config.lastCompletedAt) {
        const lastCompletedTime = config.lastCompletedAt.toDate ? config.lastCompletedAt.toDate() : new Date(config.lastCompletedAt);
        if (lastCompletedTime > patientStartTime) {
          effectiveStartTime = lastCompletedTime;
        }
      }

      const diffMs = now - effectiveStartTime;
      calculatedDuration = Math.max(1, Math.round(diffMs / 60000));
      
      if (calculatedDuration > 30) {
        calculatedDuration = 30; 
      }
    }

    const Xt = actualDurationMins || calculatedDuration || Math.floor(Math.random() * 11) + 10;
    const St_prev = config.lastPrediction || 15;
    const alpha = config.alpha || 0.3;
    const St = (alpha * Xt) + ((1 - alpha) * St_prev);

    const todayStr = getTodayStr();
    const qSnapshot = await getDocs(query(queuesRef, where("targetDate", "==", todayStr)));
    let allDocs = [];
    qSnapshot.forEach(d => allDocs.push(d));
    allDocs.sort((a, b) => (a.data().queueNumber || 0) - (b.data().queueNumber || 0));

    // --- ALL READS DONE --- //

    transaction.update(patientRef, { 
      status: 'completed',
      actualDuration: Xt,
      completedAt: serverTimestamp()
    });
    transaction.update(configRef, { 
      currentCapacity: newCapacity,
      lastDuration: Xt,
      lastPrediction: St,
      lastCompletedAt: serverTimestamp(),
      lastCalculationDetails: {
        Xt: Xt,
        St_prev: St_prev,
        alpha: alpha,
        St_new: St
      }
    });

    let remainingAhead = 1; 
    allDocs.forEach(docSnap => {
      const data = docSnap.data();
      if ((data.status === 'in_progress' || data.status === 'waiting') && docSnap.id !== id) {
        if (data.status === 'waiting') {
          const estimatedWaitMins = remainingAhead * St;
          const newEstimatedTime = addMinutes(new Date(), Math.round(estimatedWaitMins)).toISOString();
          transaction.update(docSnap.ref, { estimatedTime: newEstimatedTime });
        }
        remainingAhead++;
      }
    });
  });
};

export const skipPatient = async (patientId) => {
  return runTransaction(db, async (transaction) => {
    const patientRef = doc(db, "queues", patientId);
    const patientSnap = await transaction.get(patientRef);
    if (!patientSnap.exists()) return;
    
    const patientData = patientSnap.data();
    
    if (patientData.status === 'in_progress') {
      const configSnap = await transaction.get(configRef);
      if (configSnap.exists()) {
        const config = configSnap.data();
        const newCapacity = Math.max(0, config.currentCapacity - 1);
        transaction.update(configRef, { currentCapacity: newCapacity });
      }
    }
    
    transaction.update(patientRef, { status: 'skipped' });
  });
};

export const cancelQueue = async (patientId) => {
  const patientRef = doc(db, "queues", patientId);
  await updateDoc(patientRef, { status: "cancelled" });
};

export const restoreQueue = async (patientId) => {
  const patientRef = doc(db, "queues", patientId);
  await updateDoc(patientRef, { status: "waiting" });
};

export const toggleSystemBreak = async (isPaused) => {
  if (isPaused) {
    await updateDoc(configRef, { isPaused: true, pausedAt: serverTimestamp() });
  } else {
    const configSnap = await getDoc(configRef);
    const config = configSnap.exists() ? configSnap.data() : {};
    const St = config.lastPrediction || 15;

    const batch = writeBatch(db);
    batch.update(configRef, { 
      isPaused: false, 
      lastCompletedAt: serverTimestamp() 
    });

    const todayStr = getTodayStr();
    const qSnapshot = await getDocs(query(queuesRef, where("targetDate", "==", todayStr)));
    let allDocs = [];
    qSnapshot.forEach(d => allDocs.push(d));
    allDocs.sort((a, b) => (a.data().queueNumber || 0) - (b.data().queueNumber || 0));
    
    let remainingAhead = 1;

    allDocs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.status === 'in_progress' || data.status === 'waiting') {
        if (data.status === 'waiting') {
          const estimatedWaitMins = remainingAhead * St;
          const newEstimatedTime = addMinutes(new Date(), Math.round(estimatedWaitMins)).toISOString();
          batch.update(docSnap.ref, { estimatedTime: newEstimatedTime });
        }
        remainingAhead++;
      }
    });

    await batch.commit();
  }
};

export const seedDummyData = async () => {
  try {
    const configSnap = await getDocs(collection(db, "system_config"));
    if (configSnap.empty) {
      await setDoc(configRef, {
        currentCapacity: 0,
        alpha: 0.3,
        lastDuration: 15,
        lastPrediction: 15
      });
    }
  } catch (e) {
    console.warn("Harap isi konfigurasi Firebase untuk mengaktifkan sinkronisasi.");
  }
};

