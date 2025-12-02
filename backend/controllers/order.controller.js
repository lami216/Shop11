import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Coupon from "../models/coupon.model.js";

const PAID_STATUSES = new Set(["paid", "paid_whatsapp", "delivered"]);
const ORDER_STATUS_OPTIONS = new Set([
        "pending",
        "paid",
        "paid_whatsapp",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
]);

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");
const normalizePhone = (value) => (typeof value === "string" ? value.replaceAll(/\D/g, "") : "");
const sanitizeSearchTerm = (value) => value.replaceAll(/[^\p{L}\p{N}\s-]/gu, "").trim();
const createHttpError = (status, message) => {
        const error = new Error(message);
        error.status = status;
        return error;
};
const computeUnitPrice = (product) => {
        const price = Number(product.price) || 0;
        if (!product.isDiscounted) {
                return price;
        }

        const discountPercentage = Number(product.discountPercentage) || 0;
        if (discountPercentage <= 0) {
                return price;
        }

        const discountValue = price * (discountPercentage / 100);
        const discounted = price - discountValue;
        return Number(discounted.toFixed(2));
};


const normalizeCoupon = (coupon) => {
        if (!coupon?.code) {
                return null;
        }

        return {
                code: coupon.code,
                discountPercentage: Number(coupon.discountPercentage) || 0,
                discountAmount: Number(coupon.discountAmount) || 0,
        };
};

const mapOrderResponse = (order) => {
        const couponFromLegacyArray = Array.isArray(order.coupons) ? order.coupons[0] : null;
        const coupon = normalizeCoupon(order.coupon || couponFromLegacyArray);

        return {
                ...order,
                subtotal: Number(order.subtotal || 0),
                total: Number(order.total || 0),
                totalDiscountAmount: Number(order.totalDiscountAmount || 0),
                coupon,
                coupons: coupon ? [coupon] : [],
        };
};

const appendLogEntry = (order, entry) => {
        order.log.push({
                timestamp: new Date(),
                ...entry,
        });
};

const collectCouponInputs = (body) => {
        const couponCodeInputs = [];
        if (Array.isArray(body?.couponCodes)) {
                couponCodeInputs.push(...body.couponCodes.filter((value) => typeof value === "string"));
        }
        if (!couponCodeInputs.length) {
                const fallbackCode = normalizeString(body?.couponCode || body?.coupon?.code);
                if (fallbackCode) {
                        couponCodeInputs.push(fallbackCode);
                }
        }
        return couponCodeInputs;
};

const extractWhatsAppPayload = (body = {}) => {
        const items = Array.isArray(body.items) ? body.items : [];
        const couponInputs = collectCouponInputs(body);
        const normalizedCouponCodes = couponInputs
                .map((value) => normalizeString(value))
                .filter(Boolean)
                .map((value) => value.replaceAll(/\s+/g, "").toUpperCase());
        return {
                items,
                customerName: normalizeString(body.customerName),
                phone: normalizePhone(body.phone),
                address: normalizeString(body.address),
                primaryCouponCode: normalizedCouponCodes[0] || "",
        };
};

const ensureOrderBasics = ({ items, customerName, phone, address }) => {
        if (!items.length) {
                throw createHttpError(400, "Order must contain at least one item");
        }
        if (!customerName) {
                throw createHttpError(400, "Customer name is required");
        }
        if (!phone) {
                throw createHttpError(400, "Phone number is required");
        }
        if (!address) {
                throw createHttpError(400, "Address is required");
        }
};

const normalizeOrderItems = (items) =>
        items
                .map((item) => {
                        const candidate = [item.productId, item._id].find((value) =>
                                mongoose.Types.ObjectId.isValid(value)
                        );
                        if (!candidate) {
                                return null;
                        }
const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
                        return {
                                productId: candidate.toString(),
                                quantity,
                        };
                })
                .filter(Boolean);

const fetchProductsByIds = async (productIds) => {
        if (!productIds.length) {
                throw createHttpError(400, "Invalid product list");
        }
        const products = await Product.find({ _id: { $in: productIds } }).lean();
        if (products.length !== productIds.length) {
                throw createHttpError(400, "One or more products are invalid");
        }
        return products;
};

