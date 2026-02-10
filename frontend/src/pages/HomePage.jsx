import { useEffect, useMemo, useState } from "react";
import { Truck, ArrowDownRight } from "lucide-react";
import useTranslation from "../hooks/useTranslation";
import { useProductStore } from "../stores/useProductStore";
import ProductCard from "../components/ProductCard";

const HomePage = () => {
        const { fetchAllProducts, products, loading: productsLoading } = useProductStore();
        const { t } = useTranslation();
        const [searchTerm, setSearchTerm] = useState("");
        const [sortOption, setSortOption] = useState("latest");

        useEffect(() => {
                fetchAllProducts();
        }, [fetchAllProducts]);

        const filteredProducts = useMemo(() => {
                const normalizedSearch = searchTerm.trim().toLowerCase();
                const filtered = normalizedSearch
                        ? products.filter((product) =>
                                  product.name?.toLowerCase().includes(normalizedSearch)
                          )
                        : products;

                const sorted = [...filtered];
                sorted.sort((first, second) => {
                        if (sortOption === "price-asc") {
                                return Number(first.price) - Number(second.price);
                        }
                        if (sortOption === "price-desc") {
                                return Number(second.price) - Number(first.price);
                        }
                        const firstDate = first.createdAt ? new Date(first.createdAt).getTime() : 0;
                        const secondDate = second.createdAt ? new Date(second.createdAt).getTime() : 0;
                        return secondDate - firstDate;
                });

                return sorted;
        }, [products, searchTerm, sortOption]);

        return (
                <div className='relative min-h-screen overflow-hidden text-black'>
                        <div className='relative z-10 mx-auto max-w-7xl px-4 pt-24 pb-16 sm:px-6 sm:pt-20 lg:px-8'>
                                <div className='grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center'>
                                        <div>
                                                <div className='mb-6 flex w-fit items-center gap-2 rounded-full bg-bilady-yellow/30 px-5 py-2 text-sm font-semibold text-black shadow-sm'>
                                                        <span className='h-2 w-2 rounded-full bg-payzone-gold' />
                                                        {t("home.badge")}
                                                </div>
                                                <h1 className='mb-4 text-right text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl'>
                                                        <span className='block text-black'>{t("home.titleLine1")}</span>
                                                        <span className='bg-gradient-to-r from-payzone-gold via-bilady-yellow to-payzone-indigo bg-clip-text text-transparent'>
                                                                {t("home.titleHighlight")}
                                                        </span>
                                                </h1>
                                                <p className='mb-8 text-right text-lg text-black'>
                                                        {t("home.subtitle")}
                                                </p>
                                                <div className='flex flex-wrap items-center justify-center gap-4 sm:justify-end'>
                                                        <a
                                                                href='#products'
                                                                className='inline-flex w-full max-w-[320px] items-center justify-center gap-2 rounded-full bg-payzone-gold px-6 py-3 text-base font-semibold text-black shadow-lg transition hover:bg-[#b81f1f] sm:w-auto sm:max-w-none'
                                                        >
                                                                {t("home.ctaPrimary")}
                                                                <ArrowDownRight className='h-5 w-5' />
                                                        </a>
                                                </div>
                                        </div>

                                        <div className='grid gap-4 sm:grid-cols-2'>
                                                <a
                                                        href='#products'
                                                        className='group relative block cursor-pointer overflow-hidden rounded-3xl border border-payzone-indigo/30 bg-white/10 shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-xl active:scale-[0.99]'
                                                >
                                                        <img
                                                                src='https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=900&q=80'
                                                                alt={t("home.heroImages.obd")}
                                                                className='h-56 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-64'
                                                                loading='lazy'
                                                                decoding='async'
                                                        />
                                                        <span className='absolute bottom-3 right-3 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-black'>
                                                                {t("home.heroLabels.diagnostic")}
                                                        </span>
                                                </a>
                                                <div className='grid gap-4'>
                                                        <a
                                                                href='#products'
                                                                className='group relative block cursor-pointer overflow-hidden rounded-3xl border border-payzone-indigo/30 bg-white/10 shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-xl active:scale-[0.99]'
                                                        >
                                                                <img
                                                                        src='https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80'
                                                                        alt={t("home.heroImages.seatCover")}
                                                                        className='h-32 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-40'
                                                                        loading='lazy'
                                                                        decoding='async'
                                                                />
                                                                <span className='absolute bottom-3 right-3 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-black'>
                                                                        {t("home.heroLabels.comfort")}
                                                                </span>
                                                        </a>
                                                        <a
                                                                href='#products'
                                                                className='group relative block cursor-pointer overflow-hidden rounded-3xl border border-payzone-indigo/30 bg-white/10 shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-xl active:scale-[0.99]'
                                                        >
                                                                <img
                                                                        src='https://images.unsplash.com/photo-1514316454349-750a7fd3da3a?auto=format&fit=crop&w=900&q=80'
                                                                        alt={t("home.heroImages.interior")}
                                                                        className='h-32 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-40'
                                                                        loading='lazy'
                                                                        decoding='async'
                                                                />
                                                                <span className='absolute bottom-3 right-3 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-black'>
                                                                        {t("home.heroLabels.interior")}
                                                                </span>
                                                        </a>
                                                </div>
                                        </div>
                                </div>

                                <div className='mt-10 flex justify-center'>
                                        <div className='flex items-center gap-3 rounded-2xl border border-payzone-indigo/20 bg-white/60 px-5 py-3 text-sm font-semibold text-black shadow-sm'>
                                                <Truck className='h-5 w-5 text-payzone-gold' />
                                                <span>{t("home.trust.fastDelivery")}</span>
                                        </div>
                                </div>

                                <section id='products' className='mt-16'>
                                        <div className='mb-8 flex flex-col gap-4 text-right lg:flex-row lg:items-end lg:justify-between'>
                                                <div>
                                                        <h2 className='text-3xl font-bold text-black sm:text-4xl'>
                                                                {t("home.productsTitle")}
                                                        </h2>
                                                        <p className='mt-2 text-base text-black'>
                                                                {t("home.productsSubtitle")}
                                                        </p>
                                                </div>
                                                <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end'>
                                                        <div className='relative'>
                                                                <input
                                                                        type='search'
                                                                        value={searchTerm}
                                                                        onChange={(event) => setSearchTerm(event.target.value)}
                                                                        placeholder={t("home.searchPlaceholder")}
                                                                        className='w-full rounded-full border border-payzone-indigo/30 bg-white/80 px-5 py-3 text-sm text-black shadow-sm focus:border-payzone-gold focus:outline-none focus:ring-2 focus:ring-payzone-indigo/40 sm:w-64'
                                                                />
                                                        </div>
                                                        <div className='flex items-center gap-2 rounded-full border border-payzone-indigo/30 bg-white/80 px-4 py-2 text-sm text-black shadow-sm'>
                                                                <span className='text-xs font-semibold text-black/70'>
                                                                        {t("home.sort.label")}
                                                                </span>
                                                                <select
                                                                        value={sortOption}
                                                                        onChange={(event) => setSortOption(event.target.value)}
                                                                        className='bg-transparent text-sm font-semibold text-black focus:outline-none'
                                                                >
                                                                        <option value='latest'>{t("home.sort.latest")}</option>
                                                                        <option value='price-asc'>{t("home.sort.priceLow")}</option>
                                                                        <option value='price-desc'>{t("home.sort.priceHigh")}</option>
                                                                </select>
                                                        </div>
                                                </div>
                                        </div>

                                        {productsLoading && (
                                                <div className='rounded-3xl border border-payzone-indigo/20 bg-white/60 p-6 text-center text-black'>
                                                        {t("common.status.loading")}
                                                </div>
                                        )}

                                        {!productsLoading && filteredProducts.length === 0 && (
                                                <div className='rounded-3xl border border-payzone-indigo/20 bg-white/60 p-6 text-center text-black'>
                                                        {t("home.noProducts")}
                                                </div>
                                        )}

                                        {!productsLoading && filteredProducts.length > 0 && (
                                                <div className='grid grid-cols-2 gap-5 text-right sm:grid-cols-3 lg:grid-cols-4'>
                                                        {filteredProducts.map((product) => (
                                                                <ProductCard key={product._id} product={product} />
                                                        ))}
                                                </div>
                                        )}
                                </section>
                        </div>
                </div>
	);
};
export default HomePage;
