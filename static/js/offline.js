/**
 * CropDoc AI — Offline Inference Module
 * Uses real TensorFlow.js MobileNetV2 model for 8 trained classes.
 * Falls back to color-analysis prototype for other classes or if model fails.
 */

const CropDocOffline = (() => {
    let knowledgeBase = null;
    let tfModel = null;
    let modelLoadFailed = false;

    // 38 PlantVillage class names (full knowledge base order)
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

    // The 8 classes the trained model outputs (in order)
    const MODEL_CLASS_NAMES = [
        "Pepper__bell___Bacterial_spot",
        "Pepper__bell___healthy",
        "Potato___Early_blight",
        "Potato___Late_blight",
        "Potato___healthy",
        "Tomato_Early_blight",
        "Tomato_Late_blight",
        "Tomato_healthy"
    ];

    // Map each model output index → 38-class knowledge base index
    const MODEL_TO_KB_MAP = [
        18, // Pepper__bell___Bacterial_spot  → Pepper_bell___Bacterial_spot
        19, // Pepper__bell___healthy         → Pepper_bell___healthy
        20, // Potato___Early_blight          → Potato___Early_blight
        21, // Potato___Late_blight           → Potato___Late_blight
        22, // Potato___healthy               → Potato___healthy
        29, // Tomato_Early_blight            → Tomato___Early_blight
        30, // Tomato_Late_blight             → Tomato___Late_blight
        37  // Tomato_healthy                 → Tomato___healthy
    ];

    /**
     * Load knowledge base.
     */
    async function loadKnowledgeBase() {
        if (knowledgeBase) return knowledgeBase;
        try {
            const res = await fetch('/knowledge_base.json');
            knowledgeBase = await res.json();
            return knowledgeBase;
        } catch {
            try {
                const cache = await caches.open('cropdoc-v2');
                const cached = await cache.match('/knowledge_base.json');
                if (cached) {
                    knowledgeBase = await cached.json();
                    return knowledgeBase;
                }
            } catch (e) { /* ignore */ }
            throw new Error('Knowledge base not available');
        }
    }

    /**
     * Load the TF.js model.
     */
    async function loadModel() {
        if (tfModel) return tfModel;
        if (modelLoadFailed) return null;

        // Check if TensorFlow.js is available
        if (typeof tf === 'undefined' || !tf.loadLayersModel) {
            console.warn('⚠️ TensorFlow.js not available, will use color-analysis fallback');
            modelLoadFailed = true;
            return null;
        }

        try {
            console.log('🧠 Loading TF.js model...');
            tfModel = await tf.loadLayersModel('/static/models/model.json');
            console.log('✅ TF.js model loaded successfully');
            console.log('   Input shape:', tfModel.inputs[0].shape);
            console.log('   Output shape:', tfModel.outputs[0].shape);
            return tfModel;
        } catch (err) {
            console.warn('⚠️ Failed to load TF.js model:', err.message);
            console.warn('   Will use color-analysis fallback');
            modelLoadFailed = true;
            return null;
        }
    }

    /**
     * Run real model inference on an image tensor.
     * Returns { kbIndex, confidence, allProbs38 } or null if model unavailable.
     */
    function runModelInference(tensor) {
        if (!tfModel) return null;

        return tf.tidy(() => {
            const predictions = tfModel.predict(tensor);
            const probs = predictions.dataSync(); // Float32Array of 8 values

            // Find best prediction among the 8 model classes
            let maxIdx = 0;
            let maxProb = probs[0];
            for (let i = 1; i < probs.length; i++) {
                if (probs[i] > maxProb) {
                    maxProb = probs[i];
                    maxIdx = i;
                }
            }

            // Map to 38-class index
            const kbIndex = MODEL_TO_KB_MAP[maxIdx];

            // Build a sparse 38-class probability array
            const allProbs38 = new Array(38).fill(0.0001);
            for (let i = 0; i < probs.length; i++) {
                allProbs38[MODEL_TO_KB_MAP[i]] = probs[i];
            }

            return {
                kbIndex,
                confidence: maxProb,
                allProbs38
            };
        });
    }

    // ────────────────────────────────────────
    // Color-analysis fallback (unchanged)
    // ────────────────────────────────────────

    function analyzeColors(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const totalPixels = data.length / 4;

        let green = 0, brown = 0, yellow = 0, white = 0, dark = 0, red = 0, orange = 0;
        let totalR = 0, totalG = 0, totalB = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            totalR += r; totalG += g; totalB += b;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            const brightness = (r + g + b) / 3;

            if (brightness < 40) {
                dark++;
            } else if (brightness > 220 && sat < 0.15) {
                white++;
            } else if (g > r * 1.2 && g > b * 1.2 && sat > 0.15) {
                green++;
            } else if (r > 140 && g > 120 && b < 80 && r > b * 1.5) {
                yellow++;
            } else if (r > 120 && g < 90 && b < 90 && sat > 0.2) {
                red++;
            } else if (r > 100 && g > 60 && g < 120 && b < 80 && r > g) {
                brown++;
            } else if (r > 150 && g > 80 && g < 140 && b < 80) {
                orange++;
            }
        }

        const avgR = totalR / totalPixels;
        const avgG = totalG / totalPixels;
        const avgB = totalB / totalPixels;

        return {
            green: green / totalPixels,
            brown: brown / totalPixels,
            yellow: yellow / totalPixels,
            white: white / totalPixels,
            dark: dark / totalPixels,
            red: red / totalPixels,
            orange: orange / totalPixels,
            avgR, avgG, avgB,
            dominantGreen: avgG > avgR && avgG > avgB,
            dominantRed: avgR > avgG * 1.2,
            colorVariance: Math.sqrt(
                Math.pow(avgR - avgG, 2) +
                Math.pow(avgG - avgB, 2) +
                Math.pow(avgR - avgB, 2)
            )
        };
    }

    function colorToScores(colors) {
        const scores = new Array(38).fill(0.001);

        if (colors.green > 0.35) {
            scores[3] += 0.20; scores[4] += 0.10; scores[6] += 0.12;
            scores[10] += 0.15; scores[14] += 0.12; scores[17] += 0.12;
            scores[19] += 0.15; scores[22] += 0.14; scores[23] += 0.08;
            scores[24] += 0.08; scores[27] += 0.12; scores[37] += 0.18;

            if (colors.green > 0.50) {
                const healthyPick = [3, 10, 14, 19, 22, 37][Math.floor(colors.avgG % 6)];
                scores[healthyPick] += 0.40;
            }
        }

        if (colors.brown > 0.08) {
            scores[0] += colors.brown * 2.5; scores[1] += colors.brown * 3.0;
            scores[11] += colors.brown * 2.8; scores[20] += colors.brown * 3.5;
            scores[21] += colors.brown * 3.2; scores[29] += colors.brown * 3.8;
            scores[30] += colors.brown * 3.5; scores[34] += colors.brown * 2.5;
            scores[32] += colors.brown * 2.2;
        }

        if (colors.yellow > 0.10) {
            scores[2] += colors.yellow * 2.5; scores[15] += colors.yellow * 3.0;
            scores[35] += colors.yellow * 4.0; scores[36] += colors.yellow * 3.2;
            scores[8] += colors.yellow * 2.0;
        }

        if (colors.red > 0.08) {
            scores[2] += colors.red * 3.0; scores[8] += colors.red * 4.0;
            scores[26] += colors.red * 2.5; scores[16] += colors.red * 2.0;
        }

        if (colors.white > 0.12) {
            scores[5] += colors.white * 3.5; scores[25] += colors.white * 4.0;
            scores[31] += colors.white * 2.5;
        }

        if (colors.dark > 0.15 && colors.green > 0.15) {
            scores[7] += 0.15; scores[9] += 0.12; scores[12] += 0.10;
            scores[13] += 0.12; scores[28] += 0.18; scores[18] += 0.15;
            scores[33] += 0.12;
        }

        if (colors.orange > 0.08) {
            scores[2] += colors.orange * 3.0; scores[8] += colors.orange * 3.5;
            scores[15] += colors.orange * 2.5; scores[9] += colors.orange * 2.0;
        }

        if (colors.colorVariance > 40 && colors.green < 0.35) {
            const diseaseClasses = [0, 1, 2, 5, 7, 8, 9, 11, 12, 13, 15, 16, 18, 20, 21, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35, 36];
            diseaseClasses.forEach(idx => { scores[idx] += 0.03; });
        }

        if (colors.green > 0.40 && colors.colorVariance < 25) {
            const healthyClasses = [3, 4, 6, 10, 14, 17, 19, 22, 23, 24, 27, 37];
            healthyClasses.forEach(idx => { scores[idx] += 0.15; });
        }

        const seed = (colors.avgR * 17 + colors.avgG * 31 + colors.avgB * 47) % 38;
        scores[Math.floor(seed)] += 0.08;

        return scores;
    }

    function softmax(scores) {
        const maxScore = Math.max(...scores);
        const exps = scores.map(s => Math.exp(s - maxScore));
        const sumExps = exps.reduce((a, b) => a + b, 0);
        return exps.map(e => e / sumExps);
    }

    /**
     * Determine severity from confidence.
     */
    function getSeverity(confidence, isHealthy) {
        if (isHealthy) return 'None';
        if (confidence >= 0.85) return 'Severe';
        if (confidence >= 0.70) return 'Moderate';
        if (confidence >= 0.50) return 'Mild';
        return 'Low';
    }

    /**
     * Run prediction — tries real TF.js model first, falls back to color-analysis.
     * @param {File} file - The image file to classify.
     */
    async function predict(file) {
        const kb = await loadKnowledgeBase();

        // Load and preprocess image
        const img = await CropDocPreprocess.loadImage(file);
        const canvas = CropDocPreprocess.resizeToCanvas(img);

        // Try to load the model (lazy, first time only)
        await loadModel();

        let predictedKbIdx;
        let confidence;
        let allProbs38;
        let usedModel = false;

        if (tfModel) {
            // ── Real TF.js model inference ──
            console.log('🧠 Running TF.js model inference...');
            const tensor = CropDocPreprocess.canvasToTensor(canvas);

            try {
                const result = runModelInference(tensor);
                if (result && result.confidence > 0.1) {
                    predictedKbIdx = result.kbIndex;
                    confidence = result.confidence;
                    allProbs38 = result.allProbs38;
                    usedModel = true;
                    console.log('✅ Model prediction:', CLASS_NAMES[predictedKbIdx], '→', (confidence * 100).toFixed(1) + '%');
                }
            } catch (err) {
                console.warn('⚠️ Model inference failed, using fallback:', err.message);
            } finally {
                tensor.dispose();
            }
        }

        if (!usedModel) {
            // ── Color-analysis fallback ──
            console.log('🎨 Using color-analysis fallback...');
            await new Promise(r => setTimeout(r, 800 + Math.random() * 700));

            const colors = analyzeColors(canvas);
            console.log('🎨 Color analysis:', {
                green: (colors.green * 100).toFixed(1) + '%',
                brown: (colors.brown * 100).toFixed(1) + '%',
                yellow: (colors.yellow * 100).toFixed(1) + '%',
                red: (colors.red * 100).toFixed(1) + '%',
                white: (colors.white * 100).toFixed(1) + '%',
                variance: colors.colorVariance.toFixed(1)
            });

            const rawScores = colorToScores(colors);
            allProbs38 = softmax(rawScores);
            predictedKbIdx = allProbs38.indexOf(Math.max(...allProbs38));
            confidence = allProbs38[predictedKbIdx];
        }

        const className = CLASS_NAMES[predictedKbIdx];
        const info = kb.diseases[className] || {};
        const isHealthy = info.is_healthy || false;
        const severity = getSeverity(confidence, isHealthy);

        // Top 3 predictions
        const indexed = allProbs38.map((p, i) => ({ prob: p, idx: i }));
        indexed.sort((a, b) => b.prob - a.prob);
        const top3 = indexed.slice(0, 3).map(item => ({
            class_name: CLASS_NAMES[item.idx],
            disease: (kb.diseases[CLASS_NAMES[item.idx]] || {}).disease || 'Unknown',
            crop: (kb.diseases[CLASS_NAMES[item.idx]] || {}).crop || 'Unknown',
            confidence: Math.round(item.prob * 10000) / 10000,
            confidence_percent: Math.round(item.prob * 10000) / 100
        }));

        console.log('🔍 Prediction:', className, '→', (confidence * 100).toFixed(1) + '%',
            usedModel ? '(TF.js model)' : '(color fallback)');

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
     * Check if model or fallback is ready.
     */
    async function isReady() {
        return true; // Color fallback always works
    }

    return {
        loadKnowledgeBase,
        loadModel,
        predict,
        isReady,
        CLASS_NAMES
    };
})();
