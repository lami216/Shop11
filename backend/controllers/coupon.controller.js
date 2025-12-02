import mongoose from "mongoose";
import Coupon from "../models/coupon.model.js";

const createHttpError = (status, message) => {
        const error = new Error(message);
        error.status = status;
        return error;
};

const normalizeCode = (value) => {
        if (typeof value !== "string") {
                return "";
        }

        return value.replaceAll(/\s+/g, "").toUpperCase();
};

const isValidCode = (code) => /^[A-Z0-9]+$/.test(code);

const parseDiscount = (value) => {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
                return null;
        }
        return numberValue;
};

const parseExpiresAt = (value) => {
        const expiresDate = new Date(value);
        if (Number.isNaN(expiresDate.getTime())) {
                return null;
        }
        return expiresDate;
};

const applySorting = (query, sortBy, sortOrder) => {
        const sortFields = {
                code: "code",
                discountPercentage: "discountPercentage",
                expiresAt: "expiresAt",
                isActive: "isActive",
                createdAt: "createdAt",
        };

        const sortField = sortFields[sortBy] || "createdAt";
        const direction = sortOrder === "asc" ? 1 : -1;

        return query.sort({ [sortField]: direction, _id: direction });
};

const buildFilter = (search) => {
        if (!search) {
                return {};
        }

        const sanitized = search.replaceAll(/[^A-Za-z0-9]/g, "").trim();

        if (!sanitized) {
                return {};
        }

        return { code: { $regex: sanitized, $options: "i" } };
};

const collectCodes = (rawCodes) => {
        if (Array.isArray(rawCodes)) {
                return rawCodes.filter((value) => typeof value === "string");
        }

        if (typeof rawCodes === "string" && rawCodes.trim()) {
                return [rawCodes];
        }

        return [];
};

const gatherNormalizedCodes = (body) => {
        const submittedCodes = collectCodes(body?.codes);
        const fallbackCode = typeof body?.code === "string" ? body.code : "";
        const inputs = submittedCodes.length ? submittedCodes : [fallbackCode];
        return inputs.map((value) => normalizeCode(value)).filter(Boolean);
};

const ensureDiscountWithinRange = (discount) => {
        if (!Number.isFinite(discount) || discount < 1 || discount > 90) {
                throw createHttpError(400, "Discount percentage must be between 1 and 90");
        }
        return discount;
};

const ensureFutureExpiry = (expiresAt) => {
        if (!expiresAt || expiresAt <= new Date()) {
                throw createHttpError(400, "Expiry must be in the future");
        }
        return expiresAt;
};

const ensureCodesProvided = (codes) => {
        if (!codes.length) {
                throw createHttpError(400, "Coupon code is required");
        }
};

const ensureCodesAreValid = (codes) => {
        if (codes.some((code) => !isValidCode(code))) {
                throw createHttpError(
                        400,
                        "Coupon code must contain uppercase letters and numbers only"
                );
        }
};

const ensureNoDuplicates = (codes) => {
        if (new Set(codes).size !== codes.length) {
                throw createHttpError(400, "Duplicate coupon codes provided");
        }
};

const ensureCodesAvailable = async (codes) => {
        const existingCoupons = await Coupon.find({ code: { $in: codes } }, { code: 1 }).lean();
        if (!existingCoupons.length) {
                return;
        }

        const existingCodes = existingCoupons.map((coupon) => coupon.code).join(", ");
        const message =
                codes.length === 1
                        ? "Coupon code already exists"
                        : `Coupon codes already exist: ${existingCodes}`;

        throw createHttpError(409, message);
};

const buildCouponPayload = ({ code, discount, expiresAt, isActive }) => ({
        code: String(code),
        discountPercentage: Number(discount),
        expiresAt: new Date(expiresAt),
        isActive: Boolean(isActive),
});

const normalizeOptionalCode = (value) => {
        if (value === undefined) {
                return undefined;
        }

        const code = normalizeCode(value);
        if (!code) {
                throw createHttpError(400, "Coupon code is required");
        }

        if (!isValidCode(code)) {
                throw createHttpError(
                        400,
                        "Coupon code must contain uppercase letters and numbers only"
                );
        }

        return code;
};

const normalizeOptionalDiscount = (value) => {
        if (value === undefined) {
                return undefined;
        }
        const discount = parseDiscount(value);
        return ensureDiscountWithinRange(discount);
};

const normalizeOptionalExpiry = (value) => {
        if (value === undefined) {
                return undefined;
        }
        const parsed = parseExpiresAt(value);
        return ensureFutureExpiry(parsed);
};

const ensureCodeUniqueness = async (code, couponId) => {
        const existingCoupon = await Coupon.findOne({ code, _id: { $ne: couponId } });
        if (existingCoupon) {
                throw createHttpError(409, "Coupon code already exists");
        }
};

