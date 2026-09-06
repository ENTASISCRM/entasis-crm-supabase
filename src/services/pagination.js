// src/services/pagination.js
// Lecture paginee des tables Supabase.
//
// Pourquoi : PostgREST plafonne CHAQUE reponse a 1000 lignes et coupe en
// silence, sans erreur ni avertissement. Une lecture pleine table sans
// .range renvoie donc des donnees incompletes des que la table franchit le
// plafond, et rien a l ecran ne le dit. Mesure du 06/09/2026 sur la base de
// production : deals 482 lignes (48 pour cent du plafond), clients 372,
// contrats 204, client_equipment 157.
//
// Ce helper vient de services/opportunites.js, ou il tourne deja en
// production. Il est sorti ici SANS changement de comportement pour que
// toutes les lectures pleine table du CRM passent par la meme boucle.
//
// Cout : nul tant que la table tient sous 1000 lignes, la boucle s arrete au
// premier lot incomplet, soit un seul aller retour comme avant.

export const PAGE = 1000

// Charge toutes les lignes d'une requete par pages de 1000 pour ne pas
// buter sur la limite PostgREST. buildQuery doit renvoyer une requete neuve
// a chaque appel car une requete Supabase ne se rejoue pas.
export async function fetchTout(buildQuery) {
  const lignes = []
  for (let depart = 0; ; depart += PAGE) {
    const { data, error } = await buildQuery().range(depart, depart + PAGE - 1)
    if (error) throw error
    lignes.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return lignes
}