const buildOrderItemsWithDetails = (normalizedItems, products) => {
        const productLookup = products.reduce((accumulator, product) => {
                accumulator[product._id.toString()] = product;
                return accumulator;
        }, {});

        const itemsWithDetails = [];
        let subtotal = 0;

        normalizedItems.forEach((item) => {
                const product = productLookup[item.productId];
                if (!product) {
                        throw createHttpError(400, "Unable to match product for order item");
                }
                const unitPrice = computeUnitPrice(product);
                const lineSubtotal = Number((unitPrice * item.quantity).toFixed(2));
                subtotal += lineSubtotal;
                itemsWithDetails.push({
                        productId: product._id,
                        name: product.name,
                        price: unitPrice,
                        quantity: item.quantity,
                        subtotal: lineSubtotal,
                });
        });

        if (!itemsWithDetails.length) {
                throw createHttpError(400, "Order items are invalid");
        }

        return { itemsWithDetails, subtotal: Number(subtotal.toFixed(2)) };
};

const calculateCouponTotals = async (primaryCouponCode, subtotal) => {
        if (!primaryCouponCode) {
                return { total: subtotal, totalDiscountAmount: 0, appliedCoupon: null };
        }

        const coupon = await Coupon.findOne({
                code: primaryCouponCode,
                isActive: true,
                expiresAt: { $gt: new Date() },
        }).lean();

        if (!coupon) {
                throw createHttpError(400, "One or more coupons are invalid or expired");
        }

        const discountPercentage = Number(coupon.discountPercentage) || 0;
        const totalDiscountAmount =
                discountPercentage > 0 && subtotal > 0
                        ? Number(((subtotal * Math.min(discountPercentage, 100)) / 100).toFixed(2))
                        : 0;

        const total = Number(Math.max(0, subtotal - totalDiscountAmount).toFixed(2));

        return {
                total,
                totalDiscountAmount,
                appliedCoupon: {
                        code: coupon.code,
                        discountPercentage,
                        discountAmount: totalDiscountAmount,
                },
        };
};

const fetchOrderByIdOrThrow = async (id) => {
        const order = await Order.findById(id);
        if (!order) {
                throw createHttpError(404, "Order not found");
        }
        return order;
};

const ensureStatusChangeIsAllowed = (status) => {
        if (!ORDER_STATUS_OPTIONS.has(status)) {
                throw createHttpError(400, "Invalid status");
        }
        if (status === "cancelled") {
                throw createHttpError(400, "Use the cancel endpoint to cancel orders");
        }
};

const applyStatusUpdate = (order, status, reason, user) => {
        const previousStatus = order.status;
        order.status = status;
        if (PAID_STATUSES.has(status) && !order.paidAt) {
                order.paidAt = new Date();
        }
        if (status === "delivered") {
                order.reconciliationNeeded = false;
        }
        appendLogEntry(order, {
                action: "status_change",
                statusBefore: previousStatus,
                statusAfter: status,
                reason: normalizeString(reason) || undefined,
                changedBy: user?._id,
                changedByName: user?.name,
        });
};

const cancelOrderInternally = (order, reason, user) => {
        const previousStatus = order.status;
        order.status = "cancelled";
        order.optimisticPaid = false;
        order.canceledAt = new Date();
        order.canceledBy = user?._id;
        order.canceledByName = user?.name;
        order.reconciliationNeeded = true;
        appendLogEntry(order, {
                action: "cancelled",
                statusBefore: previousStatus,
                statusAfter: "cancelled",
                reason: normalizeString(reason) || undefined,
                changedBy: user?._id,
                changedByName: user?.name,
        });
};

const buildOrderListFilters = ({ status, search }) => {
        const filters = {};

        if (typeof status === "string") {
                const normalizedStatus = status.trim();
                if (normalizedStatus && ORDER_STATUS_OPTIONS.has(normalizedStatus)) {
                        filters.status = normalizedStatus;
                }
        }

        if (typeof search === "string") {
                const normalizedSearch = sanitizeSearchTerm(search.trim());
                if (normalizedSearch) {
                        const escapedSearch = normalizedSearch.replaceAll(
                                /[.*+?^${}()|[\]\\]/g,
                                String.raw`\$&`
                        );
                        const orFilters = [
                                { customerName: { $regex: escapedSearch, $options: "i" } },
                                { phone: { $regex: normalizedSearch.replaceAll(/\s+/g, ""), $options: "i" } },
                        ];
                        const parsedNumber = Number(normalizedSearch);
                        if (Number.isFinite(parsedNumber)) {
                                orFilters.push({ orderNumber: parsedNumber });
                        }
                        filters.$or = orFilters;
                }
        }

        return filters;
};

