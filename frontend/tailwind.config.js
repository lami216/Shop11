/** @type {import('tailwindcss').Config} */
export default {
        content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
        theme: {
                extend: {
                        colors: {
                                "payzone-navy": "#F7F3EA",
                                "payzone-white": "#1F2A27",
                                "payzone-gold": "#D62828",
                                "payzone-indigo": "#2F8F46",
                                "bilady-yellow": "#F2C94C",
                        },
                },
        },
        plugins: [],
};
