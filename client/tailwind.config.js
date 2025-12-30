/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                tg: {
                    bg: 'var(--tg-theme-bg-color, #fff)',
                    text: 'var(--tg-theme-text-color, #000)',
                    hint: 'var(--tg-theme-hint-color, #999)',
                    link: 'var(--tg-theme-link-color, #2481cc)',
                    button: 'var(--tg-theme-button-color, #2481cc)',
                    buttonText: 'var(--tg-theme-button-text-color, #fff)',
                    secondary: 'var(--tg-theme-secondary-bg-color, #efefef)',
                },
                brand: {
                    yellow: '#FFC800', // Cassette yellow
                    dark: '#18181b',   // Dark background
                    accent: '#F59E0B',
                    gray: '#27272a'
                }
            }
        },
    },
    plugins: [],
}
