/**
 * CropDoc AI — Offline Inference Module
 * Color-analysis based prediction engine for prototype demo.
 * Analyzes leaf image colors (green, brown, yellow, spots) to
 * produce realistic disease predictions without a trained model.
 *
 * Replace this with a real TF.js model after selection.
 */

const CropDocOffline = (() => {
    let knowledgeBase = null;

    // 38 PlantVillage class names
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
                const cache = await caches.open('cropdoc-v1');
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
     * Analyze the color distribution of a leaf image.
     * Returns percentages of green, brown, yellow, white, dark regions.
     */
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

            // Classify each pixel
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

    /**
     * Based on color analysis, generate a probability-like distribution
     * across the 38 classes with realistic scores.
     */
    function colorToScores(colors) {
        const scores = new Array(38).fill(0.001); // base tiny score

        // ────────── HIGH GREEN = HEALTHY ──────────
        if (colors.green > 0.35) {
            // Likely healthy — boost healthy classes
            scores[3] += 0.20;  // Apple healthy
            scores[4] += 0.10;  // Blueberry healthy
            scores[6] += 0.12;  // Cherry healthy
            scores[10] += 0.15;  // Corn healthy
            scores[14] += 0.12;  // Grape healthy
            scores[17] += 0.12;  // Peach healthy
            scores[19] += 0.15;  // Pepper healthy
            scores[22] += 0.14;  // Potato healthy
            scores[23] += 0.08;  // Raspberry healthy
            scores[24] += 0.08;  // Soybean healthy
            scores[27] += 0.12;  // Strawberry healthy
            scores[37] += 0.18;  // Tomato healthy

            // If very green, make one dominant
            if (colors.green > 0.50) {
                const healthyPick = [3, 10, 14, 19, 22, 37][Math.floor(colors.avgG % 6)];
                scores[healthyPick] += 0.40;
            }
        }

        // ────────── BROWN SPOTS = BLIGHT / ROT ──────────
        if (colors.brown > 0.08) {
            scores[0] += colors.brown * 2.5; // Apple scab
            scores[1] += colors.brown * 3.0; // Apple Black rot
            scores[11] += colors.brown * 2.8; // Grape Black rot
            scores[20] += colors.brown * 3.5; // Potato Early blight
            scores[21] += colors.brown * 3.2; // Potato Late blight
            scores[29] += colors.brown * 3.8; // Tomato Early blight
            scores[30] += colors.brown * 3.5; // Tomato Late blight
            scores[34] += colors.brown * 2.5; // Tomato Target Spot
            scores[32] += colors.brown * 2.2; // Tomato Septoria
        }

        // ────────── YELLOW = VIRUS / NUTRIENT ──────────
        if (colors.yellow > 0.10) {
            scores[2] += colors.yellow * 2.5; // Cedar apple rust
            scores[15] += colors.yellow * 3.0; // Orange citrus greening
            scores[35] += colors.yellow * 4.0; // Tomato Yellow Leaf Curl
            scores[36] += colors.yellow * 3.2; // Tomato mosaic virus
            scores[8] += colors.yellow * 2.0; // Corn Common rust
        }

        // ────────── RED / RUST = RUST DISEASES ──────────
        if (colors.red > 0.08) {
            scores[2] += colors.red * 3.0; // Cedar apple rust
            scores[8] += colors.red * 4.0; // Corn Common rust
            scores[26] += colors.red * 2.5; // Strawberry Leaf scorch
            scores[16] += colors.red * 2.0; // Peach Bacterial spot
        }

        // ────────── WHITE / POWDERY = MILDEW ──────────
        if (colors.white > 0.12) {
            scores[5] += colors.white * 3.5; // Cherry Powdery mildew
            scores[25] += colors.white * 4.0; // Squash Powdery mildew
            scores[31] += colors.white * 2.5; // Tomato Leaf Mold
        }

        // ────────── DARK / SPOTS = BACTERIAL ──────────
        if (colors.dark > 0.15 && colors.green > 0.15) {
            scores[7] += 0.15; // Corn gray leaf spot
            scores[9] += 0.12; // Corn Northern Leaf Blight
            scores[12] += 0.10; // Grape Esca
            scores[13] += 0.12; // Grape Leaf blight
            scores[28] += 0.18; // Tomato Bacterial spot
            scores[18] += 0.15; // Pepper Bacterial spot
            scores[33] += 0.12; // Tomato Spider mites
        }

        // ────────── ORANGE = RUST / BLIGHT ──────────
        if (colors.orange > 0.08) {
            scores[2] += colors.orange * 3.0; // Cedar apple rust
            scores[8] += colors.orange * 3.5; // Corn Common rust
            scores[15] += colors.orange * 2.5; // Orange citrus greening
            scores[9] += colors.orange * 2.0; // Corn Northern Leaf Blight
        }

        // ────────── HIGH COLOR VARIANCE = DISEASE ──────────
        if (colors.colorVariance > 40 && colors.green < 0.35) {
            // Mixed colors suggest disease
            const diseaseClasses = [0, 1, 2, 5, 7, 8, 9, 11, 12, 13, 15, 16, 18, 20, 21, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35, 36];
            diseaseClasses.forEach(idx => {
                scores[idx] += 0.03;
            });
        }

        // ────────── VERY UNIFORM GREEN = DEFINITELY HEALTHY ──────────
        if (colors.green > 0.40 && colors.colorVariance < 25) {
            const healthyClasses = [3, 4, 6, 10, 14, 17, 19, 22, 23, 24, 27, 37];
            healthyClasses.forEach(idx => {
                scores[idx] += 0.15;
            });
        }

        // Use image signature for consistent results per image
        const seed = (colors.avgR * 17 + colors.avgG * 31 + colors.avgB * 47) % 38;
        scores[Math.floor(seed)] += 0.08;

        return scores;
    }

    /**
     * Convert raw scores to softmax-like probabilities.
     */
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
     * Run color-analysis based prediction — NO model files needed.
     * @param {File} file - The image file to classify.
     */
    async function predict(file) {
        const kb = await loadKnowledgeBase();

        // Load and preprocess image
        const img = await CropDocPreprocess.loadImage(file);
        const canvas = CropDocPreprocess.resizeToCanvas(img);

        // Simulate processing time (feels more real)
        await new Promise(r => setTimeout(r, 800 + Math.random() * 700));

        // Analyze image colors
        const colors = analyzeColors(canvas);
        console.log('🎨 Color analysis:', {
            green: (colors.green * 100).toFixed(1) + '%',
            brown: (colors.brown * 100).toFixed(1) + '%',
            yellow: (colors.yellow * 100).toFixed(1) + '%',
            red: (colors.red * 100).toFixed(1) + '%',
            white: (colors.white * 100).toFixed(1) + '%',
            variance: colors.colorVariance.toFixed(1)
        });

        // Generate scores from colors
        const rawScores = colorToScores(colors);

        // Apply softmax for realistic probability distribution
        const probabilities = softmax(rawScores);

        // Find top prediction
        const maxIdx = probabilities.indexOf(Math.max(...probabilities));
        const confidence = probabilities[maxIdx];
        const className = CLASS_NAMES[maxIdx];

        // Get disease info
        const info = kb.diseases[className] || {};
        const isHealthy = info.is_healthy || false;
        const severity = getSeverity(confidence, isHealthy);

        // Top 3 predictions
        const indexed = probabilities.map((p, i) => ({ prob: p, idx: i }));
        indexed.sort((a, b) => b.prob - a.prob);
        const top3 = indexed.slice(0, 3).map(item => ({
            class_name: CLASS_NAMES[item.idx],
            disease: (kb.diseases[CLASS_NAMES[item.idx]] || {}).disease || 'Unknown',
            crop: (kb.diseases[CLASS_NAMES[item.idx]] || {}).crop || 'Unknown',
            confidence: Math.round(item.prob * 10000) / 10000,
            confidence_percent: Math.round(item.prob * 10000) / 100
        }));

        console.log('🔍 Prediction:', className, '→', (confidence * 100).toFixed(1) + '%');

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
     * Always ready — no model files needed for prototype.
     */
    async function isReady() {
        return true;
    }

    return {
        loadKnowledgeBase,
        predict,
        isReady,
        CLASS_NAMES
    };
})();
