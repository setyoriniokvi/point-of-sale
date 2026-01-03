# Setup & Run

## Prasyarat
- Docker + docker-compose
- Node 18+ (opsional, hanya jika ingin jalan gateway di host; frontend sudah statis, tidak pakai React build)

## Jalankan semua service (sederhana: frontend + backend)
- `docker-compose up --build`
- Frontend (nginx, serve `frontend/public`): http://localhost:3000 — **Note:** Frontend proxies API calls to the backend gateway so *all interactions* happen under the same origin (host:3000).
- Backend (all-in-one: API Gateway + microservices): proxied via frontend to `http://localhost:3000/*` (gateway still listens internally on port 3000 inside `backend` container)
  - Catatan: microservices run inside the `backend` container and are reachable through the gateway; no extra ports are required on the host.
- Untuk debugging lokal, Anda masih dapat menjalankan service secara terpisah (mis. `node backend/server.js`) jika perlu.

## Jalankan frontend tanpa Docker
- `npx http-server frontend/public -p 3000` (atau server statis lain)
- Halaman tambahan (`productmanagement.html`, `dashboard.html`, `cart.html`) telah diarsipkan; gunakan `index.html` sebagai antarmuka tunggal (http://localhost:3000).

## API Gateway (opsional)
- `node backend/server.js` (port default 3000) meneruskan `/products`, `/calculate-total`, `/recommendation/restock` ke microservices.

## Lingkungan
- Env penting: `MONGO_URI`, `JWT_SECRET` (untuk auth-service), override URL service bila perlu.
- Konfigurasi terpusat: `backend/config/config.js`.

## Kubernetes (contoh manifest)
- Manifest `kubernetes/` telah diarsipkan (lihat `archive/kubernetes/`) — jika ingin deploy ke K8s nanti, gunakan atau adaptasikan manifest yang diarsipkan.
- Untuk menyimpan produk yang Anda tambahkan di UI agar bertahan antar restart, saya menambahkan file-based persistence pada Product Service (menyimpan ke `/data/products.json`) dan sebuah volume Docker (`backend_data`) sudah didefinisikan di `docker-compose.yml`.
- Build dan push image jika Anda ingin menjalankan setiap service sebagai container terpisah, atau gunakan arsitektur all-in-one untuk demo lokal.

