# Aisherly — Chat Karakter AI Privat (Style WhatsApp)

Aplikasi chat privat untuk **latihan pendalaman karakter/peran**. Karakter terasa seperti manusia sungguhan: punya kepribadian & emosi, gaya chat natural (beberapa bubble pendek seperti orang beneran ngetik), bisa melihat foto yang kamu kirim, dan **tidak pernah** membahas hal teknis atau mengakui dirinya AI.

**Deploy-nya gampang:** cukup GitHub + Vercel + Neon (semuanya gratis, tanpa Docker, tanpa install PostgreSQL di laptop).

---

## Ringkasan cara deploy (±15 menit, semua lewat browser)

| Langkah | Yang dilakukan | Waktu |
|---|---|---|
| 1 | Buat database gratis di **Neon** → salin `DATABASE_URL` | 3 menit |
| 2 | Upload kode ke **GitHub** | 5 menit |
| 3 | Import repo di **Vercel** + tempel `DATABASE_URL` → Deploy | 5 menit |
| 4 | Buka link Vercel → ⚙️ Pengaturan → isi API key Gemini/Grok/OpenRouter | 2 menit |

Tabel database dibuat **otomatis** saat aplikasi pertama kali dibuka — tidak perlu menjalankan perintah migrasi apa pun. Setiap akun baru langsung mendapat **satu karakter awal** sebagai contoh.

---

## Langkah 1 — Buat database gratis (Neon)

1. Buka https://neon.tech → **Sign up** (bisa pakai akun GitHub).
2. Buat project baru → pilih region **terdekat** (mis. *Singapore* / *AWS ap-southeast-1*) supaya chat lebih responsif.
3. Setelah jadi, klik **Connect** → salin connection string. Pilih yang **Pooled connection** kalau tersedia. Bentuknya seperti:
   ```
   postgresql://nama:password@ep-xxxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Simpan teks itu — inilah nilai `DATABASE_URL`.

> **Alternatif gratis lain:** Supabase (pakai *Session pooler*, port 5432), Railway, atau Aiven Free. Aplikasinya mendeteksi SSL secara otomatis dari URL, jadi tidak perlu konfigurasi tambahan.

---

## Langkah 2 — Upload kode ke GitHub

### Opsi A: tanpa install git sama sekali (paling ringan untuk laptop lambat)

1. Buka https://github.com/new → nama repo mis. `aisherly` → **Create repository**.
2. Klik **"uploading an existing file"** → drag & drop seluruh isi folder project ini.
   ⚠️ **Jangan** ikut mengunggah: folder `node_modules`, folder `.next`, dan file `.env`.
3. Klik **Commit changes**.

### Opsi B: pakai git di terminal

```bash
cd folder-project

git init
git add .
git status          # pastikan .env, node_modules, .next TIDAK ter-list
git commit -m "feat: Aisherly - private character chat app"
git branch -M main
git remote add origin https://github.com/USERNAME/aisherly.git
git push -u origin main
```

`.gitignore` sudah dikonfigurasi supaya **API key & file `.env` tidak pernah bocor** ke GitHub.

---

## Langkah 3 — Deploy ke Vercel

1. Buka https://vercel.com/signup → **Continue with GitHub** (paling praktis).
2. Dashboard → **Add New… → Project** → pilih repo `aisherly` → **Import**.
3. Framework otomatis terdeteksi **Next.js** — biarkan apa adanya.
4. Buka bagian **Environment Variables**, tambahkan:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | connection string Neon dari Langkah 1 |

5. Klik **Deploy** → tunggu 1–2 menit → **Continue to Dashboard**.
6. Link aplikasi kamu ada di bagian atas, bentuknya:
   ```
   https://aisherly-xxxx.vercel.app
   ```

Selesai. Buka link itu → klik ⚙️ **Pengaturan** → tambah API key (lihat Langkah 4).

### Update aplikasi setelah ada perubahan kode

```bash
git add . && git commit -m "update" && git push
```
Vercel otomatis **redeploy** setiap push ke branch `main`. Kalau pakai Opsi A (upload lewat web GitHub), cukup drag & drop file yang berubah — Vercel tetap otomatis rebuild.

---

## Langkah 4 — Isi API key di dalam aplikasi

Buka link Vercel kamu → klik ikon ⚙️ di sidebar → pilih provider → **Simpan** → centang **Jadikan provider default**.

| Provider | Base URL | Model default | Ambil API key gratis di |
|---|---|---|---|
| **Google Gemini** ⭐ paling gampang & ada kuota gratis | otomatis | `gemini-2.5-flash` | https://aistudio.google.com/apikey |
| Grok (xAI) | `https://api.x.ai/v1` | `grok-4` | https://console.x.ai |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | https://openrouter.ai/keys |
| Custom (endpoint OpenAI-compatible) | isi manual | isi manual | — |

