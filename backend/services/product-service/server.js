// Microservice: Product Service (Mengelola data produk)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const logger = require('./logger');
const errorHandler = require('./errorHandler');

const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3001;
const MONGO_URI = process.env.MONGO_URI || "mongodb://mongodb:27017/posdb";
const DATA_FILE = process.env.PRODUCT_DATA_FILE || '/data/products.json';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(logger);

let db;

// Koneksi ke MongoDB (dengan fallback ke in-memory jika tidak tersedia)
const inMemoryProducts = []; // start empty for demo-free UI

async function loadInMemoryProductsFromFile() {
    try {
        const raw = await fs.promises.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
            inMemoryProducts.push(...parsed);
            console.log(`Loaded ${parsed.length} products from ${DATA_FILE}`);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.warn('Failed to load products file:', err.message);
    }
}


async function connectToMongo() {
    try {
        const client = await MongoClient.connect(MONGO_URI);
        db = client.db('posdb');
        console.log("Connected to MongoDB successfully");
        // Optional migration: if DB is empty but we have persisted file data, import it once
        await importProductsFromFileToMongo();
    } catch (err) {
        console.warn("Failed to connect to MongoDB, switching to in-memory products:", err.message);
        db = null; // gunakan fallback in-memory
    }
}

async function importProductsFromFileToMongo() {
    try {
        if (!db) return;
        const count = await db.collection('products').countDocuments();
        if (count > 0) return; // DB sudah punya data, tidak perlu import

        // Baca file persistence jika ada
        const raw = await fs.promises.readFile(DATA_FILE, 'utf8').catch((e) => {
            if (e && e.code !== 'ENOENT') console.warn('Failed reading persisted products file:', e.message);
            return null;
        });
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return;

        // Normalisasi field sebelum insert (pastikan tipe data yang sesuai)
        const docs = parsed.map(p => ({
            name: p.name,
            price: Number(p.price),
            stock: Number(p.stock),
            sku: p.sku || ('SKU-' + Date.now().toString()),
            lastUpdated: p.lastUpdated ? new Date(p.lastUpdated) : new Date(),
        }));
        await db.collection('products').insertMany(docs);
        console.log(`Imported ${docs.length} products from ${DATA_FILE} into MongoDB (one-time migration).`);
    } catch (err) {
        console.warn('Product data import to Mongo failed:', err && err.message ? err.message : err);
    }
}

