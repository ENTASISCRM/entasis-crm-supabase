#!/usr/bin/env node
// scripts/pnl-verifier.mjs
// Verifie que le code que tu as choisi correspond bien a l empreinte posee en
// base. A lancer une fois, avant de compter dessus : l empreinte a pu etre
// recopiee depuis une capture d ecran, ou l et 1 se ressemblent.
//
//   node scripts/pnl-verifier.mjs "<empreinte>"
//
// Le code est demande, jamais affiche, jamais ecrit.

import { createInterface } from 'node:readline/promises'
import { stdin, stdout, argv, exit } from 'node:process'
import { verifierCode } from '../api/_lib/pnl-jeton.js'

const empreinte = argv[2]
if (!empreinte || !empreinte.startsWith('scrypt$')) {
  console.error('Usage : node scripts/pnl-verifier.mjs "<empreinte>"')
  exit(1)
}

const rl = createInterface({ input: stdin, output: stdout })
const code = await rl.question('Ton code : ')
rl.close()

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
