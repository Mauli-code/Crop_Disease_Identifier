/**
 * CropDoc Farmer App v3
 * Handles UI, Camera, Analysis, and History
 */

const FarmerApp = {
    elements: {},
    history: [],

    init() {
        console.log('🌿 FarmerApp v3 Initializing...');
        this.cacheElements();
        this.bindEvents();
        this.loadHistory();
        this.updateOnlineStatus();

        // Listen for online/offline changes
        window.addEventListener('online', () => this.updateOnlineStatus());
        window.addEventListener('offline', () => this.updateOnlineStatus());
    },

    cacheElements() {
        this.elements = {
            uploadCard: document.getElementById('uploadCard'),
            previewCard: document.getElementById('previewCard'),
            loadingSection: document.getElementById('loadingSection'),
            resultSection: document.getElementById('resultSection'),
            uploadZone: document.getElementById('uploadZone'),
            fileInput: document.getElementById('fileInput'),
            uploadBtn: document.getElementById('uploadBtn'),
            analyzeBtn: document.getElementById('analyzeBtn'),
            clearBtn: document.getElementById('clearBtn'),
            previewImage: document.getElementById('previewImage'),
            resultEmoji: document.getElementById('resultEmoji'),
            resultDisease: document.getElementById('resultDisease'),
            resultCrop: document.getElementById('resultCrop'),
            resultConfidence: document.getElementById('resultConfidence'),
            confidenceBar: document.getElementById('confidenceBar'),
            resultTreatment: document.getElementById('resultTreatment'),
            resultPrevention: document.getElementById('resultPrevention'),
            newScanBtn: document.getElementById('newScanBtn'),
            errorBanner: document.getElementById('errorBanner'),
            historyList: document.getElementById('historyList'),
            emptyHistory: document.getElementById('emptyHistory'),
            clearHistoryBtn: document.getElementById('clearHistoryBtn'),
            onlineStatus: document.getElementById('onlineStatus')
        };
    },

    bindEvents() {
        // Selection
        this.elements.uploadBtn.onclick = () => this.elements.fileInput.click();
        this.elements.uploadZone.onclick = () => this.elements.fileInput.click();

        this.elements.fileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                this.handleImageSelect(e.target.files[0]);
            }
        };

        // Analysis
        this.elements.analyzeBtn.onclick = () => this.runAnalysis();

        // Reset
        this.elements.clearBtn.onclick = () => this.resetUI();
        this.elements.newScanBtn.onclick = () => this.resetUI();

        // History
        this.elements.clearHistoryBtn.onclick = () => this.clearHistory();

        // Drag and Drop
        this.elements.uploadZone.ondragover = (e) => {
            e.preventDefault();
            this.elements.uploadZone.style.borderColor = 'var(--primary)';
        };
        this.elements.uploadZone.ondragleave = () => {
            this.elements.uploadZone.style.borderColor = 'var(--accent)';
        };
        this.elements.uploadZone.ondrop = (e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleImageSelect(e.dataTransfer.files[0]);
            }
        };
    },

    updateOnlineStatus() {
        if (navigator.onLine) {
            this.elements.onlineStatus.innerHTML = '<span class="status-dot"></span> Offline Ready';
            this.elements.onlineStatus.style.color = 'var(--primary)';
        } else {
            this.elements.onlineStatus.innerHTML = '<span class="status-dot" style="background:#2E7D32"></span> Offline Mode';
            this.elements.onlineStatus.style.color = 'var(--primary)';
        }
    },

    showError(msg) {
        this.elements.errorBanner.textContent = msg;
        this.elements.errorBanner.classList.add('visible');
        setTimeout(() => this.elements.errorBanner.classList.remove('visible'), 5000);
    },

    handleImageSelect(file) {
        this.currentFile = file; // Store the actual File object
        const reader = new FileReader();
        reader.onload = (e) => {
            this.elements.previewImage.src = e.target.result;
            this.elements.uploadCard.classList.add('hidden');
            this.elements.previewCard.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        reader.readAsDataURL(file);
    },

    async runAnalysis() {
        if (!this.currentFile) {
            this.showError('Please select a leaf photo first.');
            return;
        }

        this.elements.previewCard.classList.add('hidden');
        this.elements.loadingSection.classList.remove('hidden');

        try {
            // Predict needs the File object, not the Image element
            const result = await CropDocOffline.predict(this.currentFile);

            // Result is { success, prediction: { ... } }
            if (result && result.success && result.prediction) {
                this.displayResult(result.prediction);
                this.saveToHistory(this.elements.previewImage.src, result.prediction);
            } else {
                throw new Error('Invalid result structure');
            }
        } catch (err) {
            console.error('Analysis failed:', err);
            this.showError('Could not analyze image. Please try another photo.');
            this.elements.loadingSection.classList.add('hidden');
            this.elements.previewCard.classList.remove('hidden');
        }
    },

    displayResult(prediction) {
        this.elements.loadingSection.classList.add('hidden');
        this.elements.resultSection.classList.remove('hidden');

        this.elements.resultEmoji.textContent = prediction.is_healthy ? '✅' : '⚠️';
        this.elements.resultDisease.textContent = prediction.disease;
        this.elements.resultCrop.textContent = prediction.crop || 'Plant Leaf';

        const confText = Math.round(prediction.confidence * 100) + '%';
        this.elements.resultConfidence.textContent = confText;
        this.elements.confidenceBar.style.width = confText;

        // Populate Treatment
        this.elements.resultTreatment.innerHTML = '';
        const treatment = prediction.treatment;

        if (treatment) {
            // Treatment can be an object with step1, step2...
            if (typeof treatment === 'object' && !Array.isArray(treatment)) {
                Object.values(treatment).forEach(val => {
                    const li = document.createElement('li');
                    li.textContent = val;
                    this.elements.resultTreatment.appendChild(li);
                });
            } else if (Array.isArray(treatment)) {
                treatment.forEach(step => {
                    const li = document.createElement('li');
                    li.textContent = step;
                    this.elements.resultTreatment.appendChild(li);
                });
            } else {
                // String fallback
                const steps = treatment.split(/[•\n]/).filter(s => s.trim().length > 0);
                steps.forEach(step => {
                    const li = document.createElement('li');
                    li.textContent = step.trim();
                    this.elements.resultTreatment.appendChild(li);
                });
            }
        }

        this.elements.resultPrevention.textContent = prediction.prevention || 'Maintain good garden hygiene and check plants regularly.';

        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    resetUI() {
        this.elements.resultSection.classList.add('hidden');
        this.elements.previewCard.classList.add('hidden');
        this.elements.loadingSection.classList.add('hidden');
        this.elements.uploadCard.classList.remove('hidden');
        this.elements.fileInput.value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ─── HISTORY LOGIC ───

    loadHistory() {
        const stored = localStorage.getItem('cropdoc_history');
        if (stored) {
            this.history = JSON.parse(stored);
        }
        this.renderHistory();
    },

    saveToHistory(imgSrc, result) {
        const entry = {
            id: Date.now(),
            image: imgSrc,
            disease: result.disease || 'Unknown',
            crop: result.crop || 'Plant',
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        };

        // Keep last 10 items
        this.history.unshift(entry);
        if (this.history.length > 10) this.history.pop();

        localStorage.setItem('cropdoc_history', JSON.stringify(this.history));
        this.renderHistory();
    },

    renderHistory() {
        if (this.history.length === 0) {
            this.elements.emptyHistory.classList.remove('hidden');
            this.elements.clearHistoryBtn.classList.add('hidden');
            this.elements.historyList.querySelectorAll('.history-card').forEach(el => el.remove());
            return;
        }

        this.elements.emptyHistory.classList.add('hidden');
        this.elements.clearHistoryBtn.classList.remove('hidden');

        // Clear list but keep empty state element
        const cards = this.elements.historyList.querySelectorAll('.history-card');
        cards.forEach(c => c.remove());

        this.history.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.innerHTML = `
                <img src="${item.image}" class="history-thumb" alt="leaf thumb">
                <div class="history-info">
                    <h4>${item.disease}</h4>
                    <p>${item.crop} • ${item.date}</p>
                </div>
            `;
            this.elements.historyList.appendChild(card);
        });
    },

    clearHistory() {
        if (confirm('Are you sure you want to clear your history?')) {
            this.history = [];
            localStorage.removeItem('cropdoc_history');
            this.renderHistory();
        }
    }
};

// Start the app when everything is ready
window.FarmerApp = FarmerApp;
