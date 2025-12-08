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
                <div className='group relative flex w-full flex-col overflow-hidden rounded-xl border border-payzone-indigo/30 shadow-lg transition-all duration-300 hover:border-payzone-gold/60 hover:shadow-xl sm:aspect-[3/4] lg:aspect-square'>
                        <Link
                                to={`/products/${product._id}`}
                                className='relative aspect-[4/5] w-full overflow-hidden min-h-[14rem] sm:min-h-0 sm:aspect-square'
                                aria-label={t("product.viewDetails", { name: product.name })}
                        >
                                {isDiscounted && (
                                        <span className='absolute right-3 top-3 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-lg'>
                                                -{discountPercentage}%
                                        </span>
                                )}
                                {coverImage ? (
                                        <img
                                                className='h-full w-full object-cover transition-transform duration-500 group-hover:scale-110'
                                                src={coverImage}
                                                alt={product.name}
                                                style={{ filter: "none", opacity: 1, mixBlendMode: "normal" }}
                                        />
                                ) : (
                                        <div className='flex h-full w-full items-center justify-center bg-payzone-navy/70 text-sm text-payzone-white/80'>
                                                {t("common.status.noImage")}
                                        </div>
                                )}
                        </Link>

                        <div className='mt-4 flex flex-1 flex-col px-5 pb-5'>
                                <Link to={`/products/${product._id}`} className='block'>
                                        <h5 className='text-lg font-semibold tracking-tight text-[#000000]'>
                                                {product.name}
                                        </h5>
                                </Link>
                                <div className='mt-3 flex flex-wrap items-baseline gap-2'>
                                        {isDiscounted ? (
                                                <>
                                                        <span className='max-w-full break-words text-sm text-payzone-white/70 line-through'>{formatMRU(price)}</span>
                                                        <span className='max-w-full break-words text-lg font-bold text-red-300'>{formatMRU(discountedPrice)}</span>
                                                </>
                                        ) : (
                                                <span className='max-w-full break-words text-lg font-semibold leading-tight text-payzone-gold'>
                                                        {formatMRU(price)}
                                                </span>
                                        )}
                                </div>
                                <button
                                        className='mt-auto flex items-center justify-center gap-2 rounded-lg bg-payzone-gold px-5 py-2 text-sm font-medium text-white transition-colors duration-300 hover:bg-[#b81f1f] focus:outline-none focus:ring-4 focus:ring-payzone-indigo/40'
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
