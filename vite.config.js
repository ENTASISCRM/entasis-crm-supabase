import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// manualChunks : on isole les gros vendors stables (react, supabase, charts, pdf)
// dans des chunks separes. Ils changent rarement, donc le navigateur les garde en
// cache entre deux deploiements (cadence elevee), au lieu de retelecharger 1,7 Mo
// a chaque mise en prod.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf'
          if (id.includes('chart.js') || id.includes('react-chartjs')) return 'charts'
          if (id.includes('@dnd-kit') || id.includes('react-dnd') || id.includes('react-beautiful')) return 'dnd'
          return 'vendor'
        },
      },
    },
  },
})
