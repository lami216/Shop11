import mongoose from "mongoose";
import { google } from "googleapis";
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
const REQUIRED_SHEET_HEADERS = [
        "ORDER_ID",
        "DATE",
        "NAME",
        "NUMBER_PHONE",
        "ADDRESS",
        "PRODUCT",
        "STATUS",
        "TOTAL_PRICE",
];
const DEFAULT_SHEET_STATUS = "NEW";

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

const buildSheetsClient = () => {
        const { GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
        if (!GOOGLE_PROJECT_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
                throw new Error("Missing Google Sheets credentials");
        }

        const auth = new google.auth.JWT({
                email: GOOGLE_CLIENT_EMAIL,
                key: GOOGLE_PRIVATE_KEY.replaceAll("\\n", "\n"),
                scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        return google.sheets({ version: "v4", auth });
};

const resolveSheetInfo = async (sheetsClient, spreadsheetId) => {
        const response = await sheetsClient.spreadsheets.get({
                spreadsheetId,
                fields: "sheets.properties.sheetId,sheets.properties.title",
        });
        const sheets = response.data.sheets
                ?.map((sheet) => sheet.properties)
                .filter(Boolean);
        if (!sheets?.length) {
                throw new Error("No sheets found in spreadsheet");
        }
        const defaultSheet =
                sheets.find((sheet) => sheet.title === "Sheet1") || sheets[0];
        return {
                sheetId: defaultSheet.sheetId,
                sheetName: defaultSheet.title,
        };
};

const normalizeHeader = (value) =>
        (typeof value === "string" ? value.trim().toUpperCase().replaceAll(/\s+/g, "_") : "");

const HEADER_ALIASES = {
        ORDER_ID: ["ORDER_ID", "ORDERID", "ORDER_ID"],
        DATE: ["DATE"],
        NAME: ["NAME"],
        NUMBER_PHONE: ["NUMBER_PHONE", "PHONE", "PHONE_NUMBER", "NUMBERPHONE"],
        ADDRESS: ["ADDRESS", "CITY", "ADDRESS_OR_CITY"],
        PRODUCT: ["PRODUCT", "QUANTITY_SUMMARY", "PRODUCT_OR_QUANTITY_SUMMARY"],
        STATUS: ["STATUS", "ORDER_STATUS"],
        TOTAL_PRICE: ["TOTAL_PRICE", "TOTAL", "ORDER_TOTAL"],
};

const matchRequiredHeader = (value) => {
        const normalized = normalizeHeader(value);
        if (!normalized) {
                return null;
        }
        return (
                Object.keys(HEADER_ALIASES).find((key) =>
                        HEADER_ALIASES[key].includes(normalized)
                ) || null
        );
};

const getUsedRangeSize = async (sheetsClient, spreadsheetId, sheetName) => {
        const response = await sheetsClient.spreadsheets.values.get({
                spreadsheetId,
                range: sheetName,
        });
        const values = response.data.values || [];
        const rowCount = Math.max(values.length, 1);
        const columnCount = Math.max(
                values.reduce((max, row) => Math.max(max, row.length), 0),
                REQUIRED_SHEET_HEADERS.length
        );
        return { rowCount, columnCount };
};

const ensureSheetSchema = async (sheetsClient, spreadsheetId, sheetInfo) => {
        const { sheetId, sheetName } = sheetInfo;
        const headerRange = `${sheetName}!1:1`;
        const existing = await sheetsClient.spreadsheets.values.get({
                spreadsheetId,
                range: headerRange,
        });
        const existingHeaders = existing.data.values?.[0] || [];
        const headerKeys = existingHeaders.map((header, index) => {
                const match = matchRequiredHeader(header);
                return match || `EXTRA_${index}`;
        });

        const requests = [];
        let insertedColumns = 0;

        if (!headerKeys.includes("ORDER_ID")) {
                requests.push({
                        insertDimension: {
                                range: {
                                        sheetId,
                                        dimension: "COLUMNS",
                                        startIndex: 0,
                                        endIndex: 1,
                                },
                                inheritFromBefore: false,
                        },
                });
                headerKeys.unshift("ORDER_ID");
                insertedColumns += 1;
        }

        REQUIRED_SHEET_HEADERS.forEach((headerKey, targetIndex) => {
                let currentIndex = headerKeys.indexOf(headerKey);
                if (currentIndex === -1) {
                        requests.push({
                                insertDimension: {
                                        range: {
                                                sheetId,
                                                dimension: "COLUMNS",
                                                startIndex: targetIndex,
                                                endIndex: targetIndex + 1,
                                        },
                                        inheritFromBefore: false,
                                },
                        });
                        headerKeys.splice(targetIndex, 0, headerKey);
                        insertedColumns += 1;
                        return;
                }

                if (currentIndex === targetIndex) {
                        return;
                }

                requests.push({
                        moveDimension: {
                                source: {
                                        sheetId,
                                        dimension: "COLUMNS",
                                        startIndex: currentIndex,
                                        endIndex: currentIndex + 1,
                                },
                                destinationIndex: targetIndex,
                        },
                });
                const [moved] = headerKeys.splice(currentIndex, 1);
                headerKeys.splice(targetIndex, 0, moved);
        });

        const usedRange = await getUsedRangeSize(sheetsClient, spreadsheetId, sheetName);
        const columnCount = usedRange.columnCount + insertedColumns;
        const rowCount = usedRange.rowCount;

        const headerFormat = {
                textFormat: { bold: true },
                backgroundColor: { red: 0, green: 0.6, blue: 0 },
        };
        requests.push({
                repeatCell: {
                        range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 0,
                                endColumnIndex: columnCount,
                        },
                        cell: {
                                userEnteredFormat: headerFormat,
                        },
                        fields: "userEnteredFormat(textFormat,backgroundColor)",
                },
        });
        requests.push({
                updateCells: {
                        range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 0,
                                endColumnIndex: REQUIRED_SHEET_HEADERS.length,
                        },
                        rows: [
                                {
                                        values: REQUIRED_SHEET_HEADERS.map((header) => ({
                                                userEnteredValue: { stringValue: header },
                                                userEnteredFormat: headerFormat,
                                        })),
                                },
                        ],
                        fields: "userEnteredValue,userEnteredFormat(textFormat,backgroundColor)",
                },
        });

        requests.push({
                updateSheetProperties: {
                        properties: {
                                sheetId,
                                gridProperties: {
                                        frozenRowCount: 1,
                                },
                                rightToLeft: true,
                        },
                        fields: "gridProperties.frozenRowCount,rightToLeft",
                },
        });

        requests.push({
                repeatCell: {
                        range: {
                                sheetId,
                                startRowIndex: 1,
                                endRowIndex: rowCount,
                                startColumnIndex: 1,
                                endColumnIndex: 2,
                        },
                        cell: {
                                userEnteredFormat: {
                                        numberFormat: {
                                                type: "DATE_TIME",
                                                pattern: "yyyy-mm-dd hh:mm:ss",
                                        },
                                },
                        },
                        fields: "userEnteredFormat.numberFormat",
                },
        });

        requests.push({
                updateBorders: {
                        range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: rowCount,
                                startColumnIndex: 0,
                                endColumnIndex: columnCount,
                        },
                        top: { style: "SOLID" },
                        bottom: { style: "SOLID" },
                        left: { style: "SOLID" },
                        right: { style: "SOLID" },
                        innerHorizontal: { style: "SOLID" },
                        innerVertical: { style: "SOLID" },
                },
        });

        requests.push({
                autoResizeDimensions: {
                        dimensions: {
                                sheetId,
                                dimension: "COLUMNS",
                                startIndex: 0,
                                endIndex: columnCount,
                        },
                },
        });

        if (requests.length) {
                await sheetsClient.spreadsheets.batchUpdate({
                        spreadsheetId,
                        requestBody: { requests },
                });
        }
};

