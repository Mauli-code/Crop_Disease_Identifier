/**
 * CropDoc AI — Image Preprocessing
 * Shared preprocessing utilities for both online and offline modes.
 * Model expects 224×224 RGB input with MobileNetV2 preprocessing baked in.
 */

const CropDocPreprocess = (() => {
    const IMG_SIZE = 224;

    /**
     * Load an image file and return as HTMLImageElement.
     */
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Resize image to IMG_SIZE x IMG_SIZE using canvas.
     * Returns the canvas element.
     */
    function resizeToCanvas(img) {
        const canvas = document.createElement('canvas');
        canvas.width = IMG_SIZE;
        canvas.height = IMG_SIZE;
        const ctx = canvas.getContext('2d');

        // Fill with black, then draw centered/scaled
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);

        // Maintain aspect ratio, center crop
        const scale = Math.max(IMG_SIZE / img.width, IMG_SIZE / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (IMG_SIZE - w) / 2;
        const y = (IMG_SIZE - h) / 2;

        ctx.drawImage(img, x, y, w, h);
        return canvas;
    }

    /**
     * Convert canvas to TensorFlow.js tensor [1, 224, 224, 3].
     * No manual normalization — MobileNetV2 preprocess_input is baked into the model.
     * The model expects raw pixel values [0, 255].
     */
    function canvasToTensor(canvas) {
        if (typeof tf === 'undefined' || !tf.browser || !tf.browser.fromPixels) {
            console.warn('⚠️ TensorFlow.js not available for tensor conversion');
            return null;
        }

        return tf.tidy(() => {
            const tensor = tf.browser.fromPixels(canvas)
                .toFloat()
                .expandDims(0); // [1, 224, 224, 3]
            return tensor;
        });
    }

    /**
     * Full preprocessing pipeline: file → tensor.
     */
    async function preprocessFile(file) {
        const img = await loadImage(file);
        const canvas = resizeToCanvas(img);
        const tensor = canvasToTensor(canvas);
        if (!tensor) {
            throw new Error('Failed to convert canvas to tensor - TensorFlow.js may be unavailable');
        }
        return { tensor, canvas, img };
    }

    /**
     * Get preview URL for a file.
     */
    function getPreviewURL(file) {
        return URL.createObjectURL(file);
    }

    return {
        IMG_SIZE,
        loadImage,
        resizeToCanvas,
        canvasToTensor,
        preprocessFile,
        getPreviewURL
    };
})();
