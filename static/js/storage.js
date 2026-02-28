/**
 * CropDoc AI — Local Storage Module (IndexedDB)
 * Saves scan reports offline. Syncs when online.
 */

const CropDocStorage = (() => {
    const DB_NAME = 'CropDocDB';
    const DB_VERSION = 1;
    const STORE_REPORTS = 'reports';
    let db = null;
    let dbAvailable = true;
    let fallbackMemory = []; // In-memory fallback when IndexedDB unavailable

    /**
     * Open/create the IndexedDB database.
     */
    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }
            if (!dbAvailable) { 
                reject(new Error('IndexedDB unavailable - using memory fallback'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                if (!database.objectStoreNames.contains(STORE_REPORTS)) {
                    const store = database.createObjectStore(STORE_REPORTS, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('disease', 'disease', { unique: false });
                    store.createIndex('crop', 'crop', { unique: false });
                    store.createIndex('synced', 'synced', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('✅ IndexedDB opened:', DB_NAME);
                resolve(db);
            };

            request.onerror = (event) => {
                console.warn('⚠️ IndexedDB error (using memory fallback):', event.target.error);
                dbAvailable = false;
                reject(event.target.error);
            };

            request.onblocked = () => {
                console.warn('⚠️ IndexedDB blocked - upgrade needed');
            };
        });
    }

    /**
     * Save a scan report to IndexedDB.
     * @param {Object} report - The prediction result + image data.
     * @returns {number} The new report ID.
     */
    async function saveReport(report) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_REPORTS, 'readwrite');
            const store = tx.objectStore(STORE_REPORTS);

            const entry = {
                timestamp: new Date().toISOString(),
                disease: report.prediction.disease,
                crop: report.prediction.crop,
                className: report.prediction.class_name,
                confidence: report.prediction.confidence,
                confidencePercent: report.prediction.confidence_percent,
                severity: report.prediction.severity,
                isHealthy: report.prediction.is_healthy,
                riskLevel: report.prediction.risk_level,
                scientificName: report.prediction.scientific_name,
                symptoms: report.prediction.symptoms,
                treatment: report.prediction.treatment,
                prevention: report.prediction.prevention,
                fertilizer: report.prediction.fertilizer,
                topPredictions: report.top_predictions || [],
                mode: report.mode || 'unknown',
                imageData: report.imageData || null, // base64 thumbnail
                synced: navigator.onLine ? true : false
            };

            const req = store.add(entry);
            req.onsuccess = () => {
                console.log('💾 Report saved, ID:', req.result);
                resolve(req.result);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Get all reports, newest first.
     * @param {number} limit - Max reports to return.
     */
    async function getReports(limit = 50) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_REPORTS, 'readonly');
            const store = tx.objectStore(STORE_REPORTS);
            const index = store.index('timestamp');
            const reports = [];

            const request = index.openCursor(null, 'prev'); // newest first

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && reports.length < limit) {
                    reports.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(reports);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single report by ID.
     */
    async function getReport(id) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_REPORTS, 'readonly');
            const store = tx.objectStore(STORE_REPORTS);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Delete a report by ID.
     */
    async function deleteReport(id) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_REPORTS, 'readwrite');
            const store = tx.objectStore(STORE_REPORTS);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Get count of all reports.
     */
    async function getCount() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_REPORTS, 'readonly');
            const store = tx.objectStore(STORE_REPORTS);
            const req = store.count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Get unsynced reports for online backup.
     */
    async function getUnsyncedReports() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_REPORTS, 'readonly');
            const store = tx.objectStore(STORE_REPORTS);
            const index = store.index('synced');
            const req = index.getAll(false);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Mark reports as synced.
     */
    async function markSynced(ids) {
        const database = await openDB();
        const tx = database.transaction(STORE_REPORTS, 'readwrite');
        const store = tx.objectStore(STORE_REPORTS);

        for (const id of ids) {
            const req = store.get(id);
            req.onsuccess = () => {
                const report = req.result;
                if (report) {
                    report.synced = true;
                    store.put(report);
                }
            };
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Clear all reports.
     */
    async function clearAll() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_REPORTS, 'readwrite');
            const store = tx.objectStore(STORE_REPORTS);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Generate a base64 thumbnail from a File object.
     */
    function generateThumbnail(file, size = 80) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    const scale = Math.max(size / img.width, size / img.height);
                    const w = img.width * scale;
                    const h = img.height * scale;
                    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
                img.onerror = () => resolve(null);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    }

    // Initialize DB on load
    openDB().catch(() => { });

    return {
        saveReport,
        getReports,
        getReport,
        deleteReport,
        getCount,
        getUnsyncedReports,
        markSynced,
        clearAll,
        generateThumbnail
    };
})();
