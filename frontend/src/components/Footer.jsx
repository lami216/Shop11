import SocialLinks from "./SocialLinks";

const Footer = () => {
        const buildTime = new Date(import.meta.env.VITE_BUILD_TIME).toLocaleString();
        return (
                <footer className='mt-16 border-t border-payzone-indigo/20 bg-payzone-navy text-payzone-white'>
                        <div className='container mx-auto flex flex-col items-center px-4 py-10 text-center'>
                                <p className='text-lg font-semibold text-payzone-white'>Bilady – طلباتك العالمية إلى موريتانيا</p>
                                <p className='mt-2 max-w-2xl text-sm text-payzone-white/80'>نصل بينك وبين أفضل المتاجر العالمية مع شحن موثوق يصل مباشرة إلى موريتانيا.</p>
                                <SocialLinks />
                                <small className='mt-6 text-xs text-payzone-white/60'>آخر تحديث للموقع: {buildTime}</small>
                        </div>
                </footer>
        );
};

export default Footer;