export const createWhatsAppOrder = async (req, res) => {
        try {
                const payload = extractWhatsAppPayload(req.body);
                ensureOrderBasics(payload);
                const normalizedItems = normalizeOrderItems(payload.items);
                const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
                const products = await fetchProductsByIds(productIds);
                const { itemsWithDetails, subtotal } = buildOrderItemsWithDetails(
                        normalizedItems,
                        products
                );
const { total, totalDiscountAmount, appliedCoupon } = await calculateCouponTotals(
payload.primaryCouponCode,
subtotal
);

const safeCustomerName = normalizeString(payload.customerName);
const safePhone = normalizePhone(payload.phone);
const safeAddress = normalizeString(payload.address);

const orderData = {
items: itemsWithDetails,
subtotal,
total,
coupon: appliedCoupon,
totalDiscountAmount,
customerName: safeCustomerName,
phone: safePhone,
address: safeAddress,
paymentMethod: "whatsapp",
status: "paid_whatsapp",
paidAt: new Date(),
optimisticPaid: true,
reconciliationNeeded: true,
createdFrom: "checkout_whatsapp",
log: [
{
action: "created",
statusAfter: "paid_whatsapp",
reason: "Order captured via WhatsApp checkout",
changedByName: "checkout_whatsapp",
timestamp: new Date(),
},
],
};

const order = await Order.create(orderData);

                const orderForResponse = mapOrderResponse(order.toObject());

                return res.status(201).json({
                        orderId: order._id,
                        orderNumber: order.orderNumber,
                        subtotal: orderForResponse.subtotal,
                        total: orderForResponse.total,
                        coupon: orderForResponse.coupon,
                        totalDiscountAmount: orderForResponse.totalDiscountAmount,
                });
        } catch (error) {
                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                console.log("Error in createWhatsAppOrder", error);
                return res.status(500).json({ message: "Failed to create order" });
        }
};

export const listOrders = async (req, res) => {
        try {
                const filters = buildOrderListFilters({
                        status: req.query?.status,
                        search: req.query?.search,
                });

                const orders = await Order.find(filters)
                        .sort({ createdAt: -1 })
                        .lean();

                return res.json({
                        orders: orders.map(mapOrderResponse),
                });
        } catch (error) {
                console.log("Error in listOrders", error);
                return res.status(500).json({ message: "Failed to load orders" });
        }
};

export const updateOrderStatus = async (req, res) => {
        try {
                const { id } = req.params;
                const { status, reason } = req.body || {};

                ensureStatusChangeIsAllowed(status);
                const order = await fetchOrderByIdOrThrow(id);

                if (order.status === status) {
                        return res.json({ order: mapOrderResponse(order.toObject()) });
                }

                applyStatusUpdate(order, status, reason, req.user);
                await order.save();

                const updatedOrder = await Order.findById(order._id).lean();

                return res.json({ order: mapOrderResponse(updatedOrder) });
        } catch (error) {
                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                console.log("Error in updateOrderStatus", error);
                return res.status(500).json({ message: "Failed to update order status" });
        }
};

export const cancelOrder = async (req, res) => {
        try {
                const { id } = req.params;
                const { reason } = req.body || {};

                const order = await fetchOrderByIdOrThrow(id);
                if (order.status === "cancelled") {
                        return res.json({ order: mapOrderResponse(order.toObject()) });
                }

                cancelOrderInternally(order, reason, req.user);
                await order.save();

                const updatedOrder = await Order.findById(order._id).lean();

                return res.json({ order: mapOrderResponse(updatedOrder) });
        } catch (error) {
                if (error.status) {
                        return res.status(error.status).json({ message: error.message });
                }
                console.log("Error in cancelOrder", error);
                return res.status(500).json({ message: "Failed to cancel order" });
        }
};
