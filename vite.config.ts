import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function offlineCspPlugin(): Plugin {
  return {
    name: 'offline-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const cspTag =
        '    <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\'; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\';" />';
      return html.replace('<head>', `<head>\n${cspTag}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineCspPlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
});
