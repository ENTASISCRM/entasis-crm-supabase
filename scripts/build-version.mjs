// Ecrit public/version.json au build : le client compare periodiquement
// cette valeur pour proposer de recharger quand une nouvelle version est
// deployee (les onglets restes ouverts tournaient sur du code perime).
import { writeFileSync } from 'node:fs'
writeFileSync('public/version.json', JSON.stringify({
  build: Date.now(),
  sha: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
}))
console.log('[build-version] version.json ecrit')
