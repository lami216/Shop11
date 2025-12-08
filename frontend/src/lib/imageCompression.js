// أقصى حجم للصورة بعد الضغط: 2MB
const MAX_COMPRESSED_IMAGE_SIZE = 2 * 1024 * 1024;

// قراءة ملف كـ Data URL
const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// تحويل Blob إلى Data URL
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// تحميل الصورة من Data URL
const loadImageFromDataUrl = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

// حساب أبعاد الصورة بعد التصغير بدون تشويه النسبة
const getScaledDimensions = (width, height, maxWidth, maxHeight) => {
  const widthScale = maxWidth ? maxWidth / width : 1;
  const heightScale = maxHeight ? maxHeight / height : 1;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

// رسم الصورة على canvas ثم تحويلها إلى Blob + dataUrl
const renderToCanvasBlob = (image, width, height, mimeType, quality) =>
  new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          resolve({ blob: null, dataUrl: "" });
          return;
        }
        const dataUrl = await blobToDataUrl(blob);
        resolve({ blob, dataUrl });
      },
      mimeType,
      quality
    );
  });

/**
 * ضغط صورة وترجيع:
 *  - file: ملف الصورة بعد الضغط (Blob)
 *  - dataUrl: نسخة Base64 لعرض المعاينة
 */
const compressImageFile = async (
  file,
  {
    maxSizeBytes = MAX_COMPRESSED_IMAGE_SIZE,
    maxWidth = 1600,
    maxHeight = 1600,
    mimeType = "image/jpeg",
    initialQuality = 0.9,
    minQuality = 0.4,
    qualityStep = 0.1,
  } = {}
) => {
  // لو الملف مش صورة
  if (!file.type.startsWith("image/")) {
    const dataUrl = await readFileAsDataURL(file);
    return { file, dataUrl };
  }

  const originalDataUrl = await readFileAsDataURL(file);
  const image = await loadImageFromDataUrl(originalDataUrl);

  const { width, height } = getScaledDimensions(
    image.width,
    image.height,
    maxWidth,
    maxHeight
  );

  let currentQuality = initialQuality;
  let bestBlob = null;
  let bestDataUrl = originalDataUrl;

  // محاولة تقليل الجودة تدريجياً
  while (currentQuality >= minQuality) {
    const { blob, dataUrl } = await renderToCanvasBlob(
      image,
      width,
      height,
      mimeType,
      currentQuality
    );

    if (!blob) break;

    bestBlob = blob;
    bestDataUrl = dataUrl;

    if (blob.size <= maxSizeBytes) {
      break;
    }

    currentQuality -= qualityStep;
  }

  if (!bestBlob) {
    return { file, dataUrl: originalDataUrl };
  }

  const compressedFile = new File([bestBlob], file.name, { type: mimeType });

  return {
    file: compressedFile,
    dataUrl: bestDataUrl,
  };
};

export { compressImageFile, MAX_COMPRESSED_IMAGE_SIZE };
