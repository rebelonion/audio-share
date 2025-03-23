/** @type {import('next').NextConfig} */
const nextConfig: import('next').NextConfig = {
    reactStrictMode: true,
    // Configure to handle large audio files if needed
    serverRuntimeConfig: {
        // Increase buffer size for file operations if needed
    },
    webpack(config: { module: { rules: { test: RegExp; use: { loader: string; options: { publicPath: string; outputPath: string; name: string; }; }; }[]; }; }) {
        config.module.rules.push({
            test: /\.(mp3|wav|ogg|flac|aac|m4a)$/,
            use: {
                loader: 'file-loader',
                options: {
                    publicPath: '/_next/static/media/',
                    outputPath: 'static/media/',
                    name: '[name].[hash].[ext]',
                },
            },
        });
        return config;
    },
};

module.exports = nextConfig;