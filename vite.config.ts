import { defineConfig } from 'vite';

// base './' обязателен: игра должна работать с относительных путей
// и на CDN Яндекс Игр, и на GitHub Pages.
export default defineConfig({
  base: './',
});
