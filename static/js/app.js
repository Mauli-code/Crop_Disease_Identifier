/**
 * CropDoc AI — Main Application Controller
 * Manages UI, hybrid mode switching, camera, storage, history, and result rendering.
 */

(function () {
    'use strict';

    // ────────────────────────────────
    // DOM Elements
    // ────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const statusDot = $('.status-dot');
    const statusText = $('#statusText');
    const statusMode = $('#statusMode');
    const uploadZone = $('#uploadZone');
    const fileInput = $('#fileInput');
    const uploadBtn = $('#uploadBtn');
    const cameraBtn = $('#cameraBtn');
    const uploadSection = $('#uploadSection');
    const previewSection = $('#previewSection');
    const previewImage = $('#previewImage');
    const analyzeBtn = $('#analyzeBtn');
    const clearBtn = $('#clearBtn');
    const loadingSection = $('#loadingSection');
    const loadingText = $('#loadingText');
    const modeLabel = $('#modeLabel');
    const resultsSection = $('#resultsSection');
    const newAnalysisBtn = $('#newAnalysisBtn');
    const shareBtn = $('#shareBtn');
    const saveToast = $('#saveToast');
    const scanCountStat = $('#scanCountStat');

    // Camera
    const cameraModal = $('#cameraModal');
    const cameraVideo = $('#cameraVideo');
    const cameraCanvas = $('#cameraCanvas');
    const captureBtn = $('#captureBtn');
    const closeCameraModal = $('#closeCameraModal');

    // Navigation
    const navScan = $('#navScan');
    const navHistory = $('#navHistory');
    const scanPage = $('#scanPage');
    const historyPage = $('#historyPage');
    const historyBadge = $('#historyBadge');
    const goToScanBtn = $('#goToScanBtn');

    // History
    const historyEmpty = $('#historyEmpty');
    const historyList = $('#historyList');
    const clearHistoryBtn = $('#clearHistoryBtn');

    // History Detail Modal
    const historyDetailModal = $('#historyDetailModal');
    const detailTitle = $('#detailTitle');
    const detailBody = $('#detailBody');
    const closeDetailModal = $('#closeDetailModal');

    // Result elements
    const resultEmoji = $('#resultEmoji');
    const resultDisease = $('#resultDisease');
    const resultCrop = $('#resultCrop');
    const resultHeader = $('#resultHeader');
    const resultBadge = $('#resultBadge');
    const resultRiskLevel = $('#resultRiskLevel');
    const resultConfidence = $('#resultConfidence');
    const confidenceBar = $('#confidenceBar');
    const resultSeverity = $('#resultSeverity');
    const severityDots = $('#severityDots');
    const resultScientific = $('#resultScientific');
    const scientificCard = $('#scientificCard');
    const resultSymptoms = $('#resultSymptoms');
    const treatmentOrganic = $('#treatmentOrganic');
    const treatmentChemical = $('#treatmentChemical');
    const tabOrganic = $('#tabOrganic');
    const tabChemical = $('#tabChemical');
    const resultPrevention = $('#resultPrevention');
    const resultFertilizer = $('#resultFertilizer');
    const topPredictions = $('#topPredictions');

    // ────────────────────────────────
    // State
    // ────────────────────────────────
    let currentFile = null;
    let currentResult = null;
    let cameraStream = null;
    let isOnline = navigator.onLine;

    // ────────────────────────────────
    // Connection Status
    // ────────────────────────────────
    function updateConnectionStatus() {
        isOnline = navigator.onLine;
        if (isOnline) {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Online — Using server AI';
            statusMode.textContent = 'ONLINE MODE';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Offline — Using on-device AI';
            statusMode.textContent = 'OFFLINE MODE';
        }
    }

    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    updateConnectionStatus();

    // ────────────────────────────────
    // Navigation Tabs
    // ────────────────────────────────
    function switchTab(tabName) {
        navScan.classList.toggle('active', tabName === 'scan');
        navHistory.classList.toggle('active', tabName === 'history');
        scanPage.classList.toggle('active', tabName === 'scan');
        historyPage.classList.toggle('active', tabName === 'history');

        if (tabName === 'history') {
            loadHistory();
        }
    }

    navScan.addEventListener('click', () => switchTab('scan'));
    navHistory.addEventListener('click', () => switchTab('history'));
    if (goToScanBtn) goToScanBtn.addEventListener('click', () => switchTab('scan'));

    // ────────────────────────────────
    // Update Scan Count
    // ────────────────────────────────
    async function updateScanCount() {
        try {
            const count = await CropDocStorage.getCount();
            scanCountStat.textContent = count;
            if (count > 0) {
                historyBadge.textContent = count;
                historyBadge.classList.remove('hidden');
            } else {
                historyBadge.classList.add('hidden');
            }
        } catch (e) {
            // Silently handle
        }
    }

    updateScanCount();

    // ────────────────────────────────
    // File Upload Handling
    // ────────────────────────────────
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadBtn.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('File is too large. Maximum size is 5MB.');
            return;
        }

        currentFile = file;
        previewImage.src = CropDocPreprocess.getPreviewURL(file);
        showSection('preview');
    }

    // ────────────────────────────────
    // Camera
    // ────────────────────────────────
    cameraBtn.addEventListener('click', async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
            });
            cameraVideo.srcObject = cameraStream;
            cameraModal.classList.remove('hidden');
        } catch (err) {
            alert('Camera access denied or not available. Please use file upload instead.');
        }
    });

    captureBtn.addEventListener('click', () => {
        const canvas = cameraCanvas;
        const size = Math.min(cameraVideo.videoWidth, cameraVideo.videoHeight);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const sx = (cameraVideo.videoWidth - size) / 2;
        const sy = (cameraVideo.videoHeight - size) / 2;
        ctx.drawImage(cameraVideo, sx, sy, size, size, 0, 0, size, size);

        canvas.toBlob((blob) => {
            const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
            handleFile(file);
            closeCameraFn();
        }, 'image/jpeg', 0.9);
    });

    function closeCameraFn() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }
        cameraModal.classList.add('hidden');
    }

    closeCameraModal.addEventListener('click', closeCameraFn);

    // ────────────────────────────────
    // Section Navigation
    // ────────────────────────────────
    function showSection(name) {
        uploadSection.classList.toggle('hidden', name !== 'upload');
        previewSection.classList.toggle('hidden', name !== 'preview');
        loadingSection.classList.toggle('hidden', name !== 'loading');
        resultsSection.classList.toggle('hidden', name !== 'results');
    }

    clearBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        showSection('upload');
    });

    newAnalysisBtn.addEventListener('click', () => {
        currentFile = null;
        currentResult = null;
        fileInput.value = '';
        showSection('upload');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ────────────────────────────────
    // Analysis (Hybrid Logic)
    // ────────────────────────────────
    analyzeBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        showSection('loading');

        try {
            let result;

            if (navigator.onLine) {
                loadingText.textContent = 'Analyzing with server AI...';
                modeLabel.textContent = 'on server';

                try {
                    result = await CropDocOnline.predict(currentFile);
                } catch (onlineErr) {
                    console.warn('Online prediction failed, falling back to offline:', onlineErr.message);
                    loadingText.textContent = 'Server unavailable. Using on-device AI...';
                    modeLabel.textContent = 'locally (fallback)';

                    try {
                        result = await CropDocOffline.predict(currentFile);
                    } catch (offlineErr) {
                        throw new Error('Both online and offline modes failed. ' + offlineErr.message);
                    }
                }
            } else {
                loadingText.textContent = 'Analyzing with on-device AI...';
                modeLabel.textContent = 'locally';
                result = await CropDocOffline.predict(currentFile);
            }

            currentResult = result;
            renderResults(result);
            showSection('results');

            // Save to IndexedDB
            try {
                const thumbnail = await CropDocStorage.generateThumbnail(currentFile);
                result.imageData = thumbnail;
                await CropDocStorage.saveReport(result);
                updateScanCount();

                // Show save toast
                saveToast.classList.remove('hidden');
                setTimeout(() => saveToast.classList.add('hidden'), 3000);
            } catch (e) {
                console.warn('Could not save report:', e);
            }

        } catch (err) {
            console.error('Analysis failed:', err);
            alert('Analysis failed: ' + err.message);
            showSection('preview');
        }
    });

    // ────────────────────────────────
    // Share Results
    // ────────────────────────────────
    shareBtn.addEventListener('click', async () => {
        if (!currentResult) return;

        const pred = currentResult.prediction;
        const text = `🌿 CropDoc AI Diagnosis\n\n` +
            `🌱 Crop: ${pred.crop}\n` +
            `🔬 Disease: ${pred.disease}\n` +
            `📊 Confidence: ${pred.confidence_percent.toFixed(1)}%\n` +
            `⚠️ Severity: ${pred.severity}\n` +
            `🚦 Risk: ${pred.risk_level}\n\n` +
            `💊 Treatment (Organic):\n${pred.treatment.organic || 'N/A'}\n\n` +
            `🛡️ Prevention:\n${pred.prevention || 'N/A'}\n\n` +
            `— Diagnosed by CropDoc AI (works offline!)`;

        if (navigator.share) {
            try {
                await navigator.share({ title: 'CropDoc AI Diagnosis', text });
            } catch (e) {
                // User cancelled share
            }
        } else {
            // Fallback: copy to clipboard
            try {
                await navigator.clipboard.writeText(text);
                alert('Diagnosis report copied to clipboard!');
            } catch (e) {
                // Show text for manual copy
                prompt('Copy this report:', text);
            }
        }
    });

    // ────────────────────────────────
    // Render Results
    // ────────────────────────────────
    function renderResults(data) {
        const pred = data.prediction;

        resultDisease.textContent = pred.disease;
        resultCrop.textContent = pred.crop;

        if (pred.is_healthy) {
            resultEmoji.textContent = '✅';
            resultHeader.classList.add('healthy');
        } else {
            resultEmoji.textContent = '🔬';
            resultHeader.classList.remove('healthy');
        }

        const riskLower = (pred.risk_level || 'unknown').toLowerCase();
        resultBadge.className = `result-badge ${riskLower}`;
        resultRiskLevel.textContent = pred.risk_level || 'Unknown';

        const confPercent = pred.confidence_percent || (pred.confidence * 100);
        resultConfidence.textContent = confPercent.toFixed(1) + '%';
        setTimeout(() => {
            confidenceBar.style.width = confPercent + '%';
            if (confPercent >= 80) {
                confidenceBar.style.background = 'linear-gradient(90deg, #2e7d46, #66bb6a)';
            } else if (confPercent >= 50) {
                confidenceBar.style.background = 'linear-gradient(90deg, #e65100, #ffa726)';
            } else {
                confidenceBar.style.background = 'linear-gradient(90deg, #b71c1c, #ef5350)';
            }
        }, 100);

        resultSeverity.textContent = pred.severity || 'N/A';
        updateSeverityDots(pred.severity);

        if (pred.scientific_name) {
            scientificCard.classList.remove('hidden');
            resultScientific.textContent = pred.scientific_name;
        } else {
            scientificCard.classList.add('hidden');
        }

        resultSymptoms.textContent = pred.symptoms || 'No symptom data available.';

        const treatment = pred.treatment || {};
        treatmentOrganic.textContent = treatment.organic || 'No organic treatment data available.';
        treatmentChemical.textContent = treatment.chemical || 'No chemical treatment data available.';

        tabOrganic.classList.add('active');
        tabChemical.classList.remove('active');
        treatmentOrganic.classList.add('active');
        treatmentChemical.classList.remove('active');

        resultPrevention.textContent = pred.prevention || 'No prevention data available.';
        resultFertilizer.textContent = pred.fertilizer || 'No fertilizer data available.';

        topPredictions.innerHTML = '';
        if (data.top_predictions && data.top_predictions.length > 0) {
            data.top_predictions.forEach(tp => {
                const item = document.createElement('div');
                item.className = 'prediction-item';
                item.innerHTML = `
                    <div class="prediction-info">
                        <span class="prediction-name">${tp.disease}</span>
                        <span class="prediction-crop">${tp.crop}</span>
                    </div>
                    <span class="prediction-conf">${tp.confidence_percent.toFixed(1)}%</span>
                `;
                topPredictions.appendChild(item);
            });
        }

        const modeInfo = data.mode === 'online' ? '🌐 Server AI' : '📱 On-Device AI';
        statusMode.textContent = modeInfo;
    }

    function updateSeverityDots(severity) {
        const dots = severityDots.querySelectorAll('.dot');
        dots.forEach(d => d.className = 'dot');

        switch ((severity || '').toLowerCase()) {
            case 'severe':
                dots.forEach(d => d.classList.add('active-critical'));
                break;
            case 'moderate':
                dots[0].classList.add('active-high');
                dots[1].classList.add('active-high');
                dots[2].classList.add('active-high');
                break;
            case 'mild':
                dots[0].classList.add('active-medium');
                dots[1].classList.add('active-medium');
                break;
            case 'low':
                dots[0].classList.add('active-low');
                break;
            case 'none':
                dots[0].classList.add('active-low');
                break;
        }
    }

    // ────────────────────────────────
    // Treatment Tabs
    // ────────────────────────────────
    tabOrganic.addEventListener('click', () => {
        tabOrganic.classList.add('active');
        tabChemical.classList.remove('active');
        treatmentOrganic.classList.add('active');
        treatmentChemical.classList.remove('active');
    });

    tabChemical.addEventListener('click', () => {
        tabChemical.classList.add('active');
        tabOrganic.classList.remove('active');
        treatmentChemical.classList.add('active');
        treatmentOrganic.classList.remove('active');
    });

    // ────────────────────────────────
    // History
    // ────────────────────────────────
    async function loadHistory() {
        try {
            const reports = await CropDocStorage.getReports(50);

            if (reports.length === 0) {
                historyEmpty.classList.remove('hidden');
                historyList.classList.add('hidden');
                clearHistoryBtn.classList.add('hidden');
                return;
            }

            historyEmpty.classList.add('hidden');
            historyList.classList.remove('hidden');
            clearHistoryBtn.classList.remove('hidden');
            historyList.innerHTML = '';

            reports.forEach(report => {
                const card = document.createElement('div');
                card.className = 'history-card';

                const timeAgo = getTimeAgo(report.timestamp);
                const severityColor = getSeverityColor(report.severity);
                const thumbHTML = report.imageData
                    ? `<img src="${report.imageData}" alt="scan">`
                    : (report.isHealthy ? '✅' : '🔬');

                card.innerHTML = `
                    <div class="history-thumb">${thumbHTML}</div>
                    <div class="history-info">
                        <div class="history-disease">${report.disease}</div>
                        <div class="history-meta">
                            <span>${report.crop}</span>
                            <span>·</span>
                            <span><span class="history-severity-dot" style="background:${severityColor}"></span>${report.severity}</span>
                            <span>·</span>
                            <span>${timeAgo}</span>
                        </div>
                    </div>
                    <span class="history-conf">${report.confidencePercent.toFixed(1)}%</span>
                    <button class="history-delete" data-id="${report.id}" title="Delete report">✕</button>
                `;

                // Click to view details
                card.addEventListener('click', (e) => {
                    if (e.target.classList.contains('history-delete')) return;
                    showReportDetail(report);
                });

                // Delete button
                const deleteBtn = card.querySelector('.history-delete');
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('Delete this report?')) {
                        await CropDocStorage.deleteReport(report.id);
                        loadHistory();
                        updateScanCount();
                    }
                });

                historyList.appendChild(card);
            });
        } catch (e) {
            console.error('Failed to load history:', e);
        }
    }

    // Clear all history
    clearHistoryBtn.addEventListener('click', async () => {
        if (confirm('Clear all scan history? This cannot be undone.')) {
            await CropDocStorage.clearAll();
            loadHistory();
            updateScanCount();
        }
    });

    // Show report detail in modal
    function showReportDetail(report) {
        detailTitle.textContent = `${report.isHealthy ? '✅' : '🔬'} ${report.disease}`;

        const date = new Date(report.timestamp).toLocaleString();
        const severityColor = getSeverityColor(report.severity);

        let html = `
            <div class="detail-row"><span class="detail-label">Crop</span><span class="detail-value">${report.crop}</span></div>
            <div class="detail-row"><span class="detail-label">Disease</span><span class="detail-value">${report.disease}</span></div>
            <div class="detail-row"><span class="detail-label">Confidence</span><span class="detail-value">${report.confidencePercent.toFixed(1)}%</span></div>
            <div class="detail-row"><span class="detail-label">Severity</span><span class="detail-value"><span class="history-severity-dot" style="background:${severityColor}"></span> ${report.severity}</span></div>
            <div class="detail-row"><span class="detail-label">Risk Level</span><span class="detail-value">${report.riskLevel}</span></div>
            <div class="detail-row"><span class="detail-label">Mode</span><span class="detail-value">${report.mode === 'online' ? '🌐 Online' : '📱 Offline'}</span></div>
            <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${date}</span></div>
            <div class="detail-row"><span class="detail-label">Synced</span><span class="detail-value">${report.synced ? '✅ Yes' : '⏳ Pending'}</span></div>
        `;

        if (report.scientificName) {
            html += `<div class="detail-section"><h4>🔬 Scientific Name</h4><p>${report.scientificName}</p></div>`;
        }
        if (report.symptoms) {
            html += `<div class="detail-section"><h4>🩺 Symptoms</h4><p>${report.symptoms}</p></div>`;
        }
        if (report.treatment) {
            html += `<div class="detail-section"><h4>🌱 Organic Treatment</h4><p>${report.treatment.organic || 'N/A'}</p></div>`;
            html += `<div class="detail-section"><h4>🧪 Chemical Treatment</h4><p>${report.treatment.chemical || 'N/A'}</p></div>`;
        }
        if (report.prevention) {
            html += `<div class="detail-section"><h4>🛡️ Prevention</h4><p>${report.prevention}</p></div>`;
        }
        if (report.fertilizer) {
            html += `<div class="detail-section"><h4>🌾 Fertilizer</h4><p>${report.fertilizer}</p></div>`;
        }

        detailBody.innerHTML = html;
        historyDetailModal.classList.remove('hidden');
    }

    closeDetailModal.addEventListener('click', () => {
        historyDetailModal.classList.add('hidden');
    });

    // ────────────────────────────────
    // Helpers
    // ────────────────────────────────
    function getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - new Date(timestamp).getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    function getSeverityColor(severity) {
        switch ((severity || '').toLowerCase()) {
            case 'severe': return '#d32f2f';
            case 'moderate': return '#ef5350';
            case 'mild': return '#ffa726';
            case 'low': return '#66bb6a';
            case 'none': return '#66bb6a';
            default: return '#66896b';
        }
    }

    // ────────────────────────────────
    // Pre-cache knowledge base
    // ────────────────────────────────
    if ('caches' in window) {
        caches.open('cropdoc-v1').then(cache => {
            cache.add('/knowledge_base.json').catch(() => { });
        });
    }

    console.log('🌱 CropDoc AI initialized');
})();
