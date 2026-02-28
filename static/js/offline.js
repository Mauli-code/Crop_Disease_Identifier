/**
 * CropDoc AI — Offline Inference Module
 * Runs TensorFlow.js model in-browser for fully offline disease detection.
 */

const CropDocOffline = (() => {
    let model = null;
    let knowledgeBase = null;
    let isModelLoading = false;

    // Class names matching the PlantVillage dataset (38 classes)
    const CLASS_NAMES = [
        "Apple___Apple_scab",
        "Apple___Black_rot",
        "Apple___Cedar_apple_rust",
        "Apple___healthy",
        "Blueberry___healthy",
        "Cherry_(including_sour)___Powdery_mildew",
        "Cherry_(including_sour)___healthy",
        "Corn_(maize)___Cercospora_leaf_spot_Gray_leaf_spot",
        "Corn_(maize)___Common_rust",
        "Corn_(maize)___Northern_Leaf_Blight",
        "Corn_(maize)___healthy",
        "Grape___Black_rot",
        "Grape___Esca_(Black_Measles)",
        "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)",
        "Grape___healthy",
        "Orange___Haunglongbing_(Citrus_greening)",
        "Peach___Bacterial_spot",
        "Peach___healthy",
        "Pepper_bell___Bacterial_spot",
        "Pepper_bell___healthy",
        "Potato___Early_blight",
        "Potato___Late_blight",
        "Potato___healthy",
        "Raspberry___healthy",
        "Soybean___healthy",
        "Squash___Powdery_mildew",
        "Strawberry___Leaf_scorch",
        "Strawberry___healthy",
        "Tomato___Bacterial_spot",
        "Tomato___Early_blight",
        "Tomato___Late_blight",
        "Tomato___Leaf_Mold",
        "Tomato___Septoria_leaf_spot",
        "Tomato___Spider_mites_Two-spotted_spider_mite",
        "Tomato___Target_Spot",
        "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
        "Tomato___Tomato_mosaic_virus",
        "Tomato___healthy"
    ];

    /**
     * Load the TensorFlow.js model from /static/models/.
     */
    async function loadModel() {
        if (model) return model;
        if (isModelLoading) {
            // Wait for ongoing load
            while (isModelLoading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return model;
        }

        isModelLoading = true;
        try {
            console.log('🔧 Loading TF.js model...');
            model = await tf.loadLayersModel('/static/models/model.json');
            console.log('✅ TF.js model loaded successfully');
            console.log('   Input shape:', model.inputs[0].shape);
            console.log('   Output shape:', model.outputs[0].shape);
            return model;
        } catch (err) {
            console.error('❌ Failed to load TF.js model:', err);
            throw new Error('Offline model not available. Please ensure model files exist in /static/models/');
        } finally {
            isModelLoading = false;
        }
    }

    /**
     * Load the knowledge base from /static or embed it.
     */
    async function loadKnowledgeBase() {
        if (knowledgeBase) return knowledgeBase;

        try {
            const res = await fetch('/knowledge_base.json');
            knowledgeBase = await res.json();
            console.log('✅ Knowledge base loaded:', knowledgeBase.classes.length, 'classes');
            return knowledgeBase;
        } catch (err) {
            console.warn('⚠️ Could not fetch knowledge base, using cached version');
            // Try from cache
            try {
                const cache = await caches.open('cropdoc-v1');
                const cached = await cache.match('/knowledge_base.json');
                if (cached) {
                    knowledgeBase = await cached.json();
                    return knowledgeBase;
                }
            } catch (e) {
                // Ignore cache errors
            }
            throw new Error('Knowledge base not available offline');
        }
    }

    /**
     * Estimate severity from confidence score.
     */
    function getSeverity(confidence) {
        if (confidence >= 0.90) return 'Severe';
        if (confidence >= 0.75) return 'Moderate';
        if (confidence >= 0.50) return 'Mild';
        return 'Low';
    }

    /**
     * Run offline prediction on a preprocessed file.
     * @param {File} file - The image file to classify.
     * @returns {Object} Prediction result matching backend format.
     */
    async function predict(file) {
        // Load model and knowledge base in parallel
        const [mdl, kb] = await Promise.all([
            loadModel(),
            loadKnowledgeBase()
        ]);

        // Preprocess image
        const { tensor } = await CropDocPreprocess.preprocessFile(file);

        // Run inference
        const predictions = mdl.predict(tensor);
        const probabilities = await predictions.data();

        // Cleanup tensors
        tensor.dispose();
        predictions.dispose();

        // Find top prediction
        const probArray = Array.from(probabilities);
        const maxIdx = probArray.indexOf(Math.max(...probArray));
        const confidence = probArray[maxIdx];
        const className = CLASS_NAMES[maxIdx];

        // Get disease info from knowledge base
        const info = kb.diseases[className] || {};
        const isHealthy = info.is_healthy || false;
        const severity = isHealthy ? 'None' : getSeverity(confidence);

        // Get top 3 predictions
        const indexed = probArray.map((p, i) => ({ prob: p, idx: i }));
        indexed.sort((a, b) => b.prob - a.prob);
        const top3 = indexed.slice(0, 3).map(item => ({
            class_name: CLASS_NAMES[item.idx],
            disease: (kb.diseases[CLASS_NAMES[item.idx]] || {}).disease || 'Unknown',
            crop: (kb.diseases[CLASS_NAMES[item.idx]] || {}).crop || 'Unknown',
            confidence: Math.round(item.prob * 10000) / 10000,
            confidence_percent: Math.round(item.prob * 10000) / 100
        }));

        return {
            success: true,
            mode: 'offline',
            prediction: {
                class_name: className,
                disease: info.disease || 'Unknown',
                crop: info.crop || 'Unknown',
                confidence: Math.round(confidence * 10000) / 10000,
                confidence_percent: Math.round(confidence * 10000) / 100,
                severity: severity,
                is_healthy: isHealthy,
                scientific_name: info.scientific_name || null,
                symptoms: info.symptoms || '',
                treatment: info.treatment || {},
                prevention: info.prevention || '',
                fertilizer: info.fertilizer || '',
                risk_level: info.risk_level || 'Unknown'
            },
            top_predictions: top3
        };
    }

    /**
     * Check if offline mode is ready (model files exist).
     */
    async function isReady() {
        try {
            const res = await fetch('/static/models/model.json', { method: 'HEAD' });
            return res.ok;
        } catch {
            return false;
        }
    }

    return {
        loadModel,
        loadKnowledgeBase,
        predict,
        isReady,
        CLASS_NAMES
    };
})();
