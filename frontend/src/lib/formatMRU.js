export const formatMRU = (value, options = {}) => {
        const normalizedValue = Number(value);
        const shouldRound = options.roundToInteger ?? false;
        const safeValue = Number.isNaN(normalizedValue) ? 0 : normalizedValue;

        return new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "MRU",
                minimumFractionDigits: shouldRound ? 0 : undefined,
                maximumFractionDigits: shouldRound ? 0 : undefined,
        }).format(shouldRound ? Math.round(safeValue) : safeValue);
};

export default formatMRU;
