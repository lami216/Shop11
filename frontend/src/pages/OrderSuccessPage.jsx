import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { formatMRU } from "../lib/formatMRU";
import { formatNumberEn } from "../lib/formatNumberEn";

const OrderSuccessPage = () => {
        const location = useLocation();
        const navigate = useNavigate();
        const order = location.state?.order;

        useEffect(() => {
                if (!order) {
                        navigate("/", { replace: true });
                }
        }, [navigate, order]);

        if (!order) {
                return null;
        }

        const items = order.items ?? [];
        const summary = order.summary ?? {};
        const subtotal = Number(summary.subtotal ?? 0);
        const total = Number(summary.total ?? 0);
        const totalDiscountAmount = Number(summary.totalDiscountAmount ?? 0);
        const savings = Math.max(totalDiscountAmount || 0, subtotal - total, 0);

        return (
                <div className='py-12'>
                        <div className='mx-auto flex w-full max-w-5xl flex-col gap-8 px-4'>
                                <motion.section
                                        className='rounded-2xl border border-payzone-indigo/20 bg-white/80 p-8 shadow-lg'
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.4 }}
                                >
                                        <h1 className='text-2xl font-bold text-payzone-gold'>شكراً على تسوقك معنا</h1>
                                        <p className='mt-3 text-base text-black'>
                                                تم إرسال طلبك وسنتواصل معك قريباً.
                                        </p>
                                        {(order.orderNumber || order.orderId) && (
                                                <p className='mt-4 text-sm text-black/70'>
                                                        رقم الطلب:{" "}
                                                        <span className='font-semibold text-black'>
                                                                {order.orderNumber || order.orderId}
                                                        </span>
                                                </p>
                                        )}
                                </motion.section>

                                <motion.section
                                        className='rounded-2xl border border-payzone-indigo/20 bg-white/80 p-8 shadow-lg'
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.4, delay: 0.05 }}
                                >
                                        <h2 className='text-xl font-semibold text-payzone-gold'>ملخص الطلب</h2>
                                        <ul className='mt-4 space-y-3 text-sm text-black/80'>
                                                {items.map((item) => {
                                                        const unitPrice = Number(item.price ?? 0);
                                                        const originalPrice = Number(item.originalPrice ?? unitPrice);
                                                        const isDiscounted =
                                                                item.isDiscounted && originalPrice > unitPrice;

                                                        return (
                                                                <li
                                                                        key={item._id || item.id || item.productId || item.name}
                                                                        className='flex justify-between gap-4'
                                                                >
                                                                        <span className='font-medium text-black'>{item.name}</span>
                                                                        <span className='flex flex-col items-end'>
                                                                                {isDiscounted && (
                                                                                        <span className='text-xs text-black/50 line-through'>
                                                                                                {formatNumberEn(item.quantity)} ×{" "}
                                                                                                {formatMRU(originalPrice)}
                                                                                        </span>
                                                                                )}
                                                                                <span>
                                                                                        {formatNumberEn(item.quantity)} × {formatMRU(unitPrice)}
                                                                                </span>
                                                                        </span>
                                                                </li>
                                                        );
                                                })}
                                        </ul>

                                        <div className='mt-6 space-y-2 border-t border-black/10 pt-4 text-sm text-black/80'>
                                                <div className='flex justify-between'>
                                                        <span>المجموع الفرعي</span>
                                                        <span>{formatMRU(subtotal)}</span>
                                                </div>
                                                {savings > 0 && (
                                                        <div className='flex justify-between text-payzone-gold'>
                                                                <span>قيمة التوفير</span>
                                                                <span>-{formatMRU(savings)}</span>
                                                        </div>
                                                )}
                                                <div className='flex justify-between text-base font-semibold text-black'>
                                                        <span>الإجمالي</span>
                                                        <span>{formatMRU(total)}</span>
                                                </div>
                                        </div>
                                </motion.section>
                        </div>
                </div>
        );
};

export default OrderSuccessPage;
