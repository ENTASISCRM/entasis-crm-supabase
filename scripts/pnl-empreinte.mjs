#!/usr/bin/env node
// scripts/pnl-empreinte.mjs
// Calcule l empreinte d un code pour l espace rentabilite, et rien d autre.
//
//   node scripts/pnl-empreinte.mjs "mon code"
//
// Le code n est ni ecrit dans le depot, ni journalise, ni renvoye. Seule
// l empreinte s affiche : c est elle qu on pose dans pnl_verrou.empreinte.
//
// Le code passe en argument reste visible dans l historique du terminal :
// prefixez la commande d une espace si votre shell l ignore alors, ou
// utilisez le mode interactif en n passant aucun argument.

import { empreinteCode } from '../api/_lib/pnl-jeton.js'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, argv, exit } from 'node:process'

const LONGUEUR_MINIMALE = 6

async function demanderCode() {
  const rl = createInterface({ input: stdin, output: stdout })
  const code = await rl.question('Code (il ne sera pas affiche en clair a la fin) : ')
  rl.close()
  return code
}

const code = argv[2] ?? await demanderCode()

if (!code || code.length < LONGUEUR_MINIMALE) {
  console.error(`Code trop court, ${LONGUEUR_MINIMALE} caracteres au minimum.`)
  exit(1)
}

console.log('\nEmpreinte a poser dans pnl_verrou.empreinte :\n')
console.log(empreinteCode(code))
console.log(`
Requete a executer dans le SQL Editor de Supabase, avec la cle de service :

  update public.pnl_verrou
     set empreinte = '<coller l empreinte ci dessus>',
         tentatives_echouees = 0,
         bloque_jusqu_a = null,
         updated_at = now()
   where id = true;

Le code lui meme n a ete ecrit nulle part.
`)