const calculateFallbackTotalPrice = (items, totalDiscountAmount) => {
        const safeItems = Array.isArray(items) ? items : [];
        const subtotal = safeItems.reduce((sum, item) => {
                const lineSubtotal = Number(item?.subtotal);
                if (Number.isFinite(lineSubtotal)) {
                        return sum + lineSubtotal;
                }
                const unitPrice = Number(item?.price) || 0;
                const quantity = Number(item?.quantity) || 0;
                return sum + unitPrice * quantity;
        }, 0);
        const discount = Math.max(0, Number(totalDiscountAmount) || 0);
        const total = Math.max(0, subtotal - discount);
        return Number(total.toFixed(2));
};

const appendOrderToSheet = async ({
        orderId,
        customerName,
        phone,
        address,
        items,
        status,
        totalPrice,
        totalDiscountAmount,
}) => {
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        if (!spreadsheetId) {
                throw new Error("Missing Google Sheet ID");
        }

        const sheetsClient = buildSheetsClient();
        const sheetInfo = await resolveSheetInfo(sheetsClient, spreadsheetId);
        await ensureSheetSchema(sheetsClient, spreadsheetId, sheetInfo);

        const safeItems = Array.isArray(items) ? items : [];
        const productSummary = safeItems
                .map((item) => `${item.name} x${item.quantity}`)
                .join(", ");
        const formattedDate = new Date()
                .toISOString()
                .replace("T", " ")
                .replace("Z", "")
                .replace(".000", "");
        const normalizedStatus = normalizeString(status).toUpperCase();
        const statusValue = ["NEW", "PENDING"].includes(normalizedStatus)
                ? normalizedStatus
                : DEFAULT_SHEET_STATUS;
        let resolvedTotalPrice = Number(totalPrice);
        if (!Number.isFinite(resolvedTotalPrice)) {
                console.warn("Missing total price for sheet append, falling back to computed total", {
                        orderId,
                });
                resolvedTotalPrice = calculateFallbackTotalPrice(safeItems, totalDiscountAmount);
        }
        if (!Number.isFinite(resolvedTotalPrice)) {
                console.error("Unable to resolve total price for sheet append, defaulting to 0", {
                        orderId,
                });
                resolvedTotalPrice = 0;
        }

        const rowValues = [
                orderId,
                formattedDate,
                customerName,
                phone,
                address,
                productSummary || "-",
                statusValue || DEFAULT_SHEET_STATUS,
                resolvedTotalPrice,
        ];

        if (process.env.NODE_ENV !== "production") {
                console.log("Appending order row to Google Sheet", {
                        rowValues,
                        status: statusValue || DEFAULT_SHEET_STATUS,
                        totalPrice: resolvedTotalPrice,
                });
        }

        await sheetsClient.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetInfo.sheetName}!A1`,
                valueInputOption: "USER_ENTERED",
                insertDataOption: "INSERT_ROWS",
                requestBody: {
                        values: [rowValues],
                },
        });
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

                if (!Number.isFinite(total) || total <= 0) {
                        throw createHttpError(400, "Total price is required");
                }

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
                let sheetLogged = false;

                try {
                        await appendOrderToSheet({
                                orderId: order.orderNumber || order._id?.toString?.() || order._id,
                                customerName: safeCustomerName,
                                phone: safePhone,
                                address: safeAddress,
                                items: itemsWithDetails,
                                status: order.status,
                                totalPrice: order.total,
                                totalDiscountAmount: order.totalDiscountAmount,
                        });
                        sheetLogged = true;
                } catch (sheetError) {
                        console.error("Failed to log order to Google Sheet", sheetError);
                }

                const orderForResponse = mapOrderResponse(order.toObject());

                return res.status(201).json({
                        orderId: order._id,
                        orderNumber: order.orderNumber,
                        subtotal: orderForResponse.subtotal,
                        total: orderForResponse.total,
                        coupon: orderForResponse.coupon,
                        totalDiscountAmount: orderForResponse.totalDiscountAmount,
                        sheetLogged,
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
