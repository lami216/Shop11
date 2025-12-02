import mongoose from "mongoose";
import { redis } from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import Product from "../models/product.model.js";

const MAX_PRODUCT_IMAGES = 3;

const createHttpError = (status, message) => {
        const error = new Error(message);
        error.status = status;
        return error;
};

const toBoolean = (value) => {
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return value !== 0;
        if (typeof value === "string") {
                const normalized = value.trim().toLowerCase();
                return ["true", "1", "yes", "on"].includes(normalized);
        }
        return false;
};

const normalizeDiscountSettings = ({
        rawIsDiscounted,
        rawDiscountPercentage,
        fallbackPercentage = 0,
        fallbackIsDiscounted = false,
}) => {
        const hasFlag = rawIsDiscounted !== undefined && rawIsDiscounted !== null;
        const hasPercentage =
                rawDiscountPercentage !== undefined &&
                rawDiscountPercentage !== null &&
                rawDiscountPercentage !== "";

        const isDiscounted = hasFlag ? toBoolean(rawIsDiscounted) : fallbackIsDiscounted;
        const percentageValue = hasPercentage
                ? Number(rawDiscountPercentage)
                : Number(fallbackPercentage);

        if (isDiscounted) {
                if (Number.isNaN(percentageValue)) {
                        return { error: "Discount percentage must be a valid number" };
                }

                if (percentageValue <= 0 || percentageValue >= 100) {
                        return { error: "Discount percentage must be between 1 and 99" };
                }

                return {
                        isDiscounted: true,
                        discountPercentage: Number(percentageValue.toFixed(2)),
                };
        }

        return { isDiscounted: false, discountPercentage: 0 };
};

const finalizeProductPayload = (product) => {
        if (!product) return product;

        const price = Number(product.price) || 0;
        const percentage = Number(product.discountPercentage) || 0;
        const isDiscounted = Boolean(product.isDiscounted) && percentage > 0;
        const effectivePercentage = isDiscounted ? Number(percentage.toFixed(2)) : 0;
        const discountedPrice = isDiscounted
                ? Number((price - price * (effectivePercentage / 100)).toFixed(2))
                : price;

        return {
                ...product,
                isDiscounted,
                discountPercentage: effectivePercentage,
                discountedPrice,
        };
};

const serializeProduct = (product) => {
        if (!product) return product;
        const serialized =
                typeof product.toObject === "function"
                        ? product.toObject({ virtuals: true })
                        : product;

        return finalizeProductPayload(serialized);
};

const regexSpecialChars = /[.*+?^${}()|[\]\\]/g;

const escapeRegexValue = (value) => {
        return value.replaceAll(regexSpecialChars, String.raw`\$&`);
};

const ensureNonEmptyTrimmed = (value, message) => {
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) {
                throw createHttpError(400, message);
        }
        return trimmed;
};

const ensureValidPriceValue = (price) => {
        const numericPrice = Number(price);
        if (Number.isNaN(numericPrice)) {
                throw createHttpError(400, "Price must be a valid number");
        }
        return numericPrice;
};

const ensureCategoryValue = (category) => {
        return ensureNonEmptyTrimmed(category, "Category is required");
};

const validateCreateImages = (images) => {
        if (!Array.isArray(images) || images.length === 0) {
                throw createHttpError(400, "At least one product image is required");
        }
        if (images.length > MAX_PRODUCT_IMAGES) {
                throw createHttpError(400, "You can upload up to 3 images per product");
        }
        const sanitized = images
                .filter((image) => typeof image === "string" && image.trim().length > 0)
                .slice(0, MAX_PRODUCT_IMAGES);
        if (!sanitized.length) {
                throw createHttpError(400, "Provided images are not valid");
        }
        return sanitized;
};

const prepareDiscountSettings = (options) => {
        const discountSettings = normalizeDiscountSettings(options);
        if (discountSettings.error) {
                throw createHttpError(400, discountSettings.error);
        }
        return discountSettings;
};

