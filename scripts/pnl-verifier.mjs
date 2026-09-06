#!/usr/bin/env node
// scripts/pnl-verifier.mjs
// Verifie que le code que tu as choisi correspond bien a l empreinte posee en
// base. A lancer une fois, avant de compter dessus : l empreinte a pu etre
// recopiee depuis une capture d ecran, ou l et 1 se ressemblent.
//
//   node scripts/pnl-verifier.mjs        (il demande les deux)
//   node scripts/pnl-verifier.mjs '<empreinte>'
//
// ATTENTION AUX GUILLEMETS : une empreinte contient des $ ; entre guillemets
// DOUBLES, le shell les prend pour des variables et la vide de ses morceaux.
// Guillemets simples, ou pas d argument du tout et le script la demande.
//
// Le code est demande, jamais affiche, jamais ecrit.

import { createInterface } from 'node:readline/promises'
import { stdin, stdout, argv, exit } from 'node:process'
import { verifierCode } from '../api/_lib/pnl-jeton.js'

const rl = createInterface({ input: stdin, output: stdout })

let empreinte = argv[2]

// Le shell mange les $ entre guillemets doubles : on le detecte et on le dit,
// plutot que de renvoyer un « Usage » qui laisse chercher.
if (empreinte && !empreinte.startsWith('scrypt$16384$')) {
  console.log(`
  L empreinte recue est incomplete : "${empreinte}"

  Le shell a probablement mange les $ (guillemets doubles). Utilise des
  guillemets SIMPLES, ou colle la ci dessous.
`)
  empreinte = null
}

if (!empreinte) empreinte = (await rl.question('Empreinte : ')).trim()
const code = await rl.question('Ton code   : ')
rl.close()

if (!empreinte.startsWith('scrypt$')) {
  console.error('\n  Ce n est pas une empreinte valide.\n')
  exit(1)
}

if (verifierCode(code, empreinte)) {
  console.log('\n  \x1b[32m✓\x1b[0m Le code correspond. L empreinte posee est la bonne.\n')
} else {
  console.log(`
  \x1b[31m✗\x1b[0m Le code ne correspond PAS a cette empreinte.

  Deux causes possibles :
    - l empreinte a ete mal recopiee (l, 1 et I se ressemblent)
    - ce n est pas le code que tu avais saisi

  Relance l installateur pour repartir d une empreinte fraiche, et
  transmets la en COPIANT LE TEXTE plutot qu en capture d ecran.
`)
  exit(1)
}