export const createCoupon = async (req, res) => {
        try {
                const discount = ensureDiscountWithinRange(parseDiscount(req.body.discountPercentage));
                const expiresAt = ensureFutureExpiry(parseExpiresAt(req.body.expiresAt));
                const isActive = typeof req.body.isActive === "boolean" ? req.body.isActive : true;

                const normalizedCodes = gatherNormalizedCodes(req.body);
                ensureCodesProvided(normalizedCodes);
                ensureCodesAreValid(normalizedCodes);
                ensureNoDuplicates(normalizedCodes);

                await ensureCodesAvailable(normalizedCodes);

                const payloadBuilder = (code) =>
                        buildCouponPayload({ code, discount, expiresAt, isActive });

                if (normalizedCodes.length > 1) {
                        const couponsToCreate = normalizedCodes.map((code) => payloadBuilder(code));
                        const createdCoupons = await Coupon.insertMany(couponsToCreate);
                        return res.status(201).json({ coupons: createdCoupons });
                }

                const coupon = await Coupon.create(payloadBuilder(normalizedCodes[0]));

                return res.status(201).json(coupon);
        } catch (error) {
                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                if (error.code === 11000) {
                        return res.status(409).json({ message: "Coupon code already exists" });
                }
                console.log("Error in createCoupon controller", error.message);
                return res.status(500).json({ message: "Server error" });
        }
};

export const listCoupons = async (req, res) => {
        try {
const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50);
                const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
                const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "createdAt";
                const sortOrder = typeof req.query.sortOrder === "string" ? req.query.sortOrder : "desc";

                const filter = buildFilter(search);

                const total = await Coupon.countDocuments(filter);

                const query = Coupon.find(filter)
                        .skip((page - 1) * limit)
                        .limit(limit);

                applySorting(query, sortBy, sortOrder);

                const coupons = await query.lean();

                return res.json({
                        coupons,
                        pagination: {
                                total,
                                page,
                                limit,
                                totalPages: Math.max(1, Math.ceil(total / limit)),
                        },
                });
        } catch (error) {
                console.log("Error in listCoupons controller", error.message);
                return res.status(500).json({ message: "Server error" });
        }
};

export const getActiveCoupon = async (req, res) => {
        try {
                const coupon = await Coupon.findOne({
                        isActive: true,
                        expiresAt: { $gt: new Date() },
                })
                        .sort({ createdAt: -1, _id: -1 })
                        .lean();

                return res.json({ coupon: coupon || null });
        } catch (error) {
                console.log("Error in getActiveCoupon controller", error.message);
                return res.status(500).json({ message: "Server error" });
        }
};

export const validateCoupon = async (req, res) => {
        try {
                const code = normalizeCode(req.body.code);

                if (!code) {
                        return res.status(400).json({ message: "Coupon code is required" });
                }

                if (!isValidCode(code)) {
                        return res
                                .status(400)
                                .json({ message: "Coupon code must contain uppercase letters and numbers only" });
                }

                const coupon = await Coupon.findOne({ code }).lean();
                const isCouponActive = coupon?.isActive && coupon?.expiresAt > new Date();

                if (isCouponActive) {
                        return res.json({ coupon });
                }

                return res.status(404).json({ message: "Coupon is invalid or has expired" });
        } catch (error) {
                console.log("Error in validateCoupon controller", error.message);
                return res.status(500).json({ message: "Server error" });
        }
};

export const updateCoupon = async (req, res) => {
        try {
                const { id } = req.params;
                const couponId = typeof id === "string" ? id : "";

                if (!mongoose.Types.ObjectId.isValid(couponId)) {
                        return res.status(400).json({ message: "Invalid coupon id" });
                }

                const coupon = await Coupon.findById(couponId);

                if (!coupon) {
                        return res.status(404).json({ message: "Coupon not found" });
                }

const nextCode = normalizeOptionalCode(req.body.code);
const nextDiscount = normalizeOptionalDiscount(req.body.discountPercentage);
const nextExpiry = normalizeOptionalExpiry(req.body.expiresAt);
const nextIsActive =
req.body.isActive === undefined ? undefined : Boolean(req.body.isActive);

                if (nextCode !== undefined && nextCode !== coupon.code) {
                        await ensureCodeUniqueness(nextCode, coupon._id);
                        coupon.code = nextCode;
                }

                if (nextDiscount !== undefined) {
                        coupon.discountPercentage = nextDiscount;
                }

                if (nextExpiry !== undefined) {
                        coupon.expiresAt = nextExpiry;
                }

                if (nextIsActive !== undefined) {
                        coupon.isActive = nextIsActive;
                }

                await coupon.save();

                return res.json(coupon);
        } catch (error) {
                if (error.code === 11000) {
                        return res.status(409).json({ message: "Coupon code already exists" });
                }

                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                console.log("Error in updateCoupon controller", error.message);
                return res.status(500).json({ message: "Server error" });
        }
};