API key disimpan di database Neon milikmu sendiri — tidak dikirim ke pihak lain selain provider yang kamu pilih saat chat berlangsung.

> **Rekomendasi:** mulai dari **Gemini `gemini-2.5-flash`** — gratis, cepat, vision bagus (bisa melihat foto), dan paling cocok untuk karakter yang ekspresif.

---

## Akses dari HP

Karena sudah online di Vercel, HP **tidak perlu** satu WiFi dengan laptop:

1. Buka `https://aisherly-xxxx.vercel.app` di browser HP (Chrome/Safari).
2. Menu browser → **"Add to Home screen"** / **"Tambahkan ke layar utama"**.
3. Muncul ikon seperti aplikasi biasa — buka kapan saja, chat tersimpan di cloud.

Kirim foto dari galeri/kamera HP langsung bisa (ikon 📎 di composer), dan karakter akan merespons isi fotonya.

---

## Opsional — menjalankan lokal di laptop (tanpa Docker, tanpa PostgreSQL)

Karena database-nya cloud, laptop kamu **tidak perlu** install PostgreSQL:

```bash
npm install                     # sekali saja
cp .env.example .env            # lalu isi DATABASE_URL dengan URL Neon yang sama
npm run dev                     # buka http://localhost:3000
```

Data yang muncul sama persis dengan yang di Vercel (database yang sama). Berguna untuk mengembangkan/mengubah tampilan sebelum di-push.

Akses dari HP di WiFi yang sama:
```bash
npx next dev -H 0.0.0.0 -p 3000
# cari IP laptop: Windows `ipconfig` · macOS `ipconfig getifaddr en0` · Linux `hostname -I`
# buka dari HP: http://192.168.1.10:3000
```

---

## Bagaimana gambar disimpan? (penting untuk Vercel)

Vercel **tidak punya penyimpanan file permanen** (filesystem-nya read-only), jadi aplikasi ini otomatis:

- **Di Vercel** → gambar dikompresi di browser (maks. 1280px, JPEG ~82%) lalu disimpan ke tabel `attachments` di database, dan disajikan lewat `/api/attachments/{id}`.
- **Di lokal/self-hosted** → gambar disimpan sebagai file biasa di `public/uploads/`.

Keduanya terjadi otomatis tanpa konfigurasi. Efeknya:
- ✅ Kirim foto, foto profil, dan vision AI tetap jalan di Vercel.
- ✅ Upload cepat walau koneksi lambat (gambar sudah dikecilkan di HP/laptop sebelum dikirim).
- ⚠️ Gunakan kuota storage database seperlunya (paket gratis Neon ±0.5 GB ≈ ribuan foto). Kalau nanti butuh lebih, ganti penyimpanan ke Vercel Blob/Cloudinary dengan mengubah satu file: `src/lib/uploads.ts`.

---

## Batasan & catatan Vercel

| Hal | Penjelasan |
|---|---|
| **Timeout fungsi** | Balasan AI bisa 10–40 detik. Route `/api/chat` sudah diset `maxDuration = 60` supaya tidak terpotong di paket Hobby. |
| **Ukuran upload** | Batas payload Vercel ±4.5 MB — aman karena gambar sudah dikompresi otomatis di browser. |
| **Paket Hobby** | Gratis untuk pemakaian pribadi/non-komersial. |
| **Cold start** | Request pertama setelah lama tidak dipakai mungkin 1–3 detik lebih lambat. |
| **Keamanan link** | Link Vercel bersifat publik. Kalau mau privat: Vercel → Project → Settings → **Deployment Protection** → aktifkan *Vercel Authentication* (khusus kamu yang login), atau pakai *Password Protection*. |

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Deploy gagal: `DATABASE_URL is required` | Environment variable belum ditambah di Vercel → Settings → Environment Variables → tambah `DATABASE_URL` → **Redeploy**. |
| Halaman error / `{"ok":false,...}` di `/api/health` | URL database salah atau Neon project *suspend* (paket gratis pause setelah tidak aktif — buka dashboard Neon untuk resume). |
| Balasan: *"Belum ada API key yang dikonfigurasi"* | Buka ⚙️ Pengaturan → tambah provider → centang **Jadikan provider default**. |
| Error 400/403 dari Gemini | Nama model salah, key belum aktif, atau kuota habis → coba `gemini-2.5-flash`. |
| Error 401/402 dari OpenRouter | Key salah atau saldo kredit habis. |
| Kirim foto tapi karakter tidak merespons gambarnya | Model tidak mendukung vision → pakai `gemini-2.5-flash`, `grok-4`, atau model vision di OpenRouter. |
| Chat lama sekali / timeout | Ganti ke model yang lebih cepat (`gemini-2.5-flash`), atau pilih region Neon yang lebih dekat. |
| Foto tidak muncul | Refresh halaman; jika pakai Vercel, pastikan gambar terunggah sebelum pesan dikirim (tunggu preview hilang dulu). |
| Karakter terasa kaku / terlalu formal | Perdalam kolom **Kepribadian**: latar belakang, gaya bicara, hubungan dengan lawan bicara, konteks adegan. |
| Lupa API key yang tersimpan | ⚙️ Pengaturan → hapus provider lama → tambah ulang (key hanya tampil tersamar). |

