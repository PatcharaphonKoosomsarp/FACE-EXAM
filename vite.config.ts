import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        basicSsl()
      ],
      build: {
        chunkSizeWarningLimit: 1000, // เพิ่ม limit การแจ้งเตือนเป็น 1000kB (1MB)
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom'],
                    'vendor-mediapipe': ['@mediapipe/face_mesh', '@mediapipe/camera_utils'],
                    'vendor-supabase': ['@supabase/supabase-js'],
                    'vendor-utils': ['face-api.js', 'qrcode.react', 'lucide-react']
                }
            }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.VITE_GOOGLE_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GOOGLE_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
