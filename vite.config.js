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
          // Le helper __vitePreload de Vite n'est pas dans node_modules : sans
          // regle explicite, Rollup le range dans le premier chunk venu. Il
          // avait atterri dans 'pdf', ce qui forcait l'entry a importer les
          // 533 kB de jsPDF a chaque ouverture du CRM pour une seule fonction.
          if (id.includes('vite/preload-helper')) return 'react-vendor'
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf'
          if (id.includes('chart.js') || id.includes('react-chartjs')) return 'charts'
          if (id.includes('@dnd-kit') || id.includes('react-dnd') || id.includes('react-beautiful')) return 'dnd'
          // jszip et marked tombaient dans 'vendor', qui est charge d'emblee,
          // alors que le premier est deja en import() dynamique (PilotageRH) et
          // le second ne sert qu'a l'ecran Editorial, lui-meme lazy. Sans regle
          // explicite, 'vendor' sert de fourre-tout et embarque tout ce qui n'a
          // pas de chunk : c'est ce qui les rendait eager.
          if (id.includes('jszip')) return 'jszip'
          if (id.includes('marked')) return 'marked'
          return 'vendor'
        },
      },
    },
  },
})