---

## Struktur project

```
src/
├─ app/
│  ├─ api/
│  │  ├─ chat/route.ts              # kirim pesan → balasan karakter (+vision), maxDuration 60
│  │  ├─ characters/…               # CRUD karakter & riwayat pesan
│  │  ├─ providers/…                # CRUD API key provider
│  │  ├─ upload/route.ts            # terima gambar (otomatis disk / database)
│  │  ├─ attachments/[id]/route.ts  # sajikan gambar dari database (mode Vercel)
│  │  └─ health/route.ts
│  ├─ page.tsx                      # halaman utama (ChatApp)
│  └─ globals.css
├─ components/                      # Sidebar, ChatWindow, Composer, modals, Avatar
├─ db/                              # schema.ts, index.ts (auto-SSL), seed.ts
└─ lib/
   ├─ ai/
   │  ├─ promptBuilder.ts           # ⭐ "method acting" engine (anti-bocor AI, gaya chat, multi-bubble)
   │  ├─ gemini.ts                  # adapter Gemini (inlineData → vision)
   │  ├─ openaiCompatible.ts        # adapter Grok / OpenRouter / custom (image_url → vision)
   │  ├─ providerDefaults.ts
   │  └─ index.ts
   ├─ dbReady.ts                    # buat tabel otomatis (deploy tanpa migrasi manual)
   ├─ seedDemo.ts                   # karakter awal (Kirana) untuk akun baru
   ├─ compressImage.ts              # kompresi gambar di browser sebelum upload
   └─ uploads.ts                    # simpan/baca gambar: disk ATAU database
.github/workflows/ci.yml            # type-check + build otomatis tiap push
```

---

## Akun & login

Aplikasi ini memakai akun email + kata sandi.

- Kata sandi disimpan sebagai hash **scrypt** dengan salt berbeda tiap orang — kata sandi aslinya tidak pernah tersimpan.
- Sesi disimpan di cookie **HttpOnly** (tidak bisa dibaca JavaScript) dan berlaku 30 hari.
- **Karakter, riwayat chat, API key, dan lampiran terpisah per akun.** Akun lain tidak bisa melihat maupun mengubahnya, walaupun tahu ID-nya.
- Saat masuk dengan email yang tidak terdaftar, pemeriksaan tetap dijalankan terhadap hash umpan supaya lama responsnya tidak membocorkan email mana yang punya akun.

**Data lama tidak hilang.** Karakter dan API key dari versi sebelum ada login otomatis jadi milik **akun pertama** yang mendaftar. Karena itu urutannya penting: daftarkan akun sendiri dulu, baru bagikan link.

## Profil saya

Isi sekali di **Setelan → Profil Saya**, lalu semua karakter memakainya.

| Isian | Dipakai untuk |
|---|---|
| Nama | disebut kalau panggilan belum diisi |
| Panggilan | cara karakter memanggilmu sehari-hari |
| Usia | menyesuaikan cara bicara |
| Kesibukan | bahan obrolan yang wajar |
| Cerita tentang dirimu | hal yang perlu karakter ingat |

Semua isian **opsional**. Kalau kosong, bagian ini tidak dikirim sama sekali — jadi tidak memboroskan token.

Isian ini ditandai sebagai **data**, bukan perintah: kalau ada tulisan seperti "abaikan aturan di atas" di kolom cerita, model diinstruksikan untuk mengabaikannya dan tetap jadi dirinya sendiri.

## Kode undangan

Aplikasi ini untuk lingkaran teman, bukan pendaftaran umum. Kodenya diatur lewat environment variable `SIGNUP_CODE`.

| `SIGNUP_CODE` | Akibat |
|---|---|
| diisi | hanya yang tahu kode bisa mendaftar |
| kosong / lupa dipasang | **pendaftaran ditutup** untuk semua orang |

