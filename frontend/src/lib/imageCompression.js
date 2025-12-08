const MAX_COMPRESSED_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

const readFileAsDataURL = (file) =>
        new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
                reader.onerror = reject;
                reader.readAsDataURL(file);
        });

const loadImageFromDataUrl = (dataUrl) =>
        new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = reject;
                image.src = dataUrl;
        });

const calculateDataUrlSize = (dataUrl) => {
        const base64 = dataUrl.split(",")[1] ?? "";
        return Math.ceil((base64.length * 3) / 4);
};

const getScaledDimensions = (width, height, maxWidth, maxHeight) => {
        const widthScale = maxWidth ? maxWidth / width : 1;
        const heightScale = maxHeight ? maxHeight / height : 1;
        const scale = Math.min(1, widthScale, heightScale);

        return {
                width: Math.max(1, Math.round(width * scale)),
                height: Math.max(1, Math.round(height * scale)),
        };
};

const drawToCanvas = (image, width, height, quality) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);

        return canvas.toDataURL("image/jpeg", quality);
};

export const compressImageFile = async (file, options = {}) => {
        const {
                maxSizeBytes = MAX_COMPRESSED_IMAGE_SIZE,
                maxWidth = 1920,
                maxHeight = 1920,
                initialQuality = 0.9,
                minQuality = 0.5,
        } = options;

        const originalDataUrl = await readFileAsDataURL(file);
        const image = await loadImageFromDataUrl(originalDataUrl);

        if (file.size <= maxSizeBytes && calculateDataUrlSize(originalDataUrl) <= maxSizeBytes) {
                return originalDataUrl;
        }

        let { width, height } = getScaledDimensions(image.width, image.height, maxWidth, maxHeight);
        let quality = initialQuality;
        let compressedDataUrl = drawToCanvas(image, width, height, quality);

        const withinLimit = () => calculateDataUrlSize(compressedDataUrl) <= maxSizeBytes;

        let attempts = 0;
        while (!withinLimit() && attempts < 10) {
                if (quality > minQuality) {
                        quality = Math.max(minQuality, quality - 0.1);
                } else {
                        width = Math.max(400, Math.floor(width * 0.9));
                        height = Math.max(400, Math.floor(height * 0.9));
                }

                compressedDataUrl = drawToCanvas(image, width, height, quality);
                attempts += 1;
        }

        if (!withinLimit()) {
                compressedDataUrl = drawToCanvas(image, Math.max(200, Math.floor(width * 0.8)), Math.max(200, Math.floor(height * 0.8)), minQuality);
        }

        if (!withinLimit()) {
                throw new Error("Unable to compress image below the size limit.");
        }

        return compressedDataUrl;
};

export { calculateDataUrlSize, MAX_COMPRESSED_IMAGE_SIZE };
