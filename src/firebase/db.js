import { 
  collection, doc, onSnapshot, runTransaction, 
  setDoc, addDoc, serverTimestamp, query, orderBy, getDocs, writeBatch, where, updateDoc, getDoc
} from "firebase/firestore";
import { db } from "./config";
import { addMinutes } from "date-fns";

// Collections
const queuesRef = collection(db, "queues");
const configRef = doc(db, "system_config", "main");

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

    // Find the waiting patients
    const qSnapshot = await getDocs(query(queuesRef, orderBy("queueNumber", "asc")));
    let waitingDocs = [];
    qSnapshot.forEach(docSnap => {
      if (docSnap.data().status === 'waiting') {
        waitingDocs.push(docSnap);
      }
    });

    const docsToCall = waitingDocs.slice(0, count);
    const capacityToAdd = docsToCall.length;

    if (capacityToAdd === 0) {
      throw new Error('Tidak ada antrean menunggu.');
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

    transaction.update(configRef, { currentCapacity: config.currentCapacity + capacityToAdd });
  });
};

export const subscribeToQueues = (callback) => {
  const q = query(queuesRef, orderBy("queueNumber", "asc"));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(data);
  });
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
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
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
    // 1. Setup Patient Profile & Check 1x Per Day Limit
    const patientRef = doc(db, "patients", patientData.phone);
    const patientSnap = await transaction.get(patientRef);
    
    const todayDateStr = new Date().toLocaleDateString('en-CA'); // Format: YYYY-MM-DD

    let finalPatientName = patientData.name;

    if (patientSnap.exists()) {
      const pData = patientSnap.data();
      finalPatientName = pData.name; // Use existing registered name, ignore new input

      if (pData.lastVisitDate === todayDateStr) {
        throw new Error(`Pasien atas nama ${finalPatientName} (${patientData.phone}) sudah didaftarkan hari ini. Batas pendaftaran adalah 1x per hari.`);
      }
    }

    // 2. Queue Logic & Waiting Count
    const configSnap = await transaction.get(configRef);
    let config = configSnap.exists() ? configSnap.data() : { lastPrediction: 15, currentCapacity: 0 };
    
    // --- ALL READS DONE --- //

    if (!patientSnap.exists()) {
      transaction.set(patientRef, {
        name: finalPatientName,
        phone: patientData.phone,
        firstVisit: serverTimestamp(),
        lastVisitDate: todayDateStr // Store string for easy daily comparison
      });
    } else {
      transaction.update(patientRef, {
        lastVisitDate: todayDateStr
      });
    }

    // Get current queues count to determine new queueNumber & calculate initial estimate
    const activeQueuesQuery = query(queuesRef);
    const qSnapshot = await getDocs(activeQueuesQuery);
    
    let totalQueues = 0;
    let waitingCount = 0;
    qSnapshot.forEach(doc => {
      totalQueues++;
      const data = doc.data();
      if (data.status === 'waiting' || data.status === 'in_progress') waitingCount++;
    });

    const newQueueNumber = totalQueues + 1;
    const queueCode = `A-${newQueueNumber.toString().padStart(3, '0')}-${patientData.phone.slice(-4)}`;
    const estimatedWaitMins = (waitingCount + 1) * (config.lastPrediction || 15);
    const estimatedTime = addMinutes(new Date(), estimatedWaitMins).toISOString();

    const newDocRef = doc(queuesRef);
    const newData = {
      queueNumber: newQueueNumber,
      queueCode: queueCode,
      name: finalPatientName, // Use consistent name
      phone: patientData.phone,
      complaint: patientData.complaint,
      status: 'waiting',
      registeredAt: serverTimestamp(),
      estimatedTime: estimatedTime,
      patientId: patientData.phone
    };

    transaction.set(newDocRef, newData);
    return newData;
  });
};

