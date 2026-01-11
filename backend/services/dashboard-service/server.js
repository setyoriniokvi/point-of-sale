const express = require('express');
const axios = require('axios');
const config = require('./config'); // Import URL layanan lain
const logger = require('./logger');
const errorHandler = require('./errorHandler');

const app = express();
const PORT = config.PORTS.DASHBOARD || 3004;
const { TRANSACTION_SERVICE_URL } = config;

// Middleware
app.use(express.json());
app.use(logger);

console.log(`URL Transaction Service: ${TRANSACTION_SERVICE_URL}`);

// ----------------------------------------------------------------
// Endpoint /api/dashboard/summary: Mengambil dan Menghitung Ringkasan Data
// ----------------------------------------------------------------
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        // 1. Mengambil semua data transaksi dari Transaction Service
        const transactionResponse = await axios.get(`${TRANSACTION_SERVICE_URL}/api/transactions`);
        const transactions = transactionResponse.data;

        // 2. Melakukan perhitungan analitik

        const totalRevenue = transactions.reduce((sum, t) => sum + t.totalAmount, 0);
        const totalTransactions = transactions.length;

        // Menghitung produk terlaris
        const productSales = {};
        transactions.forEach(t => {
            t.items.forEach(item => {
                const sku = item.sku;
                const quantity = item.quantity;
                productSales[sku] = (productSales[sku] || 0) + quantity;
            });
        });

        // Konversi menjadi array untuk sorting
        const bestSellers = Object.keys(productSales).map(sku => ({
            sku,
            quantitySold: productSales[sku]
        })).sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 5); // 5 produk terlaris

        // --- Perhitungan Grafik Mingguan (7 Hari Terakhir) ---
        const last7Days = [];
        const chartData = [];
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

        // Generate 7 hari terakhir (dari hari ini ke belakang, lalu di-reverse agar urut waktu)
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            last7Days.push(d);
        }

        const dailyRevenueMap = {};

        // Init map dengan 0
        last7Days.forEach(date => {
            const key = date.toISOString().split('T')[0];
            dailyRevenueMap[key] = 0;
        });

        // Isi dengan data transaksi
        transactions.forEach(t => {
            const tDate = new Date(t.createdAt);
            const key = tDate.toISOString().split('T')[0];
            if (dailyRevenueMap.hasOwnProperty(key)) {
                dailyRevenueMap[key] += t.totalAmount;
            }
        });

        const chartLabels = last7Days.map(d => days[d.getDay()]);
        const chartValues = last7Days.map(d => dailyRevenueMap[d.toISOString().split('T')[0]]);

        const weeklyChart = {
            labels: chartLabels,
            data: chartValues
        };


        // 3. Kirim hasil ringkasan
        res.json({
            status: 'ok',
            totalRevenue,
            totalTransactions,
            bestSellers,
            weeklyChart,
            lastChecked: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error mengambil data dashboard:', error.message);
        if (error.response) {
            return res.status(error.response.status).json({ message: 'Gagal mengambil data dari Transaction Service.' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server internal saat memproses dashboard.' });
    }
});

// Fallback error handler
app.use(errorHandler);

// Jalankan Server
app.listen(PORT, () => {
    console.log(`Dashboard Service berjalan di port ${PORT}`);
});