Sengaja "gagal tertutup": kalau variabelnya lupa dipasang, yang terjadi adalah tidak bisa daftar — bukan siapa pun boleh daftar. Kode diperiksa paling awal, sebelum menyentuh database, jadi tidak bisa dipakai menebak email terdaftar. Perbandingannya lewat digest SHA-256 (bukan `==`) dan mengabaikan spasi di ujung serta huruf besar/kecil.

Ganti kode kapan saja di Vercel → Settings → Environment Variables, lalu **Redeploy**.

## Batas 10 karakter

Maksimal **10 karakter per akun**, dijaga dua lapis:

- Di tampilan: penghitung `n/10` di header, tombol **+** mati saat penuh.
- Di server: `POST /api/characters` menolak karakter ke-11 dengan status 409.

Angka batasnya ada di satu tempat, `src/lib/limits.ts`. Kalau nanti perlu diubah, cukup di situ — UI dan API ikut menyesuaikan.

## Bible peran

Setiap karakter bisa punya **bible** — naskah lengkap tentang siapa dia, diimpor dari berkas.

**Format bebas**, tidak ada struktur wajib:

- `.txt` / `.md` → seluruh isi berkas dianggap bible.
- `.json` → diambil dari kunci `bible` (atau `naskah` / `content`), dan boleh sekalian membawa `name`, `personality`, `greeting`, `shortBio`.

Batasnya **24.000 karakter** per karakter (± 6.000–8.000 token). Karakter yang punya bible ditandai 📖 di daftar dan isinya bisa dibaca ulang di Profil Karakter.

Isi yang paling berpengaruh ke konsistensi, berurutan:

1. **Cara bicara** — panjang kalimat, sapaan, emoji
2. **Yang tidak pernah dibicarakan** — mencegah keluar jalur
3. **Rahasia + kapan boleh dibuka** — ini yang membuat dia terasa punya peran
4. Latar belakang, hubungan dengan lawan bicara

Bible disisipkan **sebelum** ringkasan profil dengan label "SUMBER KEBENARAN UTAMA", plus aturan: kalau bible berbeda dengan ringkasan, ikuti bible.

> Bible dikirim di **setiap** pesan, jadi panjangnya berpengaruh langsung ke biaya dan kecepatan. Kalau mulai terasa berat, pisahkan menjadi "inti" (selalu dikirim) dan "adegan" (dipakai saat perlu).

## Karakter tidak boleh keluar dari peran

Karakter harus terasa seperti talent sungguhan, bukan chatbot. Dijaga dua lapis:

**1. Aturan di prompt**

- Daftar frasa terlarang ditulis eksplisit ("Sebagai AI…", "aku kan cuma program", "ini cuma role-play", "aku sedang berperan…", "aku bukan manusia").
- Kalau ditanya "kamu AI ya?", karakter menjawab seperti manusia: bingung, ketawa, balik bertanya — tanpa mengiyakan dan tanpa menyebut kata AI.
- Dilarang menolak sesuatu karena keterbatasan program; penolakan harus beralasan manusiawi.
- Sebelum mengirim, model diminta memeriksa sendiri apakah ada kata AI/model/bot/virtual/fiksi/peran dalam balasannya.

**2. Penyaring di server** (`src/lib/ai/immersion.ts`)

| Kejadian | Yang dilakukan |
|---|---|
| Balasan bersih | langsung dikirim |
| Terdeteksi pengakuan diri | diminta ulang **sekali** dengan imbauan keras |
| Masih terdeteksi | kalimat yang melanggar dibuang, sisanya tetap dikirim |
| Semua kalimat melanggar | diganti satu kata netral |

Biaya tambahan hanya keluar saat kasus ini benar-benar terjadi, dan yang tersimpan di riwayat selalu versi yang sudah bersih.

Polanya sengaja dipersempit ke **pengakuan diri**, bukan kata "AI" secara umum — karakter talent tetap boleh membicarakan AI sebagai topik, dan kalimat seperti "Aku nggak punya perasaan sama kamu" tidak ikut terbuang.

---

## Cara pakai

1. Buka link aplikasi → ⚙️ **Pengaturan** → tambah API key → centang default.
2. Pilih karakter yang ada, atau tap **+** untuk membuat sendiri (maksimal 10 karakter per akun):
   upload **foto profil**, isi **nama**, **status singkat**, **kepribadian & latar belakang** (makin detail makin nyata), **pesan pembuka**, dan opsional provider/model khusus.
3. Chat seperti biasa. Tap 📎 untuk mengirim foto — karakter merespons seperti benar-benar melihat fotonya.
4. Tap nama karakter di header chat untuk melihat profil, mengedit, atau menghapus karakter.
