import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        reader: resolve(__dirname, 'reader.html'),
        meetings: resolve(__dirname, 'meetings.html'),
        convention: resolve(__dirname, 'convention.html'),
        notes: resolve(__dirname, 'notes.html'),
        settings: resolve(__dirname, 'settings.html')
      }
    }
  }
});
