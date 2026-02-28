/**
 * CropDoc AI — Image Preprocessing
 * Shared preprocessing utilities for both online and offline modes.
 */

const CropDocPreprocess = (() => {
    const IMG_SIZE = 128;

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
     * Convert canvas to normalized TensorFlow.js tensor [1, 128, 128, 3].
     * Pixel values normalized to [0, 1].
     */
    function canvasToTensor(canvas) {
        return tf.tidy(() => {
            const tensor = tf.browser.fromPixels(canvas)
                .toFloat()
                .div(tf.scalar(255.0))
                .expandDims(0); // [1, 128, 128, 3]
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
