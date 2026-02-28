/**
 * CropDoc AI — Main Application Controller
 * Manages UI, hybrid mode switching, camera, and result rendering.
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

    // Camera
    const cameraModal = $('#cameraModal');
    const cameraVideo = $('#cameraVideo');
    const cameraCanvas = $('#cameraCanvas');
    const captureBtn = $('#captureBtn');
    const closeCameraModal = $('#closeCameraModal');

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
    // File Upload Handling
    // ────────────────────────────────
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadBtn.addEventListener('click', () => fileInput.click());

    // Drag and drop
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
        // Validate
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
            console.error('Camera error:', err);
        }
    });

    captureBtn.addEventListener('click', () => {
        const canvas = cameraCanvas;
        const size = Math.min(cameraVideo.videoWidth, cameraVideo.videoHeight);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Center crop
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
                // Try online first
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
                // Offline mode
                loadingText.textContent = 'Analyzing with on-device AI...';
                modeLabel.textContent = 'locally';
                result = await CropDocOffline.predict(currentFile);
            }

            renderResults(result);
            showSection('results');

        } catch (err) {
            console.error('Analysis failed:', err);
            alert('Analysis failed: ' + err.message);
            showSection('preview');
        }
    });

    // ────────────────────────────────
    // Render Results
    // ────────────────────────────────
    function renderResults(data) {
        const pred = data.prediction;

        // Disease name & crop
        resultDisease.textContent = pred.disease;
        resultCrop.textContent = pred.crop;

        // Emoji
        if (pred.is_healthy) {
            resultEmoji.textContent = '✅';
            resultHeader.classList.add('healthy');
        } else {
            resultEmoji.textContent = '🔬';
            resultHeader.classList.remove('healthy');
        }

        // Risk badge
        const riskLower = (pred.risk_level || 'unknown').toLowerCase();
        resultBadge.className = `result-badge ${riskLower}`;
        resultRiskLevel.textContent = pred.risk_level || 'Unknown';

        // Confidence
        const confPercent = pred.confidence_percent || (pred.confidence * 100);
        resultConfidence.textContent = confPercent.toFixed(1) + '%';
        setTimeout(() => {
            confidenceBar.style.width = confPercent + '%';

            // Color the bar based on confidence
            if (confPercent >= 80) {
                confidenceBar.style.background = 'linear-gradient(90deg, #2e7d46, #66bb6a)';
            } else if (confPercent >= 50) {
                confidenceBar.style.background = 'linear-gradient(90deg, #e65100, #ffa726)';
            } else {
                confidenceBar.style.background = 'linear-gradient(90deg, #b71c1c, #ef5350)';
            }
        }, 100);

        // Severity
        resultSeverity.textContent = pred.severity || 'N/A';
        updateSeverityDots(pred.severity);

        // Scientific name
        if (pred.scientific_name) {
            scientificCard.classList.remove('hidden');
            resultScientific.textContent = pred.scientific_name;
        } else {
            scientificCard.classList.add('hidden');
        }

        // Symptoms
        resultSymptoms.textContent = pred.symptoms || 'No symptom data available.';

        // Treatment
        const treatment = pred.treatment || {};
        treatmentOrganic.textContent = treatment.organic || 'No organic treatment data available.';
        treatmentChemical.textContent = treatment.chemical || 'No chemical treatment data available.';

        // Reset tabs
        tabOrganic.classList.add('active');
        tabChemical.classList.remove('active');
        treatmentOrganic.classList.add('active');
        treatmentChemical.classList.remove('active');

        // Prevention
        resultPrevention.textContent = pred.prevention || 'No prevention data available.';

        // Fertilizer
        resultFertilizer.textContent = pred.fertilizer || 'No fertilizer data available.';

        // Top predictions
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

        // Mode indicator
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
                // All green for healthy
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
    // Pre-cache knowledge base
    // ────────────────────────────────
    if ('caches' in window) {
        caches.open('cropdoc-v1').then(cache => {
            cache.add('/knowledge_base.json').catch(() => { });
        });
    }

    console.log('🌱 CropDoc AI initialized');
})();
