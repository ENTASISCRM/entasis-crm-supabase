/* ─────────────────────────────────────────────────────────────────────────────
   FORMAT — helpers de formatage partagés (Série B / B7).

   `euro` et `annualize` étaient redéclarés localement dans 6+ fichiers avec
   de micro-variations. Source unique ici ; les copies locales migrent au fil
   de l'eau.
───────────────────────────────────────────────────────────────────────────── */

export function euro(montant) {
  if (montant === null || montant === undefined) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(montant)
}

// PP mensuelle → annualisée (comparaison des primes à l'année).
export function annualize(ppMensuelle) {
  return (ppMensuelle || 0) * 12
}