// Endpoint GET semua produk
app.get('/products', async (req, res) => {
    try {
        if (db) {
            const products = await db.collection('products').find({}).toArray();
            return res.json(products);
        }
        // fallback
        res.json(inMemoryProducts);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint POST untuk Tambah Produk
app.post('/products', async (req, res) => {
    try {
        const { name, price, stock } = req.body;
        if (!name || !price || stock === undefined) {
            return res.status(400).send('Missing required fields: name, price, stock');
        }

        const newProduct = {
            name,
            price: parseFloat(price),
            stock: parseInt(stock),
            sku: 'SKU-' + Date.now().toString(), // readable SKU
            lastUpdated: new Date()
        };

        if (db) {
            const result = await db.collection('products').insertOne(newProduct);
            return res.status(201).json({ message: 'Product added successfully', productId: result.insertedId });
        }

        // fallback: add to in-memory array and persist to file
        const id = `prod-${Date.now()}`;
        inMemoryProducts.push({ ...newProduct, _id: id });
        try {
            await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
            await fs.promises.writeFile(DATA_FILE, JSON.stringify(inMemoryProducts, null, 2), 'utf8');
            console.log(`Persisted ${inMemoryProducts.length} products to ${DATA_FILE}`);
        } catch (err) {
            console.warn('Failed to persist products to file:', err.message);
        }
        res.status(201).json({ message: 'Product added to in-memory store', productId: id });

    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).send('Internal Server Error');
    }
});

    // Endpoint PUT untuk update produk berdasarkan SKU
    app.put('/products/:sku', async (req, res) => {
        try {
            const sku = req.params.sku;
            const { name, price, stock } = req.body;
            if (!name && price === undefined && stock === undefined) {
                return res.status(400).json({ error: 'No fields to update' });
            }

            const updateFields = {};
            if (name) updateFields.name = name;
            if (price !== undefined) updateFields.price = Number(price);
            if (stock !== undefined) updateFields.stock = Number(stock);
            updateFields.lastUpdated = new Date();

            if (db) {
                const result = await db.collection('products').updateOne({ sku }, { $set: updateFields });
                if (result.matchedCount === 0) return res.status(404).json({ error: 'Product not found' });
                return res.json({ message: 'Product updated', sku });
            }

            // fallback in-memory
            const prod = inMemoryProducts.find(p => p.sku === sku || p._id === sku);
            if (!prod) return res.status(404).json({ error: 'Product not found' });
            Object.assign(prod, updateFields);
            // persist
            try {
                await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
                await fs.promises.writeFile(DATA_FILE, JSON.stringify(inMemoryProducts, null, 2), 'utf8');
            } catch (err) {
                console.warn('Failed to persist updated products:', err.message);
            }
            return res.json({ message: 'Product updated', sku });
        } catch (err) {
            console.error('Error updating product:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // Endpoint DELETE untuk menghapus produk berdasarkan SKU
    app.delete('/products/:sku', async (req, res) => {
        try {
            const sku = req.params.sku;
            if (db) {
                const result = await db.collection('products').deleteOne({ sku });
                if (result.deletedCount === 0) return res.status(404).json({ error: 'Product not found' });
                return res.json({ message: 'Product deleted', sku });
            }

            const idx = inMemoryProducts.findIndex(p => p.sku === sku || p._id === sku);
            if (idx === -1) return res.status(404).json({ error: 'Product not found' });
            inMemoryProducts.splice(idx, 1);
            try {
                await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
                await fs.promises.writeFile(DATA_FILE, JSON.stringify(inMemoryProducts, null, 2), 'utf8');
            } catch (err) {
                console.warn('Failed to persist products after delete:', err.message);
            }
            return res.json({ message: 'Product deleted', sku });
        } catch (err) {
            console.error('Error deleting product:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

// Endpoint POST untuk Auto Restock produk dengan stok rendah
app.post('/products/restock', async (req, res) => {
    try {
        const RESTOCK_AMOUNT = 50; // Jumlah stok yang ditambahkan
        const LOW_STOCK_THRESHOLD = 10; // Threshold stok rendah
        
        let updatedCount = 0;
        let restockedProducts = [];

        if (db) {
            // MongoDB: Find low stock products dan update
            const lowStockProducts = await db.collection('products').find({ stock: { $lt: LOW_STOCK_THRESHOLD } }).toArray();
            
            for (const product of lowStockProducts) {
                const newStock = product.stock + RESTOCK_AMOUNT;
                await db.collection('products').updateOne(
                    { _id: product._id },
                    { $set: { stock: newStock, lastUpdated: new Date() } }
                );
                updatedCount++;
                restockedProducts.push({
                    name: product.name,
                    sku: product.sku,
                    oldStock: product.stock,
                    newStock: newStock
                });
            }

            return res.json({ 
                message: `Berhasil menambah stok ${updatedCount} produk`,
                updatedCount,
                products: restockedProducts
            });
        }

        // Fallback: in-memory
        for (const product of inMemoryProducts) {
            if (product.stock < LOW_STOCK_THRESHOLD) {
                const oldStock = product.stock;
                product.stock += RESTOCK_AMOUNT;
                product.lastUpdated = new Date();
                updatedCount++;
                restockedProducts.push({
                    name: product.name,
                    sku: product.sku,
                    oldStock: oldStock,
                    newStock: product.stock
                });
            }
        }

        // Persist to file
        try {
            await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
            await fs.promises.writeFile(DATA_FILE, JSON.stringify(inMemoryProducts, null, 2), 'utf8');
        } catch (err) {
            console.warn('Failed to persist restocked products:', err.message);
        }

        res.json({ 
            message: `Berhasil menambah stok ${updatedCount} produk`,
            updatedCount,
            products: restockedProducts
        });

    } catch (error) {
        console.error('Error restocking products:', error);
        res.status(500).json({ error: 'Internal Server Error during restock' });
    }
});

// Fallback error handler
app.use(errorHandler);

// Jalankan server setelah koneksi database
connectToMongo().then(async () => {
    // If DB not available, try to load persisted products from file
    if (!db) {
        await loadInMemoryProductsFromFile();
    }
    app.listen(PORT, () => {
        console.log(`Product Service running on port ${PORT}`);
    });
});