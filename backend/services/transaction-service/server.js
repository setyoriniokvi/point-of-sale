// Microservice: Transaction Service (Mengelola transaksi dan perhitungan)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch'); // Perlu instalasi 'node-fetch'
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const errorHandler = require('./errorHandler');

const app = express();
const PORT = config.PORTS.TRANSACTION || 3002;
const MONGO_URI = process.env.MONGO_URI || "mongodb://mongodb:27017/posdb";
const DATA_FILE = process.env.TRANSACTION_DATA_FILE || '/data/transactions.json';

let db;

// Penyimpanan transaksi sederhana (in-memory fallback)
const transactions = [];

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(logger);

async function connectToMongo() {
    try {
        const client = await MongoClient.connect(MONGO_URI);
        db = client.db('posdb');
        console.log("Transaction Service connected to MongoDB");
        await importTransactionsFromFileToMongo();
    } catch (err) {
        console.warn("Transaction Service failed to connect to MongoDB, using in-memory:", err.message);
        db = null;
        await loadInMemoryTransactionsFromFile();
    }
}

async function importTransactionsFromFileToMongo() {
    try {
        if (!db) return;
        const count = await db.collection('transactions').countDocuments();
        if (count > 0) return;

        const raw = await fs.promises.readFile(DATA_FILE, 'utf8').catch((e) => {
            if (e && e.code !== 'ENOENT') console.warn('Failed reading transaction file:', e.message);
            return null;
        });
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return;

        const docs = parsed.map(t => ({
            id: t.id || `tx-${Date.now()}`,
            items: t.items || [],
            totalAmount: Number(t.totalAmount),
            createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        }));
        await db.collection('transactions').insertMany(docs);
        console.log(`Imported ${docs.length} transactions from ${DATA_FILE} into MongoDB.`);
    } catch (err) {
        console.warn('Transaction import to Mongo failed:', err && err.message ? err.message : err);
    }
}

async function loadInMemoryTransactionsFromFile() {
    try {
        const raw = await fs.promises.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
            transactions.push(...parsed);
            console.log(`Loaded ${parsed.length} transactions from ${DATA_FILE}`);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.warn('Failed to load transaction file:', err.message);
    }
}

// Endpoint untuk menghitung total pembelian (Fitur Hitung Total)
app.post('/calculate-total', async (req, res) => {
    const { items } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }

    let total = 0;
    const itemsWithDetails = [];

    try {
        // Ambil data produk dari Product Service
        const productResponse = await fetch(`${config.PRODUCT_SERVICE_URL}/products`);
        if (!productResponse.ok) {
            throw new Error('Failed to fetch products from service');
        }
        const products = await productResponse.json();
        const productMap = new Map(products.map(p => [p._id.toString(), p]));

        // Hitung total
        for (const item of items) {
            // Cari ID-nya.
            const product = products.find(p => p.sku === item.sku);

            if (!product) {
                return res.status(404).json({ error: `Product with SKU ${item.sku} not found` });
            }

            if (item.quantity > product.stock) {
                return res.status(400).json({ error: `Not enough stock for ${product.name}` });
            }

            const subtotal = product.price * item.quantity;
            total += subtotal;
            itemsWithDetails.push({ 
                name: product.name, 
                price: product.price, 
                quantity: item.quantity, 
                subtotal 
            });
        }

        res.json({
            items: itemsWithDetails,
            total: parseFloat(total.toFixed(2)) // Pembulatan 2 desimal
        });

        // Simpan transaksi ringkas untuk dashboard
        const transaction = {
            id: `tx-${Date.now()}`,
            items: items.map(i => ({ sku: i.sku, quantity: i.quantity })),
            totalAmount: parseFloat(total.toFixed(2)),
            createdAt: new Date().toISOString(),
        };

        if (db) {
            await db.collection('transactions').insertOne(transaction);
        } else {
            transactions.push(transaction);
            await fs.promises.writeFile(DATA_FILE, JSON.stringify(transactions, null, 2), 'utf8');
        }

    } catch (error) {
        console.error('Error calculating total:', error);
        res.status(500).json({ error: 'Internal Server Error during calculation' });
    }
});

// Endpoint untuk mengambil daftar transaksi (untuk Dashboard Service)
app.get('/api/transactions', async (req, res) => {
    try {
        if (db) {
            const txs = await db.collection('transactions').find().toArray();
            res.json(txs);
        } else {
            res.json(transactions);
        }
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Fallback error handler
app.use(errorHandler);

connectToMongo();

app.listen(PORT, () => {
    console.log(`Transaction Service running on port ${PORT}`);
});