const cleanupUploadedImages = async (images) => {
        if (!images.length) {
                return;
        }
        const uploadedPublicIds = images.map((image) => image.public_id).filter(Boolean);
        if (!uploadedPublicIds.length) {
                return;
        }
        try {
                        await cloudinary.api.delete_resources(uploadedPublicIds);
        } catch (cleanupError) {
                console.log("Error cleaning up uploaded images after failure", cleanupError);
        }
};

const uploadProductImages = async (images) => {
        const uploadedImages = [];
        try {
                for (const base64Image of images) {
                        const uploadResult = await cloudinary.uploader.upload(base64Image, {
                                folder: "products",
                        });
                        uploadedImages.push({
                                url: uploadResult.secure_url,
                                public_id: uploadResult.public_id,
                        });
                }
                return uploadedImages;
        } catch (uploadError) {
                await cleanupUploadedImages(uploadedImages);
                throw uploadError;
        }
};

const buildCategoryAssignments = (categoryValue) => {
        const payload = {
                category: categoryValue,
                categorySlug: categoryValue,
        };
        if (mongoose.Types.ObjectId.isValid(categoryValue)) {
                payload.categoryId = new mongoose.Types.ObjectId(categoryValue);
        }
        return payload;
};

const collectExistingImageIds = (images) => {
        if (!Array.isArray(images)) {
                return [];
        }
        return images
                .map((image) => {
                        if (typeof image === "string") {
                                return image;
                        }

                        if (typeof image?.public_id === "string") {
                                return image.public_id;
                        }

                        return null;
                })
                .filter(Boolean);
};

const sanitizeNewImagesInput = (images) => {
        if (!Array.isArray(images)) {
                return [];
        }
        return images.filter((image) => typeof image === "string" && image.trim().length > 0);
};

const splitCurrentImages = (currentImages, retainedIds) => {
        const images = Array.isArray(currentImages) ? currentImages : [];
        return {
                retainedImages: images.filter((image) => retainedIds.includes(image.public_id)),
                removedImages: images.filter((image) => !retainedIds.includes(image.public_id)),
        };
};

const ensureImageCountsForUpdate = (retainedImages, newImages) => {
        const totalImagesCount = retainedImages.length + newImages.length;
        if (totalImagesCount === 0) {
                throw createHttpError(400, "At least one product image is required");
        }
        if (totalImagesCount > MAX_PRODUCT_IMAGES) {
                throw createHttpError(400, "You can upload up to 3 images per product");
        }
};

const deleteImagesFromCloudinary = async (images) => {
        const publicIdsToDelete = images.map((image) => image.public_id).filter(Boolean);
        if (!publicIdsToDelete.length) {
                return;
        }
        try {
                await cloudinary.api.delete_resources(publicIdsToDelete, {
                        type: "upload",
                        resource_type: "image",
                });
        } catch (cloudinaryError) {
                console.log("Error deleting removed images from Cloudinary", cloudinaryError);
        }
};

const uploadNewProductImages = async (newImages) => {
        if (!newImages.length) {
                return [];
        }
        const uploadedImages = [];
        try {
                for (const base64Image of newImages) {
                        const uploadResult = await cloudinary.uploader.upload(base64Image, {
                                folder: "products",
                        });
                        uploadedImages.push({
                                url: uploadResult.secure_url,
                                public_id: uploadResult.public_id,
                        });
                }
                return uploadedImages;
        } catch (uploadError) {
                await cleanupUploadedImages(uploadedImages);
                throw uploadError;
        }
};

const orderRetainedImages = (existingImageIds, retainedImages) => {
        const lookup = retainedImages.reduce((accumulator, image) => {
                accumulator[image.public_id] = image;
                return accumulator;
        }, {});
        return existingImageIds.map((publicId) => lookup[publicId]).filter(Boolean);
};

