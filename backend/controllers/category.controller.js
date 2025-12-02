import Category from "../models/category.model.js";
import cloudinary from "../lib/cloudinary.js";

const isCloudinaryConfigured = () =>
        Boolean(
                process.env.CLOUDINARY_CLOUD_NAME &&
                        process.env.CLOUDINARY_API_KEY &&
                        process.env.CLOUDINARY_API_SECRET
        );

const createHttpError = (status, message) => {
        const error = new Error(message);
        error.status = status;
        return error;
};

const uploadCategoryImage = async (image) => {
        if (!image || typeof image !== "string") {
                throw new Error("INVALID_IMAGE_FORMAT");
        }

        const isDataUri = image.startsWith("data:");

        if (!isDataUri) {
                throw new Error("INVALID_IMAGE_FORMAT");
        }

        if (!isCloudinaryConfigured()) {
                return {
                        secure_url: image,
                        public_id: null,
                };
        }

        return await cloudinary.uploader.upload(image, {
                folder: "categories",
        });
};

const slugify = (value) => {
        if (value === undefined || value === null) {
                return "";
        }

        const normalized = value
                .toString()
                .normalize("NFKD")
                .replaceAll(/[\u0300-\u036f]/g, "");

        const slug = normalized
                .replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
                .trim()
                .replaceAll(/[\s_-]+/g, "-")
                .replaceAll(/(?:^-+)|(?:-+$)/g, "")
                .toLowerCase();

        return slug;
};

const generateUniqueSlug = async (baseName, ignoreId = null) => {
        const baseSlug = slugify(baseName) || "category";
        let uniqueSlug = baseSlug;
        let counter = 1;

        while (true) {
                const existing = await Category.findOne({ slug: uniqueSlug });
                if (!existing || (ignoreId && existing._id.equals(ignoreId))) {
                        return uniqueSlug;
                }
                counter += 1;
                uniqueSlug = `${baseSlug}-${counter}`;
        }
};

const serializeCategory = (category) => {
        if (!category) return category;
        return typeof category.toObject === "function" ? category.toObject() : category;
};

const sanitizeCreateCategoryPayload = (body) => {
        const payload = body && typeof body === "object" ? body : {};
        const rawName = payload.name;
        const rawDescription = payload.description;
        const rawImage = payload.image;

        if (typeof rawName !== "string" || !rawName.trim()) {
                throw createHttpError(400, "Name is required");
        }

        if (rawDescription !== undefined && typeof rawDescription !== "string") {
                throw createHttpError(400, "Invalid category description");
        }

        if (typeof rawImage !== "string") {
                throw createHttpError(400, "Category image is required");
        }

        return {
                trimmedName: rawName.trim(),
                trimmedDescription: typeof rawDescription === "string" ? rawDescription.trim() : "",
                imageContent: rawImage.toString(),
        };
};

const handleImageUpload = async (imageContent) => {
        try {
                return await uploadCategoryImage(imageContent);
        } catch (uploadError) {
                if (uploadError.message === "INVALID_IMAGE_FORMAT") {
                        throw createHttpError(400, "Invalid category image format");
                }
                throw uploadError;
        }
};

const ensureUploadSuccess = (uploadResult) => {
        if (!uploadResult?.secure_url) {
                throw createHttpError(500, "Failed to process category image");
        }

        const secureUrl =
                typeof uploadResult.secure_url === "string"
                        ? uploadResult.secure_url
                        : String(uploadResult.secure_url);
        let publicId = null;

        if (typeof uploadResult.public_id === "string") {
                publicId = uploadResult.public_id;
        } else if (uploadResult.public_id) {
                publicId = String(uploadResult.public_id);
        }

        return {
                secureUrl,
                publicId,
        };
};

const applyNameUpdate = async (category, name) => {
        if (typeof name !== "string" || !name.trim()) {
                return;
        }

        const trimmed = name.trim();
        if (trimmed !== category.name) {
                category.slug = await generateUniqueSlug(trimmed, category._id);
        }
        category.name = trimmed;
};

const applyDescriptionUpdate = (category, description) => {
        if (typeof description === "string") {
                category.description = description.trim();
        }
};

const cleanupCategoryImage = async (category) => {
        if (category.imagePublicId && isCloudinaryConfigured()) {
                try {
                        await cloudinary.uploader.destroy(category.imagePublicId);
                } catch (cleanupError) {
                        console.log("Failed to delete previous category image", cleanupError.message);
                }
        }
};

const updateCategoryImage = async (category, image) => {
        if (typeof image !== "string" || !image.startsWith("data:")) {
                return;
        }

        const uploadResult = ensureUploadSuccess(await handleImageUpload(image));
        await cleanupCategoryImage(category);
        category.imageUrl = uploadResult.secureUrl;
        category.imagePublicId = uploadResult.publicId;
};

export const getCategories = async (req, res) => {
        try {
                const categories = await Category.find({}).lean();
                res.json({ categories });
        } catch (error) {
                console.log("Error in getCategories controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const createCategory = async (req, res) => {
        try {
                const { trimmedName, trimmedDescription, imageContent } =
                        sanitizeCreateCategoryPayload(req.body);
                const uploadResult = ensureUploadSuccess(await handleImageUpload(imageContent));
                const slug = await generateUniqueSlug(trimmedName);

                const categoryData = {
                        name: trimmedName.toString(),
                        description: trimmedDescription.toString(),
                        slug: slug.toString(),
                        imageUrl: uploadResult.secureUrl,
                        imagePublicId: uploadResult.publicId,
                };

                const category = await Category.create(categoryData);

                res.status(201).json(serializeCategory(category));
        } catch (error) {
                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                console.log("Error in createCategory controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const updateCategory = async (req, res) => {
        try {
                const { id } = req.params;
                const { name, description, image } = req.body;

                const category = await Category.findById(id);

                if (!category) {
                        return res.status(404).json({ message: "Category not found" });
                }

                await applyNameUpdate(category, name);
                applyDescriptionUpdate(category, description);
                await updateCategoryImage(category, image);

                await category.save();

                res.json(serializeCategory(category));
        } catch (error) {
                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                console.log("Error in updateCategory controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};

export const deleteCategory = async (req, res) => {
        try {
                const { id } = req.params;
                const category = await Category.findById(id);

                if (!category) {
                        return res.status(404).json({ message: "Category not found" });
                }

                if (category.imagePublicId && isCloudinaryConfigured()) {
                        try {
                                await cloudinary.uploader.destroy(category.imagePublicId);
                        } catch (cleanupError) {
                                console.log("Failed to delete category image", cleanupError.message);
                        }
                }

                await Category.findByIdAndDelete(id);

                res.json({ message: "Category deleted successfully" });
        } catch (error) {
                console.log("Error in deleteCategory controller", error.message);
                res.status(500).json({ message: "Server error", error: error.message });
        }
};
