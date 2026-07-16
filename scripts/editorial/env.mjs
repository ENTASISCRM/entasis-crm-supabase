// scripts/editorial/env.mjs
// Helpers d'environnement partagés par les scripts éditoriaux (cron GitHub
// Actions et exécution locale). Dans le runner, les variables arrivent par
// l'environnement (secrets Actions) ; en local, le .env à la racine est lu.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Chargement .env minimaliste (zéro dépendance) : lignes KEY=VALUE, les
// variables déjà présentes dans l'environnement ont priorité.
export function loadDotenv() {
  let raw
  try {
    raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, rawVal] = m
    if (process.env[key] !== undefined) continue
    process.env[key] = rawVal.replace(/^(['"])(.*)\1$/, '$2')
  }
}

// Vérifie la présence des variables listées ; sortie code 1 avec message
// clair sinon (les noms manquants, jamais les valeurs).
export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n])
  if (missing.length) {
    console.error(`Variables d'environnement manquantes : ${missing.join(', ')}`)
    process.exit(1)
  }
}