const arrangeFinalImages = (existingImageIds, retainedImages, uploadedImages, coverPreference) => {
        const orderedRetainedImages = orderRetainedImages(existingImageIds, retainedImages);
        const coverSettings =
                coverPreference && typeof coverPreference === "object"
                        ? coverPreference
                        : { source: null };
        const coverSource =
                typeof coverSettings.source === "string"
                        ? coverSettings.source.toLowerCase()
                        : null;

        if (coverSource === "new" && uploadedImages.length) {
                const [coverImage, ...restUploaded] = uploadedImages;
                return [coverImage, ...orderedRetainedImages, ...restUploaded];
        }

        if (orderedRetainedImages.length) {
                const [coverImage, ...restRetained] = orderedRetainedImages;
                return [coverImage, ...restRetained, ...uploadedImages];
        }

        return [...uploadedImages];
};

export const getAllProducts = async (req, res) => {
        try {
                const products = await Product.find({}).lean({ virtuals: true });
                res.json({ products: products.map(finalizeProductPayload) });
        } catch (error) {
                console.log("Error in getAllProducts controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const getFeaturedProducts = async (req, res) => {
        try {
                let featuredProducts = await redis.get("featured_products");
                if (featuredProducts) {
                        const parsed = JSON.parse(featuredProducts);
                        return res.json(parsed.map(finalizeProductPayload));
                }

                featuredProducts = await Product.find({ isFeatured: true }).lean({ virtuals: true });

                if (!featuredProducts?.length) {
                        return res.status(404).json({ message: "No featured products found" });
                }

                const finalized = featuredProducts.map(finalizeProductPayload);

                await redis.set("featured_products", JSON.stringify(finalized));

                res.json(finalized);
        } catch (error) {
                console.log("Error in getFeaturedProducts controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const searchProducts = async (req, res) => {
        try {
                const limit = 24;
                const q = String(req.query.q || "").trim();
                const rawCategory = typeof req.query.category === "string" ? req.query.category.trim() : "";

                const filters = [];

                if (q) {
                        const escaped = escapeRegexValue(q);
                        const pattern = escaped.replaceAll(/\s+/g, String.raw`\s`);
                        filters.push({ name: { $regex: pattern, $options: "i" } });
                }

                if (rawCategory) {
                        const categoryConditions = [{ categorySlug: rawCategory }, { category: rawCategory }];

                        if (mongoose.Types.ObjectId.isValid(rawCategory)) {
                                categoryConditions.push({ categoryId: new mongoose.Types.ObjectId(rawCategory) });
                        }

                        filters.push({ $or: categoryConditions });
                }

                let query = {};
                if (filters.length === 1) {
                        query = filters[0];
                } else if (filters.length > 1) {
                        query = { $and: filters };
                }

                const projection = {
                        name: 1,
                        price: 1,
                        image: 1,
                        slug: 1,
                        images: 1,
                        discountedPrice: 1,
                        isDiscounted: 1,
                        discountPercentage: 1,
                        category: 1,
                };

                const sort = { popularity: -1, createdAt: -1 };

                const [items, count] = await Promise.all([
                        Product.find(query)
                                .sort(sort)
                                .limit(limit)
                                .select(projection)
                                .collation({ locale: "ar", strength: 1 })
                                .lean({ virtuals: true }),
                        Product.countDocuments(query).collation({ locale: "ar", strength: 1 }),
                ]);

                const normalizedItems = items.map(finalizeProductPayload);

                res.json({ items: normalizedItems, count });
        } catch (error) {
                console.log("Error in searchProducts controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const createProduct = async (req, res) => {
        try {
                const { name, description, price, category, images, isDiscounted, discountPercentage } =
                        req.body;

                const trimmedName = ensureNonEmptyTrimmed(name, "Product name is required");
                const trimmedDescription = ensureNonEmptyTrimmed(
                        description,
                        "Product description is required"
                );
                const sanitizedImages = validateCreateImages(images);
                const numericPrice = ensureValidPriceValue(price);
                const normalizedCategory = ensureCategoryValue(category);
                const discountSettings = prepareDiscountSettings({
                        rawIsDiscounted: isDiscounted,
                        rawDiscountPercentage: discountPercentage,
                });
                const uploadedImages = await uploadProductImages(sanitizedImages);
                const categoryAssignments = buildCategoryAssignments(normalizedCategory);

                const productPayload = {
                        name: trimmedName,
                        description: trimmedDescription,
                        price: numericPrice,
                        image: uploadedImages[0]?.url,
                        images: uploadedImages,
                        ...categoryAssignments,
                        isDiscounted: discountSettings.isDiscounted,
                        discountPercentage: discountSettings.discountPercentage,
                };

                const product = await Product.create(productPayload);

                res.status(201).json(serializeProduct(product));
        } catch (error) {
                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                console.log("Error in createProduct controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const updateProduct = async (req, res) => {
        try {
                const { id } = req.params;
                const {
                        name,
                        description,
                        price,
                        category,
                        existingImages,
                        newImages,
                        cover,
                        isDiscounted,
                        discountPercentage,
                } = req.body;

                const product = await Product.findById(id);

                if (!product) {
                        return res.status(404).json({ message: "Product not found" });
                }

                const trimmedName = ensureNonEmptyTrimmed(name ?? product.name, "Product name is required");
                const trimmedDescription = ensureNonEmptyTrimmed(
                        description ?? product.description,
                        "Product description is required"
                );
                const existingImageIds = collectExistingImageIds(existingImages);
                const sanitizedNewImages = sanitizeNewImagesInput(newImages);
                const { retainedImages, removedImages } = splitCurrentImages(
                        product.images,
                        existingImageIds
                );

                ensureImageCountsForUpdate(retainedImages, sanitizedNewImages);
                await deleteImagesFromCloudinary(removedImages);
                const uploadedImages = await uploadNewProductImages(sanitizedNewImages);
                const finalImages = arrangeFinalImages(
                        existingImageIds,
                        retainedImages,
                        uploadedImages,
                        cover
                );
                const numericPrice = ensureValidPriceValue(
                        price === undefined || price === null ? product.price : price
                );
                const nextCategory =
                        typeof category === "string" && category.trim().length
                                ? category.trim()
                                : product.category;
                const discountSettings = prepareDiscountSettings({
                        rawIsDiscounted: isDiscounted,
                        rawDiscountPercentage: discountPercentage,
                        fallbackIsDiscounted: product.isDiscounted,
                        fallbackPercentage: product.discountPercentage,
                });
                const categoryAssignments = buildCategoryAssignments(nextCategory);

                product.name = trimmedName;
                product.description = trimmedDescription;
                product.price = numericPrice;
                product.category = categoryAssignments.category;
                product.categorySlug = categoryAssignments.categorySlug;
                product.categoryId = categoryAssignments.categoryId || null;
                product.images = finalImages.length ? finalImages : product.images;
                product.image = finalImages[0]?.url || product.image;
                product.isDiscounted = discountSettings.isDiscounted;
                product.discountPercentage = discountSettings.discountPercentage;

                const updatedProduct = await product.save();

                if (updatedProduct.isFeatured) {
                        await updateFeaturedProductsCache();
                }

                res.json(serializeProduct(updatedProduct));
        } catch (error) {
                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                console.log("Error in updateProduct controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const deleteProduct = async (req, res) => {
        try {
                const product = await Product.findById(req.params.id);

                if (!product) {
                        return res.status(404).json({ message: "Product not found" });
                }

                const publicIds = Array.isArray(product.images)
                        ? product.images
                                  .map((image) => (typeof image === "object" ? image.public_id : null))
                                  .filter(Boolean)
                        : [];

                if (publicIds.length) {
                        try {
                                await cloudinary.api.delete_resources(publicIds, {
                                        type: "upload",
                                        resource_type: "image",
                                });
                        } catch (cloudinaryError) {
                                console.log("Error deleting images from Cloudinary", cloudinaryError);
                        }
                }

                await Product.findByIdAndDelete(req.params.id);

                if (product.isFeatured) {
                        await updateFeaturedProductsCache();
                }

                res.json({ message: "Product and images deleted successfully" });
        } catch (error) {
                console.log("Error in deleteProduct controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const getProductById = async (req, res) => {
        try {
                const product = await Product.findById(req.params.id);

                if (!product) {
                        return res.status(404).json({ message: "Product not found" });
                }

                res.json(serializeProduct(product));
        } catch (error) {
                console.log("Error in getProductById controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

const recommendationProjectionStage = {
        $project: {
                _id: 1,
                name: 1,
                description: 1,
                image: 1,
                images: 1,
                price: 1,
                category: 1,
                isFeatured: 1,
                isDiscounted: 1,
                discountPercentage: 1,
        },
};

const normalizeRecommendationQuery = (query) => ({
        productId: typeof query.productId === "string" ? query.productId.trim() : "",
        category: typeof query.category === "string" ? query.category.trim() : "",
});

const buildExcludedIds = (productId) => {
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
                return [new mongoose.Types.ObjectId(productId)];
        }
        return [];
};

const resolveTargetCategory = async (category, productId) => {
        if (category) return category;
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) return null;

        const product = await Product.findById(productId).select("category");
        return product ? product.category : null;
};

const buildCategoryMatch = (targetCategory, excludedIds) => ({
        category: targetCategory,
        ...(excludedIds.length ? { _id: { $nin: excludedIds } } : {}),
});

const fetchCategoryRecommendations = (targetCategory, excludedIds, sampleSize) => {
        if (!targetCategory) return Promise.resolve([]);

        return Product.aggregate([
                { $match: buildCategoryMatch(targetCategory, excludedIds) },
                { $sample: { size: sampleSize } },
                recommendationProjectionStage,
        ]);
};

const fetchFallbackRecommendations = (excludedIds, sampleSize) => {
        const fallbackMatch = excludedIds.length ? { _id: { $nin: excludedIds } } : null;
        const pipeline = [
                ...(fallbackMatch ? [{ $match: fallbackMatch }] : []),
                { $sample: { size: sampleSize } },
                recommendationProjectionStage,
        ];

        return Product.aggregate(pipeline);
};

export const getRecommendedProducts = async (req, res) => {
        try {
                const { productId, category } = normalizeRecommendationQuery(req.query);
                const sampleSize = 4;
                const excludedIds = buildExcludedIds(productId);
                const targetCategory = await resolveTargetCategory(category, productId);

                let recommendations = await fetchCategoryRecommendations(
                        targetCategory,
                        excludedIds,
                        sampleSize,
                );

                if (!recommendations.length) {
                        recommendations = await fetchFallbackRecommendations(excludedIds, sampleSize);
                }

                res.json(recommendations.map(finalizeProductPayload));
        } catch (error) {
                console.log("Error in getRecommendedProducts controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const getProductsByCategory = async (req, res) => {
        const { category } = req.params;
        try {
                const categoryValue =
                        typeof category === "string" ? decodeURIComponent(category).trim() : "";

                const isValidCategory = /^[\p{L}\p{N}\s_.-]+$/u.test(categoryValue);

                if (!categoryValue || !isValidCategory) {
                        return res.status(400).json({ message: "Invalid category" });
                }

                const products = await Product.find({ category: categoryValue }).lean({ virtuals: true });
                res.json({ products: products.map(finalizeProductPayload) });
        } catch (error) {
                console.log("Error in getProductsByCategory controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const toggleFeaturedProduct = async (req, res) => {
        try {
                const product = await Product.findById(req.params.id);
                if (product) {
                        product.isFeatured = !product.isFeatured;
                        const updatedProduct = await product.save();
                        await updateFeaturedProductsCache();
                        res.json(serializeProduct(updatedProduct));
                } else {
                        res.status(404).json({ message: "Product not found" });
                }
        } catch (error) {
                console.log("Error in toggleFeaturedProduct controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

async function updateFeaturedProductsCache() {
        try {
                const featuredProducts = await Product.find({ isFeatured: true }).lean({ virtuals: true });
                await redis.set(
                        "featured_products",
                        JSON.stringify(featuredProducts.map(finalizeProductPayload))
                );
        } catch (error) {
                console.log("error in update cache function", error.message);
        }
}
