import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          builder: path.resolve(__dirname, 'builder.html'),
          about: path.resolve(__dirname, 'about.html'),
          apiReference: path.resolve(__dirname, 'api-reference.html'),
          blog: path.resolve(__dirname, 'blog.html'),
          careers: path.resolve(__dirname, 'careers.html'),
          community: path.resolve(__dirname, 'community.html'),
          documentation: path.resolve(__dirname, 'documentation.html'),
          enterprise: path.resolve(__dirname, 'enterprise.html'),
          features: path.resolve(__dirname, 'features.html'),
          pricing: path.resolve(__dirname, 'pricing.html'),
          privacy: path.resolve(__dirname, 'privacy.html'),
          security: path.resolve(__dirname, 'security.html'),
          showcase: path.resolve(__dirname, 'showcase.html'),
          dashboard: path.resolve(__dirname, 'dashboard.html'),
          auth: path.resolve(__dirname, 'auth.html'),
        },
      },
    },
  };
});