export const getPatients = async () => {
  const patientsQuery = query(collection(db, "patients"));
  const snapshot = await getDocs(patientsQuery);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getPatientHistory = async (phone) => {
  try {
    // Check both current queues and archived queue_history
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
    const queuesRef = collection(db, "queues");
    const snapshot = await getDocs(queuesRef);
    
    // Safety check
    let hasActive = false;
    snapshot.forEach(docSnap => {
      const status = docSnap.data().status;
      if (status !== 'completed' && status !== 'skipped' && status !== 'cancelled') {
        hasActive = true;
      }
    });
    if (hasActive) {
      throw new Error("Masih ada pasien yang belum selesai! Tolong selesaikan atau skip semua pasien sebelum menutup klinik.");
    }

    const batch = writeBatch(db);
    
    // Calculate Analytics
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const totalPatients = snapshot.size;
    const complaints = {};
    
    // Move all current queues to queue_history
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const c = data.complaint || 'Tidak Diketahui';
      complaints[c] = (complaints[c] || 0) + 1;

      const historyDocRef = doc(collection(db, "queue_history"));
      batch.set(historyDocRef, {
        ...data,
        archivedAt: serverTimestamp()
      });
      // Delete from active queues
      batch.delete(docSnap.ref);
    });

    // Create Daily Report if there were patients
    if (totalPatients > 0) {
      const reportRef = doc(db, "daily_reports", dateStr);
      batch.set(reportRef, {
        date: dateStr,
        timestamp: serverTimestamp(),
        totalPatients,
        complaints
      });
    }

    // Reset config
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

    // Fetch from queue_history
    const historyRef = collection(db, "queue_history");
    // Using registeredAt because we care about when the patient visited
    const hQuery = query(
      historyRef,
      where("registeredAt", ">=", startObj),
      where("registeredAt", "<=", endObj)
    );
    const historySnap = await getDocs(hQuery);
    historySnap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));

    // Fetch from active queues (if date range covers today)
    const todayObj = new Date();
    todayObj.setHours(0,0,0,0);
    if (endObj >= todayObj) {
      const queuesRef = collection(db, "queues");
      const qQuery = query(
        queuesRef,
        where("registeredAt", ">=", startObj),
        where("registeredAt", "<=", endObj)
      );
      const queuesSnap = await getDocs(qQuery);
      queuesSnap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
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

    // Find the first waiting patient
    const qSnapshot = await getDocs(query(queuesRef, orderBy("queueNumber", "asc")));
    let nextPatientDoc = null;
    qSnapshot.forEach(docSnap => {
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

    // Update capacity
    const newCapacity = Math.max(0, config.currentCapacity - 1);

    const now = new Date();

    // Calculate actual duration
    let calculatedDuration = null;
    if (patientData.startedAt) {
      const patientStartTime = patientData.startedAt.toDate ? patientData.startedAt.toDate() : new Date(patientData.startedAt);
      
      let effectiveStartTime = patientStartTime;
      if (config.lastCompletedAt) {
        const lastCompletedTime = config.lastCompletedAt.toDate ? config.lastCompletedAt.toDate() : new Date(config.lastCompletedAt);
        // Gunakan waktu selesai pasien sebelumnya sebagai start time pasien saat ini 
        // (jika pasien sebelumnya selesai lebih akhir daripada waktu pasien ini dipanggil masuk).
        // Ini mensimulasikan fakta bahwa Pak Alit melayani berurutan dari kursi ke kursi.
        if (lastCompletedTime > patientStartTime) {
          effectiveStartTime = lastCompletedTime;
        }
      }

      const diffMs = now - effectiveStartTime;
      calculatedDuration = Math.max(1, Math.round(diffMs / 60000));
      
      // MITIGASI HUMAN ERROR: Outlier Rejection / Clamping
      // Jika Admin telat menekan tombol dan waktu terhitung lebih dari 30 menit 
      // (yang mana tidak wajar untuk 1 pasien), sistem akan memangkasnya menjadi nilai batas wajar.
      if (calculatedDuration > 30) {
        calculatedDuration = 30; // Angka wajar maksimal
      }
    }

    // SES Algorithm
    const Xt = actualDurationMins || calculatedDuration || Math.floor(Math.random() * 11) + 10;
    const St_prev = config.lastPrediction || 15;
    const alpha = config.alpha || 0.3;
    const St = (alpha * Xt) + ((1 - alpha) * St_prev);

    // Get remaining waiting patients BEFORE writes
    const qSnapshot = await getDocs(query(queuesRef, orderBy("queueNumber", "asc")));

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
      lastCompletedAt: serverTimestamp()
    });

    // Update remaining waiting patients' estimated time
    // LOGIC FIX: Kita harus menghitung jumlah orang di depan mereka yang berstatus 'in_progress' atau 'waiting'.
    // Jika kita mengabaikan 'in_progress', waktu tunggu antrean di luar akan langsung drop drastis.
    let remainingAhead = 1; 
    qSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      // Kita hanya peduli pada pasien yang masih antre atau sedang dilayani (kecuali pasien yang sedang kita finish ini)
      if ((data.status === 'in_progress' || data.status === 'waiting') && docSnap.id !== id) {
        
        // Kita hanya perlu meng-update UI estimasi waktu untuk pasien yang 'waiting' (di luar)
        if (data.status === 'waiting') {
          const estimatedWaitMins = remainingAhead * St;
          const newEstimatedTime = addMinutes(new Date(), Math.round(estimatedWaitMins)).toISOString();
          transaction.update(docSnap.ref, { estimatedTime: newEstimatedTime });
        }
        
        // Tambahkan jumlah orang di depan untuk pasien berikutnya di iterasi ini
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
    // 1. Get current config for St
    const configSnap = await getDoc(configRef);
    const config = configSnap.exists() ? configSnap.data() : {};
    const St = config.lastPrediction || 15;

    // 2. Setup batch
    const batch = writeBatch(db);
    batch.update(configRef, { 
      isPaused: false, 
      lastCompletedAt: serverTimestamp() 
    });

    // 3. Get all active queues to recalculate estimated times based on the current time (Resume time)
    const qSnapshot = await getDocs(query(queuesRef, orderBy("queueNumber", "asc")));
    let remainingAhead = 1;

    qSnapshot.forEach(docSnap => {
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

// Fungsi ini cuma dipakai jika db masih kosong untuk init config
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
