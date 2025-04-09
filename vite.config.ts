import { defineConfig } from 'vite';
import { resolve } from 'path';

const root = resolve(__dirname, 'src');
const outDir = resolve(__dirname, 'dist');

// https://vitejs.dev/config/
export default defineConfig({
    resolve: {
        alias: {
            '@': root, // Alias for src directory
        },
    },
    build: {
        outDir,
        emptyOutDir: true, // Clean output directory before build
        rollupOptions: {
            input: {
                background: resolve(root, 'background.ts'),
                'content-script': resolve(root, 'content-script.ts'),
                options: resolve(root, 'options', 'options.html'),
            },
            output: {
                entryFileNames: 'src/[name].js', // Keep consistent naming
                chunkFileNames: 'assets/[name].js',
                assetFileNames: (assetInfo) => {
                    // Place CSS for options page correctly
                    if (assetInfo.name === 'options.css') {
                        return 'src/options/options.css';
                    }
                    // Keep other assets like icons in the root
                    if (assetInfo.name?.endsWith('.png') || assetInfo.name?.endsWith('.jpg') || assetInfo.name?.endsWith('.svg')) {
                        return 'assets/[name].[ext]';
                    }
                    return 'assets/[name].[ext]';
                },
            },
        },
        // Sourcemaps help with debugging in the browser dev tools
        sourcemap: 'inline', // Or 'hidden' for production
        // Reduce minification for easier debugging (optional)
        // minify: false,
    },
    // Vite specific plugin options if needed later
    plugins: [],
}); 