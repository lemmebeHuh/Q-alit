# Q-Alit - Sistem Antrean Klinik Cerdas

Q-Alit adalah aplikasi sistem antrean klinik modern yang dibangun menggunakan React, Vite, Tailwind CSS, dan Firebase. Aplikasi ini dirancang untuk memudahkan manajemen antrean pasien di klinik, memberikan estimasi waktu pelayanan yang akurat, serta memberikan pengalaman pengguna yang responsif.

## Fitur Utama
- **Registrasi Pasien Cepat:** Pasien bisa didaftarkan secara manual (walk-in) maupun secara online.
- **Live Patient Dashboard:** Pasien bisa memantau nomor antrean mereka secara real-time, melihat posisi antrean, serta estimasi waktu.
- **TV Display Dashboard:** Tampilan khusus untuk layar TV di ruang tunggu klinik dengan visual yang besar, menarik, dan real-time.
- **Admin Dashboard:** Manajemen antrean terpusat bagi admin/resepsionis klinik, lengkap dengan fitur Laporan Analitik (Analytics Report) dan export ke Excel.
- **Algoritma SES (Single Exponential Smoothing):** Mengkalkulasi dan memprediksi estimasi waktu tunggu secara dinamis berdasarkan data historis durasi layanan.

## Teknologi yang Digunakan
- **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide React (Icons), Recharts (Charts)
- **Backend/Database:** Firebase Firestore (Real-time DB)
- **Export/Laporan:** SheetJS (XLSX)

## Cara Menjalankan Project (Local Development)

1. Pastikan Anda sudah menginstall Node.js di sistem Anda.
2. Clone repository ini:
   ```bash
   git clone https://github.com/lemmebeHuh/Q-alit.git
   cd Q-alit
   ```
3. Install semua dependencies:
   ```bash
   npm install
   ```
4. Buat file `.env` di root folder dan masukkan konfigurasi Firebase Anda (jika menggunakan custom config).
5. Jalankan development server:
   ```bash
   npm run dev
   ```
6. Buka URL yang tertera (biasanya `http://localhost:5173`) di browser.

## Lisensi
[MIT License](LICENSE)
