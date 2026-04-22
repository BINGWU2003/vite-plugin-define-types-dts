import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { defineTypesPlugin } from '../../src/index'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_NAME__: JSON.stringify('vite-vue-ts'),
    __ENABLE_DEMO__: true,
    __NUMBER__: 123,
  },

  plugins: [
    vue(),
    defineTypesPlugin('src/define-types.d.ts'),
  ],
  server: {
    host: '0.0.0.0',
  },
})
