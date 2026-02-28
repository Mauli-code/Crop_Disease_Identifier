/**
 * CropDoc AI — Online Inference Module
 * Sends images to FastAPI backend for server-side prediction.
 */

const CropDocOnline = (() => {
    const API_URL = '/predict';
    const TIMEOUT_MS = 15000; // 15 second timeout

    /**
     * Send image to backend /predict endpoint.
     * @param {File} file - The image file to upload.
     * @returns {Object} Prediction result from server.
     */
    async function predict(file) {
        const formData = new FormData();
        formData.append('file', file);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Server error: ${response.status}`);
            }

            const result = await response.json();
            result.mode = 'online';
            return result;

        } catch (err) {
            clearTimeout(timeoutId);

            if (err.name === 'AbortError') {
                throw new Error('Server request timed out. Falling back to offline mode.');
            }
            throw err;
        }
    }

    /**
     * Check if backend server is available.
     */
    async function isAvailable() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch('/api/health', {
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();
            return data.status === 'ok' && data.model_loaded;
        } catch {
            return false;
        }
    }

    return {
        predict,
        isAvailable
    };
})();
