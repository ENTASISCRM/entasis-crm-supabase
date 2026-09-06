import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// manualChunks : on isole les gros vendors stables (react, supabase, charts, pdf)
// dans des chunks separes. Ils changent rarement, donc le navigateur les garde en
// cache entre deux deploiements (cadence elevee), au lieu de retelecharger 1,7 Mo
// a chaque mise en prod.

// Memoire du parcours d'importateurs : manualChunks est appele une fois par
// module et les chaines se recoupent beaucoup. On ne memorise que les reponses
// negatives, qui sont sures : si la remontee complete d'un module ne trouve pas
// l'entree, aucun des modules traverses ne l'atteint non plus.
const paquetsNonPrecharges = new Set()

// Un module de node_modules est il atteint par l'entree en imports statiques ?
// C'est la seule question qui compte pour le paquet servi au login : index.html
// ne precharge que ce que l'entree tire statiquement. On remonte donc la chaine
// des importateurs statiques ; si elle debouche sur l'entree, le module est de
// toute facon telecharge a l'ouverture du CRM et il a sa place dans 'vendor'.
// Si elle ne debouche que sur des racines d'import() (les ecrans lazy), le
// module n'a rien a faire dans un chunk precharge.
//
// Mesure qui motive ce filtre (audit perf) : la regle par nom de paquet laissait
// tomber tout l'arbre de dependances du generateur PDF dans le fourre tout
// 'vendor', lui precharge : canvg 78,5 ko, core-js 37,3, pako 21,2,
// svg-pathdata 17,8, fast-png 12,6, fflate 6,3, iobuffer 5,6, rgbcolor 4,9,
// stackblur-canvas 4,5, raf 0,9. Soit un 'vendor' a 248,40 ko (87,11 gzip)
// servi a chaque login pour une fonctionnalite qui ne sert jamais a l'accueil.
function atteintParLEntree(id, getModuleInfo) {
  if (paquetsNonPrecharges.has(id)) return false
  const vus = new Set([id])
  const file = [id]
  for (let i = 0; i < file.length; i++) {
    const courant = file[i]
    if (paquetsNonPrecharges.has(courant)) continue
    const info = getModuleInfo(courant)
    if (!info) continue
    if (info.isEntry) return true
    // On ne suit que les importateurs statiques : franchir un import() ferait
    // remonter jusqu'a l'entree depuis n'importe quel ecran lazy, et tout
    // redeviendrait eager.
    for (const parent of info.importers) {
      if (vus.has(parent)) continue
      vus.add(parent)
      file.push(parent)
    }
  }
  for (const vu of vus) paquetsNonPrecharges.add(vu)
  return false
}

export default defineConfig({
  plugins: [react()],
  test: {
    // Les copies de travail isolees des agents vivent sous .claude/worktrees :
    // sans cette exclusion, vitest y ramassait cinq fois les memes tests.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id, { getModuleInfo }) {
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
          // Tout le reste : 'vendor' seulement si l'entree y touche vraiment.
          // Sinon on rend la main a Rollup, qui range le module avec le ou les
          // ecrans lazy qui l'utilisent (l'arbre du PDF part avec le PDF, celui
          // de zip avec zip) au lieu de le poser dans un chunk precharge.
          return atteintParLEntree(id, getModuleInfo) ? 'vendor' : undefined
        },
      },
    },
  },
})
