// api/editorial/lib/token.js
// Signature HMAC des liens d'action email (veto) + comparaison timing-safe.
// Partagé entre le script cron (génération des liens) et la route veto
// (vérification). Aucune variable d'environnement lue ici : le secret
// (EDITORIAL_SECRET) est passé par l'appelant.

import { createHmac, timingSafeEqual } from 'crypto'

// Comparaison à temps constant (même pattern que le Lead Room) : une
// différence de longueur renvoie false immédiatement, la longueur n'étant
// pas considérée comme sensible ici.
export function safeEqual(a, b) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// Token d'action : HMAC-SHA256(id + action) en hex, clé EDITORIAL_SECRET.
// Le séparateur ':' évite toute ambiguïté de concaténation.
export function vetoToken(id, action, secret) {
  return createHmac('sha256', secret).update(`${id}:${action}`).digest('hex')
}

export function verifyVetoToken(id, action, token, secret) {
  if (typeof token !== 'string' || !token) return false
  return safeEqual(token, vetoToken(id, action, secret))
}
