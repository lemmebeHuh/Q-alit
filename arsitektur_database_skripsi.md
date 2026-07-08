# Materi Skripsi: Optimasi Database & *Trade-off* Arsitektur pada Sistem Antrean

Dokumen ini berisi landasan teori dan justifikasi pengambilan keputusan arsitektural terkait manipulasi data pada Firebase Firestore. Materi ini dapat disadur ke dalam Bab IV (Implementasi & Pengujian) atau Bab III (Metodologi/Perancangan Sistem) pada skripsi Anda.

---

## 1. Latar Belakang Masalah (Kendala Firestore *Composite Index*)

Pada pengembangan sistem antrean cerdas Q-Alit, fitur *Advance Booking* (Pendaftaran Hari Depan) mengharuskan sistem untuk memilah dan mengurutkan data secara bersamaan. Secara spesifik, sistem harus melakukan dua hal sekaligus:
1. **Filtering (Penyaringan):** Mengambil data antrean khusus untuk tanggal tertentu (contoh: `targetDate == HARI INI`).
2. **Sorting (Pengurutan):** Mengurutkan data yang telah disaring tersebut berdasarkan nomor urut pasien (`orderBy("queueNumber", "asc")`).

Pada arsitektur *NoSQL Firebase Firestore*, melakukan *Query* yang menggabungkan operasi *Equality Filter* (`==`) pada satu *field* dengan operasi *Sorting* (`orderBy`) pada *field* lain tidak dapat dilakukan secara bawaan tanpa konfigurasi ekstra. Firestore mewajibkan pengembang untuk secara manual meracik **Composite Index** (Indeks Gabungan) pada *server* Google Cloud. Tanpa indeks ini, operasi *query* akan ditolak oleh sistem dan data gagal dimuat (terjadi *silent error* pada *snapshot listener*).

## 2. Pemecahan Masalah: *Client-Side Sorting* vs *Composite Index*

Dalam rekayasa perangkat lunak, segala keputusan teknis mempertimbangkan *trade-off* (untung-rugi) berdasarkan skala aplikasi. Terdapat dua pilihan solusi:

### Opsi A: Menerapkan *Firestore Composite Index*
Solusi ini sangat dianjurkan (menjadi standar emas/ide terbaik) **HANYA JIKA** sistem dihadapkan pada jutaan baris data (Big Data). 
- **Kekurangan pada Sistem Skala Kecil:** Pembuatan *Composite Index* mengharuskan *deployment* konfigurasi yang kaku. Jika di masa depan pengembang menambahkan kriteria *sorting* baru, maka indeks baru harus dirakit kembali secara manual di konsol Firebase. Hal ini mengurangi skalabilitas *deployment* yang *plug-and-play*.

### Opsi B: *Client-Side Sorting* (Ide yang Diterapkan)
Mengingat beban komputasi harian Klinik Q-Alit berada di bawah 200 dokumen/hari (*Micro-scale data*), diputuskan untuk menghapus mandat pengurutan dari sisi database dan membebankannya ke memori sisi klien (*browser/device* pasien atau admin).

Secara teknis, *Query* ke Firestore disederhanakan murni hanya sebagai *Equality Filter*:
```javascript
// Pengambilan data HANYA difilter berdasarkan hari, tanpa proses sorting di database
const q = query(queuesRef, where("targetDate", "==", todayStr));
```
Setelah gumpalan data raw diterima oleh *Client*, barulah algoritma Javascript bekerja mengurutkannya dalam satuan milidetik:
```javascript
// Data raw diurutkan (sorting) di dalam memori Browser (Client-side)
allDocs.sort((a, b) => (a.data().queueNumber || 0) - (b.data().queueNumber || 0));
```

## 3. Justifikasi (Alasan Mengapa Ini Adalah "Ide Terbaik" untuk Kasus Q-Alit)

Pemilihan *Client-Side Sorting* dijustifikasi melalui 3 pilar optimasi:

1. **Efisiensi Komputasi (*Time Complexity*):** 
   Proses pengurutan (*sorting*) larik berukuran maksimal 100 elemen di dalam Javascript berbasis mesin V8 modern memiliki *Time Complexity* yang sangat kecil, memakan waktu kurang dari `1 milidetik`. Beban ini sangat tidak signifikan bagi perangkat pengguna serendah apa pun (baik *smartphone* murah maupun komputer usang).
   
2. **Fleksibilitas dan Perawatan Bebas Nyeri (*Frictionless Maintenance*):**
   Aplikasi kini terlepas dari keharusan merawat *Database Index*. Sistem ini kini memiliki sifat *plug-and-play*, di mana sistem dapat langsung di-*deploy* ulang oleh pemilik klinik di masa depan dari Github tanpa harus melewati rintangan *setup database backend* yang rumit.

3. **Efisiensi Biaya Baca (Cost Effectiveness):**
   Biaya utama pada infrastruktur *Cloud Firestore* dihitung dari metrik *Document Reads* (jumlah pembacaan dokumen). Metode *Client-Side Sorting* tidak menambah jumlah pembacaan dokumen sama sekali. Aplikasi tetap hanya membaca puluhan dokumen yang relevan untuk hari tersebut, memastikan biaya *server* tetap pada titik terendahnya atau bahkan gratis sepenuhnya di bawah batas *Free Tier*.

---
*Catatan untuk penulis: Paragraf di atas bisa disesuaikan bahasanya menjadi sedikit lebih baku jika akan langsung di-copy-paste ke naskah skripsi.*
