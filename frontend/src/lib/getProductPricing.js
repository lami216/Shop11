const resolveBasePrice = (product) => {
        const basePriceInput =
                product.originalPrice !== undefined && product.originalPrice !== null
                        ? product.originalPrice
                        : product.price;
        return Number(basePriceInput) || 0;
};

const resolveRawDiscount = (product) => {
        const rawDiscount = Number(product.discountPercentage);
        return Number.isNaN(rawDiscount) ? 0 : rawDiscount;
};

const resolveDiscountedInput = (product) => {
        if (product.discountedPrice !== undefined && product.discountedPrice !== null) {
                const discounted = Number(product.discountedPrice);
                return Number.isNaN(discounted) ? undefined : discounted;
        }

        const hasLegacyPrice =
                product.isDiscounted &&
                product.originalPrice !== undefined &&
                product.originalPrice !== null &&
                product.price !== undefined &&
                product.price !== null;

        if (hasLegacyPrice) {
                const fallback = Number(product.price);
                return Number.isNaN(fallback) ? undefined : fallback;
        }

        return undefined;
};

const computeDiscountedTotals = ({ price, rawDiscount, discountedInput, isDiscountedFlag }) => {
        let normalizedDiscount = rawDiscount;
        let discountedPrice = discountedInput;
        let isDiscounted = Boolean(isDiscountedFlag) && normalizedDiscount > 0;

        if (discountedPrice === undefined) {
                discountedPrice = isDiscounted
                        ? Number((price - price * (normalizedDiscount / 100)).toFixed(2))
                        : price;
        }

        if (price > 0 && discountedPrice < price && normalizedDiscount <= 0) {
                normalizedDiscount = Number((((price - discountedPrice) / price) * 100).toFixed(2));
        }

        if (price <= 0) {
                        discountedPrice = 0;
        }

        isDiscounted = isDiscounted || discountedPrice < price;

        if (!isDiscounted) {
                normalizedDiscount = 0;
                discountedPrice = price;
        }

        return {
                discountedPrice,
                isDiscounted,
                discountPercentage: normalizedDiscount > 0 ? Number(normalizedDiscount.toFixed(2)) : 0,
        };
};

export const getProductPricing = (product = {}) => {
        const price = resolveBasePrice(product);
        const rawDiscount = resolveRawDiscount(product);
        const discountedInput = resolveDiscountedInput(product);
        const totals = computeDiscountedTotals({
                price,
                rawDiscount,
                discountedInput,
                isDiscountedFlag: product.isDiscounted,
        });

        return {
                price,
                ...totals,
        };
};

export default getProductPricing;
