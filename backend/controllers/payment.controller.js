const respondWithDeprecatedMessage = async (_req, res) =>
        res.status(410).json({
                message: "تم إيقاف التكامل مع Stripe. يرجى استخدام إتمام الطلب عبر واتساب بدلاً من ذلك.",
        });

export const createCheckoutSession = respondWithDeprecatedMessage;

export const checkoutSuccess = respondWithDeprecatedMessage;
