import { ShoppingCart } from "lucide-react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import useTranslation from "../hooks/useTranslation";
import { useCartStore } from "../stores/useCartStore";
import { formatMRU } from "../lib/formatMRU";
import { getProductPricing } from "../lib/getProductPricing";

const ProductCard = ({ product }) => {
        const { addToCart } = useCartStore();
        const { t } = useTranslation();
        const { price, discountedPrice, isDiscounted, discountPercentage } = getProductPricing(product);
        const productForCart = {
                ...product,
                discountedPrice,
                isDiscounted,
                discountPercentage,
        };
        let coverImage = product.image;

        if (!coverImage && Array.isArray(product.images) && product.images.length > 0) {
                const [firstImage] = product.images;

                if (typeof firstImage === "string") {
                        coverImage = firstImage;
                } else {
                        coverImage = firstImage?.url || "";
                }
        }

        const handleAddToCart = () => {
                addToCart(productForCart);
        };

        return (
                <div className='group relative flex w-full flex-col overflow-hidden rounded-2xl border border-payzone-indigo/25 bg-white/95 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-payzone-gold/60 hover:shadow-xl'>
                        <Link
                                to={`/products/${product._id}`}
                                className='relative m-3 mb-0 aspect-[4/3] w-auto overflow-hidden rounded-xl bg-payzone-indigo/5 shadow-sm'
                                aria-label={t("product.viewDetails", { name: product.name })}
                        >
                                {isDiscounted && (
                                        <span className='absolute right-3 top-3 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-lg'>
                                                -{discountPercentage}%
                                        </span>
                                )}
                                {coverImage ? (
                                        <img
                                                className='h-full w-full object-cover transition-transform duration-500 group-hover:scale-105'
                                                src={coverImage}
                                                alt={product.name}
                                                style={{ filter: "none", opacity: 1, mixBlendMode: "normal" }}
                                        />
                                ) : (
                                        <div className='flex h-full w-full items-center justify-center bg-payzone-navy/70 text-sm text-black'>
                                                {t("common.status.noImage")}
                                        </div>
                                )}
                        </Link>

                        <div className='mt-4 flex flex-1 flex-col px-4 pb-4 text-right'>
                                <Link to={`/products/${product._id}`} className='block'>
                                        <h5
                                                className='min-h-[3.4rem] text-base font-bold leading-7 tracking-tight text-black sm:text-lg'
                                                style={{
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                }}
                                        >
                                                {product.name}
                                        </h5>
                                </Link>
                                <div className='mt-3 flex flex-wrap items-baseline justify-end gap-2'>
                                        {isDiscounted ? (
                                                <>
                                                        <span className='max-w-full break-words text-sm text-black/60 line-through'>
                                                                {formatMRU(price, { roundToInteger: true })}
                                                        </span>
                                                        <span className='max-w-full break-words text-2xl font-extrabold leading-none text-red-600'>
                                                                {formatMRU(discountedPrice, { roundToInteger: true })}
                                                        </span>
                                                </>
                                        ) : (
                                                <span className='max-w-full break-words text-2xl font-extrabold leading-none text-payzone-gold'>
                                                        {formatMRU(price, { roundToInteger: true })}
                                                </span>
                                        )}
                                </div>
                                <button
                                        className='mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-payzone-gold px-5 py-2.5 text-sm font-semibold text-black shadow-md transition-all duration-300 hover:bg-[#b81f1f] hover:text-white focus:outline-none focus:ring-4 focus:ring-payzone-indigo/40'
                                        onClick={handleAddToCart}
                                >
                                        <ShoppingCart size={20} />
                                        {t("common.actions.addToCart")}
                                </button>
                        </div>
                </div>
        );
};
export default ProductCard;

ProductCard.propTypes = {
        product: PropTypes.shape({
                _id: PropTypes.string.isRequired,
                id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
                name: PropTypes.string.isRequired,
                image: PropTypes.string,
                images: PropTypes.arrayOf(
                        PropTypes.oneOfType([
                                PropTypes.string,
                                PropTypes.shape({
                                        url: PropTypes.string,
                                }),
                        ])
                ),
                price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
                discountedPrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
                isDiscounted: PropTypes.bool,
                discountPercentage: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        }).isRequired,
};
