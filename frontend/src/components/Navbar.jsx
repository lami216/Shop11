import { ShoppingCart, UserPlus, LogIn, LogOut, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import useTranslation from "../hooks/useTranslation";
import { useUserStore } from "../stores/useUserStore";
import { useCartStore } from "../stores/useCartStore";

const Navbar = () => {
        const { user, logout } = useUserStore();
        const isAdmin = user?.role === "admin";
        const { cart } = useCartStore();
        const cartItemCount = cart.reduce((total, item) => total + (item.quantity ?? 0), 0);
        const { t } = useTranslation();

        const cartLink = (
                <Link
                        to={'/cart'}
                        className='relative group flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-black transition duration-300 ease-in-out hover:bg-white'
                >
                        <ShoppingCart size={18} className='text-payzone-indigo' />
                        <span className='hidden sm:inline'>{t("nav.cart")}</span>
                        {cartItemCount > 0 && (
                                <span className='absolute -top-2 -right-2 rounded-full bg-bilady-yellow px-2 py-0.5 text-xs font-semibold text-black shadow-sm transition duration-300 ease-in-out'>
                                        {cartItemCount}
                                </span>
                        )}
                </Link>
        );

        return (
                <header className='fixed top-0 right-0 w-full border-b border-payzone-indigo/30 bg-payzone-navy/90 backdrop-blur-xl shadow-lg transition-all duration-300 z-40'>
                        <div className='container mx-auto px-4 py-2 sm:py-3'>
                                <div className='flex flex-wrap items-center justify-between gap-4'>
                                        <Link to='/' className='flex items-center gap-3 text-black'>
                                                <img
                                                        src='/bilady-logo.svg'
                                                        alt='شعار Bilady'
                                                        className='h-12 w-12 object-contain drop-shadow-[0_6px_18px_rgba(214,40,40,0.18)]'
                                                />
                                                <span className='text-2xl font-semibold uppercase tracking-wide'>Bilady</span>
                                        </Link>

                                        <div className='flex flex-wrap items-center gap-4 text-sm font-medium'>
                                                <nav className='flex items-center gap-4'>
                                                        <Link
                                                                to={'/'}
                                                                className='text-black transition duration-300 ease-in-out hover:text-payzone-indigo'
                                                        >
                                                                {t("nav.home")}
                                                        </Link>
                                                        {isAdmin && (
                                                                <Link
                                                                        className='flex items-center gap-2 rounded-md bg-payzone-indigo px-3 py-1 text-white transition duration-300 ease-in-out hover:bg-[#2b7f3e]'
                                                                        to={'/secret-dashboard'}
                                                                >
                                                                        <Lock className='inline-block' size={18} />
                                                                        <span className='hidden sm:inline'>{t("nav.dashboard")}</span>
                                                                </Link>
                                                        )}
                                                </nav>

                                                <div className='flex items-center gap-3'>
                                                        {cartLink}
                                                        {user ? (
                                                                <button
                                                                        className='flex items-center gap-2 rounded-full bg-payzone-indigo/10 px-4 py-2 text-black transition duration-300 ease-in-out hover:bg-payzone-indigo/20'
                                                                        onClick={logout}
                                                                >
                                                                        <LogOut size={18} />
                                                                        <span className='hidden sm:inline'>{t("nav.logout")}</span>
                                                                </button>
                                                        ) : (
                                                                <>
                                                                        <Link
                                                                                to={'/signup'}
                                                                                className='flex items-center gap-2 rounded-full bg-payzone-gold px-4 py-2 font-semibold text-white transition duration-300 ease-in-out hover:bg-[#b81f1f]'
                                                                        >
                                                                                <UserPlus size={18} />
                                                                                {t("nav.signup")}
                                                                        </Link>
                                                                        <Link
                                                                                to={'/login'}
                                                                                className='flex items-center gap-2 rounded-full bg-payzone-indigo px-4 py-2 text-white transition duration-300 ease-in-out hover:bg-[#27783c]'
                                                                        >
                                                                                <LogIn size={18} />
                                                                                {t("nav.login")}
                                                                        </Link>
                                                                </>
                                                        )}
                                                </div>
                                        </div>
                                </div>
                        </div>
                </header>
        );
};
export default Navbar;
