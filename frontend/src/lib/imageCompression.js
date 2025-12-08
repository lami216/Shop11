const MAX_COMPRESSED_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

const readFileAsDataURL = (file) =>
        new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
                reader.onerror = reject;
                reader.readAsDataURL(file);
        });

const blobToDataUrl = (blob) =>
        new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
                reader.onerror = reject;
                reader.readAsDataURL(blob);
        });

const loadImageFromDataUrl = (dataUrl) =>
        new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = reject;
                image.src = dataUrl;
        });

const getScaledDimensions = (width, height, maxWidth, maxHeight) => {
        const widthScale = maxWidth ? maxWidth / width : 1;
        const heightScale = maxHeight ? maxHeight / height : 1;
        const scale = Math.min(1, widthScale, heightScale);

        return {
                width: Math.max(1, Math.round(width * scale)),
                height: Math.max(1, Math.round(height * scale)),
        };
};

const renderToCanvasBlob = async (image, width, height, mimeType, quality) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);

        const dataUrl = canvas.toDataURL(mimeType, quality);
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        return { blob, dataUrl };
};

const updateFileExtension = (fileName, mimeType) => {
        const extension = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
        if (!fileName) return `compressed.${extension}`;

        const lastDotIndex = fileName.lastIndexOf(".");
        if (lastDotIndex === -1) return `${fileName}.${extension}`;
        return `${fileName.substring(0, lastDotIndex)}.${extension}`;
};

export const compressImageFile = async (file, options = {}) => {
        const {
                maxSizeBytes = MAX_COMPRESSED_IMAGE_SIZE,
                maxWidth = 1200,
                maxHeight = 1200,
                initialQuality = 0.8,
                minQuality = 0.5,
                mimeType = "image/jpeg",
        } = options;

        const originalDataUrl = await readFileAsDataURL(file);
        const image = await loadImageFromDataUrl(originalDataUrl);

        let { width, height } = getScaledDimensions(image.width, image.height, maxWidth, maxHeight);
        let quality = initialQuality;
        let attempts = 0;
        let lastResult = null;

        while (attempts < 12) {
                const result = await renderToCanvasBlob(image, width, height, mimeType, quality);
                lastResult = result;

                if (result.blob.size <= maxSizeBytes) {
                        break;
                }

                if (quality > minQuality + 0.05) {
                        quality = Math.max(minQuality, quality - 0.1);
                } else {
                        width = Math.max(300, Math.floor(width * 0.9));
                        height = Math.max(300, Math.floor(height * 0.9));
                        quality = Math.max(minQuality, quality - 0.05);
                }

                attempts += 1;
        }

        if (!lastResult || lastResult.blob.size > maxSizeBytes) {
                throw new Error("Unable to compress image below the size limit.");
        }

        const compressedFile = new File([lastResult.blob], updateFileExtension(file.name, mimeType), {
                type: mimeType,
                lastModified: Date.now(),
        });

        const dataUrl = await blobToDataUrl(lastResult.blob);

        return {
                file: compressedFile,
                dataUrl,
                size: lastResult.blob.size,
                width,
                height,
        };
};

export { MAX_COMPRESSED_IMAGE_SIZE };
