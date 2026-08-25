// src/lib/mail-immo.js
// Le mail de transmission d un dossier immobilier a l un des deux referents
// partenaires. Il part du Gmail du conseiller, pas d un serveur : nous
// preparons le brouillon, il relit et appuie sur Envoyer. L echange reste
// ensuite dans sa propre boite, la ou il saura le retrouver.

import { euro } from './ui-shared'

// Corps du mail au référent. Volontairement sobre et complet : le référent
// doit pouvoir rappeler le client sans rien redemander. Aucune donnée de
// rémunération, ni la nôtre ni celle du cabinet, n y figure.
const ligneMail = (label, valeur) => (valeur ? `${label} : ${valeur}\n` : '')

export function brouillonMail(partenaire, f, conseiller) {
  const sujet = `Transmission de dossier ${partenaire.metier} : ${f.client_nom.trim() || 'client Entasis'}`
  const corps =
    `Bonjour ${partenaire.referent.split(' ')[0]},\n\n` +
    `Je te transmets un dossier ${partenaire.metier}. Je reste sur le dossier ` +
    `et je serai présent au rendez-vous avec le client.\n\n` +
    `LE CLIENT\n` +
    ligneMail('Nom', f.client_nom.trim()) +
    ligneMail('Téléphone', f.client_telephone.trim()) +
    ligneMail('Email', f.client_email.trim()) +
    `\nLE PROJET\n` +
    ligneMail('Objectif', f.objectif.trim()) +
    ligneMail('Dispositif envisagé', f.dispositif_retenu) +
    ligneMail('Budget', f.budget_total === '' ? '' : euro(f.budget_total)) +
    ligneMail('Apport', f.apport === '' ? '' : euro(f.apport)) +
    (f.notes.trim() ? `\nPRÉCISIONS\n${f.notes.trim()}\n` : '') +
    `\nDis moi quels lots correspondent, et on cale le rendez-vous ensemble.\n\n` +
    `Bien à toi,\n\n${conseiller || ''}\nEntasis Conseil`
  return { sujet, corps }
}

// Ouvre la fenêtre de rédaction Gmail, destinataire et texte déjà remplis.
// Le conseiller relit et appuie sur Envoyer : rien ne part sans lui.
export function ouvrirGmail(partenaire, f, conseiller) {
  const { sujet, corps } = brouillonMail(partenaire, f, conseiller)
  const url = 'https://mail.google.com/mail/?view=cm&fs=1'
    + `&to=${encodeURIComponent(partenaire.email)}`
    + `&su=${encodeURIComponent(sujet)}`
    + `&body=${encodeURIComponent(corps)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
