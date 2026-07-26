import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import license from 'rollup-plugin-license';

export default defineConfig({
    base: './',
    plugins: [
        license({
            thirdParty: {
                output: {
                    file: path.join(__dirname, 'docs', 'OSS_LICENSES.txt'),
                    template(dependencies) {
                        return dependencies
                            .map((dependency) => {
                                return `========================================================================
Name: ${dependency.name}
Version: ${dependency.version}
License: ${dependency.license}
Author: ${dependency.author?.name || 'N/A'}
URL: ${dependency.homepage || 'N/A'}
------------------------------------------------------------------------
${dependency.licenseText || 'No license text provided.'}
`;
                            })
                            .join('\n');
                    },
                },
            },
        }),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',              // sw.ts を置くフォルダ
            filename: 'sw.ts',          // ソースとなる TypeScript ファイル
            registerType: 'autoUpdate',
            injectManifest: {
                injectionPoint: undefined, // Workbox のプリキャッシュが不要な場合は undefined
            },
            devOptions: {
                enabled: true,             // 開発環境 (npm run dev) で SW を有効化
                type: 'module',
            },
            manifest: {
                lang: 'ja',
                short_name: 'comfyuiimageviewer',
                name: 'ComfyUIImageViewer',
                background_color: '#fff',
                theme_color: '#fff',
                display: 'standalone',
                display_override: ["window-controls-overlay", "minimal-ui"],
                id: 'index',
                start_url: 'index.html',
                orientation: 'portrait',
                icons: [
                    {
                        "src": "favicon.ico",
                        "sizes": "48x48 32x32 128x128",
                        "type": "image/x-icon"
                    },
                    {
                        src: 'images/32.png',
                        type: 'image/png',
                        sizes: '32x32'
                    },
                    {
                        src: 'images/48.png',
                        type: 'image/png',
                        sizes: '48x48'
                    },
                    {
                        src: 'images/192.png',
                        type: 'image/png',
                        sizes: '192x192'
                    },
                    {
                        src: 'images/512.png',
                        type: 'image/png',
                        sizes: '512x512'
                    }
                ],
                screenshots: [
                    {
                        src: 'images/512.png',
                        sizes: '512x512',
                        form_factor: 'wide',
                        label: 'With Software, you can select a part of your screen and take a screenshot in seconds.'
                    },
                    {
                        src: 'images/512.png',
                        sizes: '512x512',
                        form_factor: 'narrow',
                        label: 'With Software, you can select a part of your screen and take a screenshot in seconds.'
                    }
                ]
            },
        }),
    ],
    build: {
        outDir: "docs",
    },
})
