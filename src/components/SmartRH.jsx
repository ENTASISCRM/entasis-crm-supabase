// ═══════════════════════════════════════════════════════════════════════════
// SMART RH : congés en libre-service
//
// Les alternants et l équipe posent une demande de congé (type, dates, motif),
// la direction valide ou refuse. Chacun voit ses demandes et leur statut ; la
// direction voit tout, décide, et dispose d un planning des absences à venir.
// Périmètre géré par la RLS de rh_conges. Aucun envoi de mail ici (v1).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listConges, createConge, createCongeDirection, decideConge, cancelConge, contreProposer, repondreContreProposition } from '../services/conges'
import { getOwn as getOwnContrat, list as listContrats } from '../services/conseillerContrats'
import { soldeConges, soldeAuRetour, joursDemande, joursDemandeSimples, joursOuvres, joursOuvresSimples, fmtJours, estFerie } from '../lib/conges-solde'

const TYPES = ['Congé payé', 'RTT', 'Sans solde', 'Maladie', 'Autre']
// Jours de formation des alternants : ni travailles au cabinet, ni conges.
// Reserve aux contrats ALTERNANT (choix visible seulement pour eux).
const TYPE_ECOLE = 'École / CFA'
// Affichage du nombre de jours d une demande : regle du vendredi double pour
// les conges payes, jours ouvres simples pour tout le reste (ecole, maladie).
const nbJoursAffiche = (c) => (c.type === 'Congé payé' ? joursDemande(c) : joursDemandeSimples(c))
const STATUT_LIB = {
  en_attente: 'En attente', valide: 'Validé', refuse: 'Refusé',
  annule: 'Annulé', contre_proposee: 'Contre-proposition',
}

function fmt(iso) {
  if (!iso) return ''
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
const todayIso = () => new Date().toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────────────────────
// Calendrier mensuel des absences. La donnée est déjà cloisonnée par la
// RLS : la direction voit toute l équipe, un conseiller voit ses congés.
// Validé = bandeau plein, en attente = pointillé (utile pour repérer les
// chevauchements avant de valider).
// ─────────────────────────────────────────────────────────────────────────
const MOIS_LONGS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const COULEURS_PERS = ['#0071E3', '#34C759', '#AF52DE', '#FF9500', '#5AC8FA', '#FF2D55', '#A2845E', '#00C7BE']

function couleurPersonne(cle) {
  let h = 0
  const s = String(cle || '?')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return COULEURS_PERS[h % COULEURS_PERS.length]
}

function CalendrierAbsences({ conges }) {
  const [mois, setMois] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const aujourd = todayIso()

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  // Semaines du mois affiché, du lundi au dimanche
  const semaines = useMemo(() => {
    const premier = new Date(mois)
    const decalage = (premier.getDay() + 6) % 7
    const debut = new Date(premier)
    debut.setDate(premier.getDate() - decalage)
    const out = []
    const cur = new Date(debut)
    while (true) {
      const semaine = []
      for (let i = 0; i < 7; i++) { semaine.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
      out.push(semaine)
      if (cur.getMonth() !== mois.getMonth() && cur > mois) break
      if (out.length > 6) break
    }
    return out
  }, [mois])

  const pertinents = useMemo(
    () => (conges || []).filter((c) => c.statut === 'valide' || c.statut === 'en_attente'),
    [conges],
  )

  const absencesDuJour = (jIso) => pertinents.filter((c) => c.date_debut <= jIso && jIso <= (c.date_fin || c.date_debut))

  const nav = (delta) => setMois((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))

  return (
    <div className="cal">
      <div className="calhd">
        <div className="caltit">{MOIS_LONGS[mois.getMonth()]} {mois.getFullYear()}</div>
        <div className="calleg">
          <span className="calleg1">Validé</span>
          <span className="calleg2">En attente</span>
        </div>
        <div className="calnav">
          <button onClick={() => nav(-1)} title="Mois précédent">‹</button>
          <button onClick={() => setMois(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })}>Auj.</button>
          <button onClick={() => nav(1)} title="Mois suivant">›</button>
        </div>
      </div>
      <div className="calgrid calent">
        {JOURS_COURTS.map((j) => <div key={j} className="calj">{j}</div>)}
      </div>
      <div className="calgrid">
        {semaines.flat().map((d) => {
          const jIso = iso(d)
          const horsMois = d.getMonth() !== mois.getMonth()
          const weekend = d.getDay() === 0 || d.getDay() === 6
          const ferie = !horsMois && estFerie(d)
          // Pas de badge le week end ni les jours fériés : non décomptés,
          // les cases restent neutres même au milieu d un congé
          const abs = (horsMois || weekend || ferie) ? [] : absencesDuJour(jIso)
          return (
            <div
              key={jIso}
              className={`calc${horsMois ? ' hors' : ''}${weekend || ferie ? ' we' : ''}${jIso === aujourd ? ' auj' : ''}`}
              title={ferie ? 'Jour férié' : undefined}
            >
              <div className="calnum">{d.getDate()}{ferie ? <span className="calfer"> férié</span> : ''}</div>
              {abs.slice(0, 3).map((c) => {
                const prenom = String(c.demandeur_nom || c.advisor_code || '?').split(' ')[0]
                const attente = c.statut === 'en_attente'
                return (
                  <div
                    key={c.id}
                    className={`calchip${attente ? ' att' : ''}`}
                    style={{ background: attente ? 'transparent' : couleurPersonne(c.demandeur_id), borderColor: couleurPersonne(c.demandeur_id), color: attente ? couleurPersonne(c.demandeur_id) : '#fff' }}
                    title={`${c.demandeur_nom || ''} · ${c.type}${attente ? ' (en attente de validation)' : ''}${c.demi_journee ? ' · demi-journée' : ''}`}
                  >
                    {c.type === TYPE_ECOLE ? '\u{1F393} ' : ''}{prenom}
                  </div>
                )
              })}
              {abs.length > 3 && <div className="calplus">+{abs.length - 3}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function SmartRH({ profile, rhDelegue = false }) {
  // Le RH delegue (Claire) a la vue direction complete : validation,
  // saisie d absence, soldes, feuille de temps. La RLS is_rh() suit.
  const isManager = profile?.role === 'manager' || rhDelegue
  const [conges, setConges] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)

  // Formulaire de demande
  const [type, setType] = useState('Congé payé')
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const [demi, setDemi] = useState(false)
  const [motif, setMotif] = useState('')

  // Contre-proposition (direction) : formulaire ouvert sur une demande donnée
  const [cpPour, setCpPour] = useState(null)
  const [cpDu, setCpDu] = useState('')
  const [cpAu, setCpAu] = useState('')
  const [cpDemi, setCpDemi] = useState(false)
  const [cpMsg, setCpMsg] = useState('')

  // Contrat(s) : le mien pour afficher mon solde, tous pour la direction
  // (le solde du demandeur s affiche au moment de valider).
  const [monContrat, setMonContrat] = useState(null)
  const [contrats, setContrats] = useState([])

  // Absence enregistree par la direction (arret maladie, imprevu) : posee au
  // nom du salarie et validee d office.
  const [abOpen, setAbOpen] = useState(false)
  const [abQui, setAbQui] = useState('')
  const [abType, setAbType] = useState('Maladie')
  const [abDu, setAbDu] = useState('')
  const [abAu, setAbAu] = useState('')
  const [abDemi, setAbDemi] = useState(false)
  const [abMotif, setAbMotif] = useState('')

  // Salaries selectionnables : contrats actifs relies a un compte, hors
  // mandataires et gerant, dedupliques par personne
  const salariesAbsence = useMemo(() => {
    const vus = new Map()
    for (const k of contrats) {
      if (!k.actif || !k.profile_id) continue
      if (k.profile?.role === 'manager') continue
      if (!['ALTERNANT', 'STAGIAIRE', 'CDI', 'CDD'].includes(k.type_contrat)) continue
      if (!vus.has(k.profile_id)) vus.set(k.profile_id, k)
    }
    return Array.from(vus.values()).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [contrats])
  const abContrat = salariesAbsence.find((k) => k.profile_id === abQui) || null

  async function enregistrerAbsence() {
    if (!abQui) { toast.error('Choisis le salarié concerné'); return }
    if (!abDu || (!abDemi && !abAu)) { toast.error('Renseigne les dates'); return }
    if (!abDemi && abAu < abDu) { toast.error('La date de fin doit être après le début'); return }
    setSaving(true)
    try {
      await createCongeDirection({
        demandeur_id: abQui,
        demandeur_nom: abContrat?.full_name || null,
        advisor_code: abContrat?.profile?.advisor_code || abContrat?.matricule || null,
        type: abType,
        date_debut: abDu,
        date_fin: abDemi ? abDu : abAu,
        demi_journee: abDemi,
        motif: abMotif,
        decision_par: profile?.full_name || 'Direction',
      })
      toast.success('Absence enregistrée et validée')
      setAbOpen(false); setAbQui(''); setAbType('Maladie'); setAbDu(''); setAbAu(''); setAbDemi(false); setAbMotif('')
      await reload()
    } catch (e) { toast.error(e.message || 'Échec de l enregistrement') } finally { setSaving(false) }
  }

  // Feuille de temps PDF pour la comptable : mois choisi + generation en cours
  const [moisFeuille, setMoisFeuille] = useState(() => new Date().toISOString().slice(0, 7))
  const [pdfBusy, setPdfBusy] = useState(false)

  // ── Feuille de temps mensuelle (PDF, direction) ──────────────────────────
  // Une ligne par salarié en poste sur le mois : jours ouvrés du contrat,
  // absences validées (clippées au mois), jours travaillés, CP décomptés
  // (vendredi = 2) et solde CP en fin de mois. Sans accents (police jsPDF).
  async function genererFeuilleTemps() {
    setPdfBusy(true)
    try {
      const sa = (x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      const [annee, moisNum] = moisFeuille.split('-').map(Number)
      const nbJ = new Date(annee, moisNum, 0).getDate()
      const mDeb = `${moisFeuille}-01`
      const mFin = `${moisFeuille}-${String(nbJ).padStart(2, '0')}`
      const finDeMois = new Date(annee, moisNum - 1, nbJ, 23, 59)
      const nomMois = MOIS_LONGS[moisNum - 1]

      // Personnes en poste au moins un jour du mois (dédupliquées, contrat du mois)
      // Seuls les salaries en paie figurent sur la feuille : alternants,
      // stagiaires, CDI, CDD, dans cet ordre (demande Louis 25/07). Les
      // mandataires (independants) et le gerant n y sont pas.
      const ORDRE_PDF = { ALTERNANT: 0, STAGIAIRE: 1, CDI: 2, CDD: 3 }
      const vus = new Map()
      for (const k of contrats) {
        if (!k.actif) continue
        if (k.profile?.role === 'manager') continue
        if (!(k.type_contrat in ORDRE_PDF)) continue
        if (k.date_debut && k.date_debut > mFin) continue
        if (k.date_fin && k.date_fin < mDeb) continue
        const cle = k.profile_id || (k.full_name || '').toLowerCase().trim()
        if (!cle || vus.has(cle)) continue
        vus.set(cle, k)
      }
      const clip = (a, b) => [a < mDeb ? mDeb : a, (!b || b > mFin) ? mFin : b]
      const lignes = Array.from(vus.values()).map((k) => {
        const [pDeb, pFin] = clip(k.date_debut || mDeb, k.date_fin)
        const ouvres = joursOuvresSimples(pDeb, pFin)
        const absPerso = conges.filter((c) =>
          c.statut === 'valide' && c.demandeur_id && c.demandeur_id === k.profile_id &&
          c.date_debut <= mFin && (c.date_fin || c.date_debut) >= mDeb)
        let absOuvres = 0, ecoleOuvres = 0, cpDecomptes = 0
        const details = []
        for (const c of absPerso) {
          const [aDeb, aFin] = clip(c.date_debut, c.date_fin || c.date_debut)
          let jo = joursOuvresSimples(aDeb, aFin)
          if (c.demi_journee && jo > 0) jo = Math.max(0.5, jo - 0.5)
          let jd = joursOuvres(aDeb, aFin)
          if (c.demi_journee && jd > 0) jd = Math.max(0.5, jd - 0.5)
          // Les jours d ecole ne sont ni des absences ni des conges : ils
          // sortent des jours travailles au cabinet mais restent a part.
          if (c.type === TYPE_ECOLE) ecoleOuvres += jo
          else absOuvres += jo
          if (c.type === 'Congé payé') cpDecomptes += jd
          details.push({ nom: k.full_name, type: c.type, du: aDeb, au: aFin, jo, jd })
        }
        const solde = soldeConges(k, conges.filter((c) => c.demandeur_id === k.profile_id), finDeMois)
        return { k, ouvres, absOuvres, ecoleOuvres, travailles: ouvres - absOuvres - ecoleOuvres, cpDecomptes, solde, details }
      }).sort((a, b) =>
        (ORDRE_PDF[a.k.type_contrat] - ORDRE_PDF[b.k.type_contrat]) ||
        (a.k.full_name || '').localeCompare(b.k.full_name || ''))

      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const navy = [10, 22, 40]; const gold = [201, 169, 97]; const gris = [110, 120, 135]
      const W = 210
      let y = 0

      // Bandeau
      doc.setFillColor(...navy); doc.rect(0, 0, W, 26, 'F')
      doc.setTextColor(...gold); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text('ENTASIS CONSEIL', 14, 9)
      doc.setTextColor(255, 255, 255); doc.setFontSize(15)
      doc.text(sa(`Feuille de temps equipe · ${nomMois} ${annee}`), 14, 17)
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 205, 215)
      doc.text(sa(`Document comptabilite · genere le ${new Date().toLocaleDateString('fr-FR')}`), 14, 22.5)
      y = 34

      // Tableau recap
      // Les jours d ecole ne sont pas une colonne (demande Louis) : ils
      // restent deduits des jours travailles et detailles dans la section
      // des absences du mois.
      const cols = [
        { t: 'Salarie', x: 14, w: 46 },
        { t: 'Contrat', x: 60, w: 22 },
        { t: 'J. ouvres', x: 82, w: 20, r: true },
        { t: 'Absences', x: 102, w: 20, r: true },
        { t: 'Travailles', x: 122, w: 22, r: true },
        { t: 'CP decomptes', x: 144, w: 26, r: true },
        { t: 'Solde CP', x: 170, w: 26, r: true },
      ]
      const rowH = 7
      const drawHead = () => {
        doc.setFillColor(...navy); doc.rect(14, y, 182, rowH, 'F')
        doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
        for (const c of cols) doc.text(c.t, c.r ? c.x + c.w - 2 : c.x + 2, y + 4.8, c.r ? { align: 'right' } : undefined)
        y += rowH
      }
      drawHead()
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      lignes.forEach((l, i) => {
        if (y > 265) { doc.addPage(); y = 20; drawHead(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8) }
        if (i % 2 === 0) { doc.setFillColor(246, 244, 239); doc.rect(14, y, 182, rowH, 'F') }
        doc.setTextColor(30, 35, 45)
        doc.text(sa(l.k.full_name).slice(0, 30), 16, y + 4.8)
        doc.setTextColor(...gris)
        doc.text(sa({ ALTERNANT: 'Alternant', STAGIAIRE: 'Stagiaire' }[l.k.type_contrat] || l.k.type_contrat), 62, y + 4.8)
        doc.setTextColor(30, 35, 45)
        doc.text(String(l.ouvres), 100, y + 4.8, { align: 'right' })
        // Absences en rouge des qu il y en a : reperage immediat
        if (l.absOuvres > 0) { doc.setTextColor(255, 59, 48); doc.setFont('helvetica', 'bold') }
        doc.text(String(l.absOuvres), 120, y + 4.8, { align: 'right' })
        doc.setTextColor(30, 35, 45); doc.setFont('helvetica', 'normal')
        doc.text(String(l.travailles), 142, y + 4.8, { align: 'right' })
        doc.text(String(l.cpDecomptes), 168, y + 4.8, { align: 'right' })
        doc.text(l.solde ? String(l.solde.restant) : '-', 194, y + 4.8, { align: 'right' })
        y += rowH
      })
      doc.setDrawColor(...gold); doc.setLineWidth(0.5); doc.line(14, y, 196, y)
      y += 10

      // Detail des absences
      const tousDetails = lignes.flatMap((l) => l.details)
      doc.setFontSize(10); doc.setTextColor(...navy)
      doc.text('Detail des absences du mois', 14, y); y += 6
      doc.setFontSize(8); doc.setFont('helvetica', 'normal')
      if (tousDetails.length === 0) {
        doc.setTextColor(...gris); doc.text('Aucune absence validee sur le mois.', 14, y); y += 6
      } else {
        for (const d of tousDetails) {
          if (y > 275) { doc.addPage(); y = 20 }
          doc.setTextColor(30, 35, 45)
          const du = new Date(`${d.du}T00:00:00`).toLocaleDateString('fr-FR')
          const au = new Date(`${d.au}T00:00:00`).toLocaleDateString('fr-FR')
          doc.text(sa(`${d.nom} · ${d.type} · du ${du} au ${au} · ${d.jo} j ouvres${d.type === 'Congé payé' ? ` (${d.jd} decomptes)` : ''}`), 14, y)
          y += 5
        }
        y += 3
      }

      // Absences validees APRES le mois : elles sont deja deduites de la
      // colonne Solde CP (un conge valide est engage), on les liste pour que
      // la comptable comprenne le solde du tableau.
      const futurs = []
      for (const l of lignes) {
        const fut = conges.filter((c) =>
          c.statut === 'valide' && c.type === 'Congé payé' &&
          c.demandeur_id && c.demandeur_id === l.k.profile_id &&
          c.date_debut > mFin)
        for (const c of fut) {
          futurs.push({ nom: l.k.full_name, du: c.date_debut, au: c.date_fin || c.date_debut, jd: joursDemande(c) })
        }
      }
      if (futurs.length > 0) {
        if (y > 260) { doc.addPage(); y = 20 }
        doc.setFontSize(10); doc.setTextColor(...navy); doc.setFont('helvetica', 'bold')
        doc.text('Absences validees a venir (deja deduites du solde CP)', 14, y); y += 6
        doc.setFontSize(8); doc.setFont('helvetica', 'normal')
        for (const f of futurs.sort((a, b) => a.du.localeCompare(b.du))) {
          if (y > 275) { doc.addPage(); y = 20 }
          doc.setTextColor(30, 35, 45)
          const du = new Date(`${f.du}T00:00:00`).toLocaleDateString('fr-FR')
          const au = new Date(`${f.au}T00:00:00`).toLocaleDateString('fr-FR')
          doc.text(sa(`${f.nom} · du ${du} au ${au} · ${f.jd} j decomptes`), 14, y)
          y += 5
        }
        y += 3
      }

      // Mouvements du mois
      const arrivees = contrats.filter((k) => k.actif && (k.type_contrat in ORDRE_PDF) && k.date_debut >= mDeb && k.date_debut <= mFin)
      const departs = contrats.filter((k) => k.actif && (k.type_contrat in ORDRE_PDF) && k.date_fin && k.date_fin >= mDeb && k.date_fin <= mFin)
      if (arrivees.length > 0 || departs.length > 0) {
        if (y > 260) { doc.addPage(); y = 20 }
        doc.setFontSize(10); doc.setTextColor(...navy); doc.setFont('helvetica', 'bold')
        doc.text('Mouvements du mois', 14, y); y += 6
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 35, 45)
        for (const k of arrivees) {
          doc.text(sa(`Arrivee : ${k.full_name} (${k.type_contrat}) le ${new Date(`${k.date_debut}T00:00:00`).toLocaleDateString('fr-FR')}`), 14, y); y += 5
        }
        for (const k of departs) {
          doc.text(sa(`Fin de contrat : ${k.full_name} (${k.type_contrat}) le ${new Date(`${k.date_fin}T00:00:00`).toLocaleDateString('fr-FR')}`), 14, y); y += 5
        }
      }

      // Arrivees prevues APRES le mois de la feuille : toujours listees
      // (demande Louis) pour que la comptable anticipe les futures paies.
      const arriveesFutures = contrats
        .filter((k) => k.actif && (k.type_contrat in ORDRE_PDF) && k.date_debut && k.date_debut > mFin)
        .sort((a, b) => a.date_debut.localeCompare(b.date_debut))
      if (arriveesFutures.length > 0) {
        if (y > 255) { doc.addPage(); y = 20 } else { y += 3 }
        doc.setFontSize(10); doc.setTextColor(...navy); doc.setFont('helvetica', 'bold')
        doc.text('Arrivees prevues', 14, y); y += 6
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 35, 45)
        for (const k of arriveesFutures) {
          if (y > 275) { doc.addPage(); y = 20 }
          const lib = { ALTERNANT: 'Alternant', STAGIAIRE: 'Stagiaire' }[k.type_contrat] || k.type_contrat
          doc.text(sa(`${k.full_name} (${lib}) : arrivee le ${new Date(`${k.date_debut}T00:00:00`).toLocaleDateString('fr-FR')}`), 14, y)
          y += 5
        }
      }

      // Pied de page avec la regle de decompte
      doc.setFontSize(7); doc.setTextColor(...gris)
      doc.text(sa('Decompte CP : lundi a jeudi = 1 j, vendredi = 2 j (il emporte le samedi), week-ends non decomptes. Genere par le CRM Entasis.'), 14, 290)

      doc.save(`feuille-temps-entasis-${moisFeuille}.pdf`)
      toast.success('Feuille de temps telechargee')
    } catch (e) {
      console.error('[SmartRH] feuille de temps', e)
      toast.error('Generation impossible : ' + (e.message || ''))
    } finally { setPdfBusy(false) }
  }

  async function reload() {
    try {
      const [cg, contratData] = await Promise.all([
        listConges(),
        isManager ? listContrats().catch(() => []) : getOwnContrat().catch(() => null),
      ])
      setConges(cg)
      if (isManager) setContrats(contratData || [])
      else setMonContrat(contratData)
    } catch (e) { setErr(e.message || 'Erreur de chargement') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Les jours d ecole ne sont pas listes dans les demandes ni le planning :
  // ils vivent sur le calendrier (badge diplome) et la feuille de temps.
  const mesDemandes = useMemo(
    () => (isManager ? conges.filter((c) => c.demandeur_id === profile?.id) : conges)
      .filter((c) => c.type !== TYPE_ECOLE),
    [conges, isManager, profile?.id],
  )

  // Mon solde de congés payés (non manager) : acquis depuis le 1er septembre
  // moins les congés validés. null si le type de contrat n acquiert pas de CP.
  const monSolde = useMemo(
    () => (!isManager && monContrat ? soldeConges(monContrat, mesDemandes) : null),
    [isManager, monContrat, mesDemandes],
  )

  // Direction : congés groupés par demandeur + contrat actif par demandeur
  const congesParPersonne = useMemo(() => {
    const m = new Map()
    for (const c of conges) {
      if (!c.demandeur_id) continue
      const l = m.get(c.demandeur_id) || []
      l.push(c)
      m.set(c.demandeur_id, l)
    }
    return m
  }, [conges])
  const contratDe = (demandeurId) => contrats.find((k) => k.profile_id === demandeurId && k.actif)

  // Solde du demandeur pour une demande donnée (affiché à la validation)
  const soldeDemandeur = (c) => {
    if (c.type !== 'Congé payé' || !c.demandeur_id) return null
    const k = contratDe(c.demandeur_id)
    if (!k) return null
    return soldeConges(k, congesParPersonne.get(c.demandeur_id) || [])
  }
  const aValider = useMemo(() => conges.filter((c) => c.statut === 'en_attente'), [conges])
  const enAttenteReponse = useMemo(() => conges.filter((c) => c.statut === 'contre_proposee'), [conges])
  // Absences validées du MOIS EN COURS (même déjà passées : cas d une
  // saisie à la main par la direction, ex. arrêt maladie de la semaine
  // dernière) et de tous les mois suivants.
  const planning = useMemo(() => {
    const debutMois = `${todayIso().slice(0, 7)}-01`
    return conges
      .filter((c) => c.statut === 'valide' && (c.date_fin || c.date_debut) >= debutMois && c.type !== TYPE_ECOLE)
      .sort((a, b) => a.date_debut.localeCompare(b.date_debut))
  }, [conges])

  async function envoyer() {
    if (!du || !au) { toast.error('Renseigne les dates de début et de fin'); return }
    if (au < du) { toast.error('La date de fin doit être après le début'); return }
    setSaving(true)
    try {
      await createConge({
        demandeur_nom: profile?.full_name || profile?.email || null,
        advisor_code: profile?.advisor_code || null,
        type, date_debut: du, date_fin: demi ? du : au, demi_journee: demi, motif,
      })
      toast.success('Demande envoyée, en attente de validation')
      setDu(''); setAu(''); setMotif(''); setDemi(false); setType('Congé payé')
      await reload()
    } catch (e) { toast.error(e.message || 'Échec de l envoi') } finally { setSaving(false) }
  }
  async function decider(c, statut) {
    let dmotif = null
    if (statut === 'refuse') {
      dmotif = window.prompt(`Refuser la demande de ${c.demandeur_nom || 'ce collaborateur'}. Motif (facultatif) :`, '')
      if (dmotif === null) return
    }
    setSaving(true)
    try { await decideConge(c.id, statut, profile?.full_name || 'Direction', dmotif); toast.success(statut === 'valide' ? 'Congé validé' : 'Demande refusée'); await reload() }
    catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  function ouvrirContre(c) {
    setCpPour(c.id)
    setCpDu(c.date_debut); setCpAu(c.date_fin); setCpDemi(!!c.demi_journee); setCpMsg('')
  }
  async function envoyerContre(c) {
    if (!cpDu || (!cpDemi && !cpAu)) { toast.error('Renseigne les dates proposées'); return }
    if (!cpDemi && cpAu < cpDu) { toast.error('La date de fin doit être après le début'); return }
    setSaving(true)
    try {
      await contreProposer(c.id, { date_debut: cpDu, date_fin: cpAu, demi_journee: cpDemi, message: cpMsg }, profile?.full_name || 'Direction')
      toast.success('Contre-proposition envoyée')
      setCpPour(null)
      await reload()
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  async function repondreContre(c, accepte) {
    if (!accepte && !window.confirm('Refuser ces nouvelles dates ? La demande sera annulée.')) return
    setSaving(true)
    try {
      await repondreContreProposition(c.id, accepte)
      toast.success(accepte ? 'Nouvelles dates acceptées, congé validé' : 'Contre-proposition refusée')
      await reload()
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  async function annuler(c) {
    if (!window.confirm('Annuler cette demande ?')) return
    setSaving(true)
    try { await cancelConge(c.id); toast.success('Demande annulée'); await reload() }
    catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }

  const badge = (s) => <span className={`stag ${s}`}>{STATUT_LIB[s] || s}</span>

  return (
    <div className="srh">
      <style>{styles}</style>

      <div className="hd">
        <div>
          <h1>Smart RH</h1>
          <div className="sub">{isManager ? 'Validez les demandes de congés de l équipe' : 'Posez vos congés, la direction valide'}</div>
        </div>
        {aValider.length > 0 && isManager && <span className="kpi">{aValider.length} à valider</span>}
      </div>

      {loading && <div className="empty">Chargement…</div>}
      {err && <div className="empty err">Erreur : {err}</div>}

      {!loading && !err && (
        <div className="card calcard">
          <CalendrierAbsences conges={conges} />
        </div>
      )}

      {!loading && !err && (
        <div className="cols">
          {/* Colonne gauche : demander + mes demandes (pas pour la direction) */}
          {!isManager && (
          <div className="col">
            {monSolde && (
              <div className="solde">
                <div className="sv" style={monSolde.restant < 0 ? { color: '#FF3B30' } : undefined}>
                  {fmtJours(monSolde.restant)}
                </div>
                <div className="sl">de congés payés disponibles</div>
                <div className="sd">
                  Période du 1er juin au 31 mai : {fmtJours(monSolde.acquisPeriode)} acquis · {fmtJours(monSolde.prisPeriode)} pris · report {fmtJours(monSolde.report)}
                  {(() => {
                    const proj = soldeAuRetour(monContrat, mesDemandes)
                    return proj && proj.restant !== monSolde.restant
                      ? ` · au retour de vos congés (${fmt(proj.date)}) : ${fmtJours(proj.restant)}`
                      : ''
                  })()}
                </div>
              </div>
            )}
            <div className="card">
              <div className="ctit">Poser un congé</div>
              <div className="frm">
                <label>Type
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    {(monContrat?.type_contrat === 'ALTERNANT' ? [...TYPES, TYPE_ECOLE] : TYPES).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="chk">
                  <input type="checkbox" checked={demi} onChange={(e) => setDemi(e.target.checked)} /> Demi-journée
                </label>
                <div className="dates">
                  <label>Du
                    <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
                  </label>
                  {!demi && (
                    <label>Au
                      <input type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
                    </label>
                  )}
                </div>
                <label>Motif (facultatif)
                  <input type="text" placeholder="Ex. vacances, rendez-vous…" value={motif} onChange={(e) => setMotif(e.target.value)} />
                </label>
                {type === 'Congé payé' && du && (demi || au) && monSolde && (() => {
                  const n = joursDemande({ date_debut: du, date_fin: demi ? du : au, demi_journee: demi })
                  const depasse = n > monSolde.restant
                  return (
                    <div className={`frmnote${depasse ? ' warn' : ''}`}>
                      Cette demande : {fmtJours(n)} décomptés (le vendredi vaut 2 j)
                      {depasse ? ` · dépasse ton solde (${fmtJours(monSolde.restant)} disponibles), la direction tranchera` : ''}
                    </div>
                  )
                })()}
                <button className="pri" disabled={saving} onClick={envoyer}>Envoyer la demande</button>
              </div>
            </div>

            <div className="ctit2">Mes demandes</div>
            {mesDemandes.length === 0 && <div className="vide">Aucune demande pour le moment.</div>}
            {mesDemandes.map((c) => (
              <div className={`row ${c.statut}`} key={c.id}>
                <div className="rmain">
                  <div className="rl1">{c.type} {badge(c.statut)}</div>
                  <div className="rl2">{c.demi_journee ? `${fmt(c.date_debut)} (demi-journée)` : `${fmt(c.date_debut)} au ${fmt(c.date_fin)}`} · {fmtJours(nbJoursAffiche(c))}{c.type === 'Congé payé' ? ' décomptés' : ''}</div>
                  {c.statut === 'refuse' && c.decision_motif && <div className="rmotif">Motif : {c.decision_motif}</div>}
                  {c.statut === 'contre_proposee' && (
                    <div className="cpprop">
                      La direction propose plutôt : <b>{c.contre_demi_journee
                        ? `${fmt(c.contre_date_debut)} (demi-journée)`
                        : `${fmt(c.contre_date_debut)} au ${fmt(c.contre_date_fin)}`}</b>
                      {c.contre_message ? ` · « ${c.contre_message} »` : ''}
                    </div>
                  )}
                </div>
                {c.statut === 'en_attente' && <button className="lien" onClick={() => annuler(c)}>Annuler</button>}
                {c.statut === 'contre_proposee' && (
                  <div className="ract">
                    <button className="ok" disabled={saving} onClick={() => repondreContre(c, true)}>Accepter</button>
                    <button className="ko" disabled={saving} onClick={() => repondreContre(c, false)}>Refuser</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          )}

          {/* Colonne droite : validation + planning (direction) */}
          {isManager && (
            <div className="col mgr">
              {/* Bloc 1 : la file de decision (a valider + absences a venir) */}
              <div className="card">
              <div className="blochd">
                <div className="bk">Demandes</div>
                <div className="bt">À valider et absences à venir</div>
              </div>

              {/* Absence saisie directement par la direction (arret maladie…) */}
              <div className="ctit2">
                Enregistrer une absence
                <button className="lien" onClick={() => setAbOpen((v) => !v)}>{abOpen ? 'fermer' : '+ saisir'}</button>
              </div>
              {abOpen && (
                <div className="frm abfrm">
                  <label>Salarié
                    <select value={abQui} onChange={(e) => setAbQui(e.target.value)}>
                      <option value="">— choisir —</option>
                      {salariesAbsence.map((k) => (
                        <option key={k.profile_id} value={k.profile_id}>{k.full_name}</option>
                      ))}
                    </select>
                  </label>
                  <label>Type
                    <select value={abType} onChange={(e) => setAbType(e.target.value)}>
                      {(abContrat?.type_contrat === 'ALTERNANT' ? ['Maladie', 'Congé payé', 'RTT', 'Sans solde', TYPE_ECOLE, 'Autre'] : ['Maladie', 'Congé payé', 'RTT', 'Sans solde', 'Autre'])
                        .map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="chk">
                    <input type="checkbox" checked={abDemi} onChange={(e) => setAbDemi(e.target.checked)} /> Demi-journée
                  </label>
                  <div className="dates">
                    <label>Du<input type="date" value={abDu} onChange={(e) => setAbDu(e.target.value)} /></label>
                    {!abDemi && <label>Au<input type="date" value={abAu} min={abDu || undefined} onChange={(e) => setAbAu(e.target.value)} /></label>}
                  </div>
                  <label>Motif (facultatif)
                    <input type="text" placeholder="Ex. arrêt maladie reçu ce matin" value={abMotif} onChange={(e) => setAbMotif(e.target.value)} />
                  </label>
                  {abType === 'Congé payé' && abContrat && abDu && (abDemi || abAu) && (() => {
                    const s = soldeConges(abContrat, congesParPersonne.get(abQui) || [])
                    if (!s) return null
                    const n = joursDemande({ date_debut: abDu, date_fin: abDemi ? abDu : abAu, demi_journee: abDemi })
                    return (
                      <div className={`frmnote${n > s.restant ? ' warn' : ''}`}>
                        {fmtJours(n)} décomptés · solde après : {fmtJours(s.restant - n)}
                      </div>
                    )
                  })()}
                  <button className="pri" disabled={saving} onClick={enregistrerAbsence}>Enregistrer (validée d office)</button>
                </div>
              )}

              <div className="ctit2">À valider {aValider.length > 0 && <span className="pill">{aValider.length}</span>}</div>
              {aValider.length === 0 && <div className="vide ok">Aucune demande en attente.</div>}
              {aValider.map((c) => (
                <div key={c.id}>
                  <div className="row en_attente">
                    <div className="rmain">
                      <div className="rl1">{c.demandeur_nom || c.advisor_code || 'Collaborateur'} · {c.type}</div>
                      <div className="rl2">{c.demi_journee ? `${fmt(c.date_debut)} (demi-journée)` : `${fmt(c.date_debut)} au ${fmt(c.date_fin)}`} · {fmtJours(nbJoursAffiche(c))}{c.type === 'Congé payé' ? ' décomptés' : ''}{c.motif ? ` · ${c.motif}` : ''}</div>
                      {(() => {
                        const s = soldeDemandeur(c)
                        if (!s) return null
                        const apres = s.restant - joursDemande(c)
                        return (
                          <div className={`rsolde${apres < 0 ? ' neg' : ''}`}>
                            Solde : {fmtJours(s.restant)} disponibles · après validation : {fmtJours(apres)}
                            {apres < 0 ? ' (congés par anticipation)' : ''}
                          </div>
                        )
                      })()}
                    </div>
                    <div className="ract">
                      <button className="ok" disabled={saving} onClick={() => decider(c, 'valide')}>Valider</button>
                      <button className="cp" disabled={saving} onClick={() => (cpPour === c.id ? setCpPour(null) : ouvrirContre(c))}>Autres dates</button>
                      <button className="ko" disabled={saving} onClick={() => decider(c, 'refuse')}>Refuser</button>
                    </div>
                  </div>
                  {cpPour === c.id && (
                    <div className="cpform">
                      <div className="cptit">Proposer d autres dates à {c.demandeur_nom || 'ce collaborateur'}</div>
                      <label className="chk">
                        <input type="checkbox" checked={cpDemi} onChange={(e) => setCpDemi(e.target.checked)} /> Demi-journée
                      </label>
                      <div className="dates">
                        <label>Du<input type="date" value={cpDu} onChange={(e) => setCpDu(e.target.value)} /></label>
                        {!cpDemi && <label>Au<input type="date" value={cpAu} min={cpDu || undefined} onChange={(e) => setCpAu(e.target.value)} /></label>}
                      </div>
                      <input className="cpmsg" type="text" placeholder="Message (ex. période chargée, peux-tu décaler ?)" value={cpMsg} onChange={(e) => setCpMsg(e.target.value)} />
                      <div className="cpbtns">
                        <button className="pri" disabled={saving} onClick={() => envoyerContre(c)}>Envoyer la contre-proposition</button>
                        <button className="lien" onClick={() => setCpPour(null)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {enAttenteReponse.length > 0 && (
                <>
                  <div className="ctit2">Contre-propositions envoyées</div>
                  {enAttenteReponse.map((c) => (
                    <div className="row contre_proposee" key={c.id}>
                      <div className="rmain">
                        <div className="rl1">{c.demandeur_nom || c.advisor_code} · {c.type} {badge(c.statut)}</div>
                        <div className="rl2">
                          demandé : {c.demi_journee ? fmt(c.date_debut) : `${fmt(c.date_debut)} au ${fmt(c.date_fin)}`}
                          {' · '}proposé : <b>{c.contre_demi_journee ? fmt(c.contre_date_debut) : `${fmt(c.contre_date_debut)} au ${fmt(c.contre_date_fin)}`}</b>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="ctit2">Absences du mois et à venir</div>
              {planning.length === 0 && <div className="vide">Personne d absent pour l instant.</div>}
              {planning.map((c) => {
                // Jours décomptés par cette absence + solde restant du salarié
                // (le solde inclut déjà cette absence puisqu elle est validée)
                const s = soldeDemandeur(c)
                return (
                  <div className="prow" key={c.id}>
                    <span className="pn">{c.demandeur_nom || c.advisor_code}</span>
                    <span className="pd">{c.demi_journee ? `${fmt(c.date_debut)} (½)` : `${fmt(c.date_debut)} → ${fmt(c.date_fin)}`}</span>
                    <span className="pt">{c.type}</span>
                    <span className="pj">{fmtJours(nbJoursAffiche(c))}{c.type === 'Congé payé' ? ' pris' : ''}</span>
                    {s && (
                      <span className={`ps${s.restant < 0 ? ' neg' : ''}`}>
                        reste {fmtJours(s.restant)}
                      </span>
                    )}
                  </div>
                )
              })}

              </div>

              {/* Bloc 2, a part : les compteurs de conges de toute l equipe.
                  Une ligne par personne qui acquiert des conges payes (CDI,
                  CDD, alternants), stagiaires listes sans compteur. Pour les
                  doubles contrats (alternance puis CDI), contrat en cours. */}
              <div className="card">
              <div className="blochd">
                <div className="bk">Compteurs</div>
                <div className="bt">Soldes de l équipe</div>
                <div className="bs">2,5 j acquis par mois travaillé, le vendredi compte double, mis à jour à chaque validation.</div>
              </div>
              {(() => {
                const aujourdhui = todayIso()
                const vus = new Map()
                for (const k of contrats) {
                  if (!k.actif) continue
                  if (k.profile?.role === 'manager') continue
                  const cle = k.profile_id || (k.full_name || '').toLowerCase().trim()
                  if (!cle) continue
                  const dejaVu = vus.get(cle)
                  const enPoste = (!k.date_debut || k.date_debut <= aujourdhui) && (!k.date_fin || k.date_fin >= aujourdhui)
                  if (!dejaVu || (enPoste && !dejaVu.enPoste)) vus.set(cle, { contrat: k, enPoste })
                }
                const lignes = Array.from(vus.values())
                  .map(({ contrat: k }) => ({
                    k,
                    solde: soldeConges(k, k.profile_id ? (congesParPersonne.get(k.profile_id) || []) : []),
                  }))
                  .filter((l) => l.solde !== null || l.k.type_contrat === 'STAGIAIRE')
                  .sort((a, b) => (a.k.full_name || '').localeCompare(b.k.full_name || ''))
                if (lignes.length === 0) return <div className="vide">Aucun salarié avec compteur de congés.</div>
                // Groupé par type de contrat (demande Louis) : alternants,
                // CDI, CDD, puis les stagiaires (listés pour la visibilité
                // mais sans compteur : la gratification n ouvre pas de CP).
                const ORDRE = ['ALTERNANT', 'CDI', 'CDD', 'STAGIAIRE']
                const LIBELLES = { ALTERNANT: 'Alternants', CDI: 'CDI', CDD: 'CDD', STAGIAIRE: 'Stagiaires' }
                return ORDRE.flatMap((type) => {
                  // Dans chaque catégorie, tri par date d arrivée (les plus
                  // anciens d abord), le nom départage
                  const groupe = lignes
                    .filter((l) => l.k.type_contrat === type)
                    .sort((a, b) =>
                      String(a.k.date_debut || '9999').localeCompare(String(b.k.date_debut || '9999')) ||
                      (a.k.full_name || '').localeCompare(b.k.full_name || ''))
                  if (groupe.length === 0) return []
                  return [
                    <div className="pgroupe" key={`g-${type}`}>{LIBELLES[type]} · {groupe.length}</div>,
                    ...groupe.map(({ k, solde }) => {
                      const arrive = k.date_debut && k.date_debut > aujourdhui
                      const dispo = solde ? solde.report + solde.acquisPeriode : 0
                      const pct = solde && dispo > 0
                        ? Math.min(100, Math.max(0, (solde.prisPeriode / dispo) * 100))
                        : 0
                      const negatif = solde && solde.restant < 0
                      return (
                        <div className="srow" key={k.id}>
                          <span className="sinfo">
                            <span className="snom">{k.full_name}</span>
                            {k.date_debut && (
                              <span className="ssub sdates">
                                {k.date_fin
                                  ? `du ${fmt(k.date_debut)} au ${fmt(k.date_fin)}`
                                  : arrive
                                    ? `à partir du ${fmt(k.date_debut)}`
                                    : `depuis le ${fmt(k.date_debut)}`}
                              </span>
                            )}
                            <span className="ssub">
                              {solde
                                ? `période : ${fmtJours(solde.acquisPeriode)} acquis · ${fmtJours(solde.prisPeriode)} pris · report ${fmtJours(solde.report)}`
                                : 'sans compteur de congés payés'}
                            </span>
                          </span>
                          {solde && (
                            <span className="sgauge" title={`${Math.round(pct)} % des congés acquis déjà pris`}>
                              <span
                                className={`sfill${negatif ? ' neg' : ''}`}
                                style={{ width: `${negatif ? 100 : pct}%` }}
                              />
                            </span>
                          )}
                          {solde
                            ? (() => {
                                const proj = soldeAuRetour(k, congesParPersonne.get(k.profile_id) || [])
                                const projDiff = proj && proj.restant !== solde.restant
                                return (
                                  <span className={`sreste${negatif ? ' neg' : ''}`}>
                                    {fmtJours(solde.restant)}<small>restants</small>
                                    {projDiff && <small className="sproj">{fmtJours(proj.restant)} au retour ({fmt(proj.date)})</small>}
                                  </span>
                                )
                              })()
                            : <span className="sreste vide2">—</span>}
                        </div>
                      )
                    }),
                  ]
                })
              })()}
              </div>

              {/* Bloc 3 : export comptabilite */}
              <div className="card">
                <div className="blochd">
                  <div className="bk">Comptabilité</div>
                  <div className="bt">Feuille de temps mensuelle</div>
                  <div className="bs">PDF récapitulatif de toute l équipe : jours travaillés, absences détaillées, CP décomptés, soldes et mouvements du mois.</div>
                </div>
                <div className="ftrow">
                  <input
                    type="month"
                    value={moisFeuille}
                    onChange={(e) => setMoisFeuille(e.target.value)}
                    aria-label="Mois de la feuille de temps"
                  />
                  <button className="pri" disabled={pdfBusy || !moisFeuille} onClick={genererFeuilleTemps}>
                    {pdfBusy ? 'Génération…' : '📄 Télécharger le PDF'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const styles = `
.srh{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; --navy:#0A1628; --gold:#C9A961; --gold-dk:#A6843F; --vert:#2C6B4E; color:var(--ink); font-size:13px }
.srh *{ box-sizing:border-box }
.srh .hd{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px }
.srh h1{ font-size:22px; font-weight:700; color:var(--navy); margin:0; letter-spacing:-.02em }
.srh .sub{ color:var(--silver); font-size:12px; margin-top:2px }
.srh .kpi{ background:#FBF4E4; border:1px solid rgba(201,169,97,.5); color:var(--gold-dk); border-radius:999px; padding:5px 12px; font-size:12px; font-weight:750 }
.srh .empty{ padding:22px; text-align:center; color:var(--silver) }
.srh .err{ color:#B4453B }
.srh .cols{ display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap }
.srh .col{ flex:1; min-width:300px }
.srh .col.mgr{ max-width:760px }
.srh .card{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 16px; box-shadow:0 1px 2px rgba(10,22,40,.04); margin-bottom:16px }
.srh .ctit{ font-size:14px; font-weight:750; color:var(--navy); margin-bottom:10px }
.srh .ctit2{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--silver); font-weight:750; margin:14px 0 8px; display:flex; align-items:center; gap:8px }
.srh .pill{ background:#E4A23C; color:#fff; border-radius:999px; padding:1px 8px; font-size:11px; font-weight:800; letter-spacing:0 }
.srh .frm{ display:flex; flex-direction:column; gap:10px }
.srh .frm label{ display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--silver) }
.srh .frm label.chk{ flex-direction:row; align-items:center; gap:7px; text-transform:none; letter-spacing:0; font-size:12.5px; color:var(--ink); font-weight:600 }
.srh .frm input[type=text],.srh .frm input[type=date],.srh .frm select{ border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:13px; background:#fff; color:var(--ink); font-weight:600 }
.srh .dates{ display:flex; gap:10px }
.srh .dates label{ flex:1 }
.srh .pri{ background:var(--navy); color:#fff; border:none; border-radius:10px; padding:10px; font-size:13px; font-weight:750; cursor:pointer; margin-top:2px }
.srh .pri:disabled{ opacity:.5; cursor:default }
.srh .row{ display:flex; align-items:center; gap:10px; background:#fff; border:1px solid var(--line); border-left:3px solid var(--line); border-radius:10px; padding:9px 13px; margin-bottom:7px }
.srh .row.en_attente{ border-left-color:#E4A23C }
.srh .row.valide{ border-left-color:var(--vert) }
.srh .row.refuse{ border-left-color:#B4453B }
.srh .row.annule{ opacity:.6 }
.srh .rmain{ flex:1; min-width:0 }
.srh .rl1{ font-weight:750; color:var(--navy); font-size:13px; display:flex; align-items:center; gap:8px; flex-wrap:wrap }
.srh .rl2{ font-size:11.5px; color:#5b6470; margin-top:2px }
.srh .rmotif{ font-size:11px; color:#B4453B; margin-top:2px }
.srh .stag{ font-size:9.5px; font-weight:800; letter-spacing:.04em; border-radius:999px; padding:2px 8px; text-transform:uppercase }
.srh .stag.en_attente{ background:#FBEED8; color:#9A6A1B }
.srh .stag.valide{ background:#E7F3EC; color:var(--vert) }
.srh .stag.refuse{ background:#FBECEC; color:#B4453B }
.srh .stag.annule{ background:#F1F1EE; color:var(--silver) }
.srh .ract{ display:flex; gap:6px; flex-shrink:0 }
.srh .ract .ok{ background:var(--vert); color:#fff; border:none; border-radius:8px; padding:7px 13px; font-size:12px; font-weight:750; cursor:pointer }
.srh .ract .ko{ background:#fff; color:#B4453B; border:1px solid #E8CFCB; border-radius:8px; padding:7px 13px; font-size:12px; font-weight:700; cursor:pointer }
.srh .lien{ background:none; border:none; color:var(--silver); text-decoration:underline; font-size:11.5px; cursor:pointer; flex-shrink:0 }
.srh .row.contre_proposee{ border-left-color:#5B4B8A }
.srh .stag.contre_proposee{ background:#EDE7F8; color:#5B4B8A }
.srh .ract .cp{ background:#fff; color:#5B4B8A; border:1px solid #C9BEEB; border-radius:8px; padding:7px 12px; font-size:12px; font-weight:700; cursor:pointer }
.srh .ract .cp:hover{ background:#5B4B8A; color:#fff }
.srh .cpform{ background:#F6F4FC; border:1px solid #DCD4EE; border-radius:11px; padding:12px 14px; margin:0 0 8px }
.srh .cptit{ font-size:12px; font-weight:750; color:#5B4B8A; margin-bottom:8px }
.srh .cpform .chk{ display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:8px }
.srh .cpform .dates{ display:flex; gap:10px; margin-bottom:8px }
.srh .cpform .dates label{ flex:1; display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--silver) }
.srh .cpform input[type=date]{ border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:13px; background:#fff; font-weight:600 }
.srh .cpmsg{ width:100%; border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:12.5px; background:#fff }
.srh .cpbtns{ display:flex; align-items:center; gap:10px; margin-top:9px }
.srh .cpbtns .pri{ margin-top:0; padding:8px 14px; font-size:12.5px }
.srh .cpprop{ font-size:11.5px; color:#5B4B8A; background:#F3F0FA; border:1px solid #DCD4EE; border-radius:8px; padding:6px 9px; margin-top:5px; line-height:1.4 }
.srh .vide{ font-size:12px; color:var(--silver); padding:8px 2px }
.srh .vide.ok{ color:#4a7a52 }
.srh .calcard{ margin-bottom:18px; padding:14px 16px }
.srh .calhd{ display:flex; align-items:center; gap:12px; margin-bottom:10px }
.srh .caltit{ font-size:14px; font-weight:700; color:var(--t1,#1c1c1e); flex:1 }
.srh .calleg{ display:flex; gap:10px; font-size:10.5px; color:var(--t3,#8a8a8e); align-items:center }
.srh .calleg1::before{ content:''; display:inline-block; width:14px; height:8px; border-radius:4px; background:#0071E3; margin-right:4px; vertical-align:middle }
.srh .calleg2::before{ content:''; display:inline-block; width:14px; height:8px; border-radius:4px; border:1.5px dashed #0071E3; margin-right:4px; vertical-align:middle }
.srh .calnav{ display:flex; gap:4px }
.srh .calnav button{ border:1px solid rgba(0,0,0,.12); background:#fff; border-radius:8px; padding:3px 10px; font-size:12px; cursor:pointer; color:var(--t1,#1c1c1e) }
.srh .calnav button:hover{ background:rgba(0,0,0,.04) }
.srh .calgrid{ display:grid; grid-template-columns:repeat(7,1fr); gap:3px }
.srh .calent{ margin-bottom:3px }
.srh .calj{ font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--t3,#8a8a8e); text-align:center; padding:2px 0 }
.srh .calc{ min-height:58px; border:0.5px solid rgba(0,0,0,.07); border-radius:8px; padding:3px 4px; background:#fff; overflow:hidden }
.srh .calc.we{ background:rgba(0,0,0,.02) }
.srh .calc.hors{ background:transparent; border-color:transparent }
.srh .calc.auj{ border-color:var(--gold,#C9A961); box-shadow:0 0 0 1px var(--gold,#C9A961) inset }
.srh .calc.auj .calnum{ color:var(--gold-dk,#A6843F); font-weight:800 }
.srh .calnum{ font-size:10.5px; font-weight:600; color:var(--t3,#8a8a8e); margin-bottom:2px; font-variant-numeric:tabular-nums }
.srh .calchip{ font-size:9.5px; font-weight:700; border-radius:5px; padding:1px 5px; margin-bottom:2px; border:1.5px solid transparent; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.srh .calchip.att{ border-style:dashed }
.srh .calplus{ font-size:9px; color:var(--t3,#8a8a8e); font-weight:700 }
.srh .calfer{ font-size:8px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--gold-dk,#A6843F) }
@media(max-width:700px){ .srh .calc{ min-height:44px } .srh .calchip{ font-size:8.5px; padding:1px 3px } }
.srh .solde{ background:linear-gradient(135deg,#FBF4E4,#fff); border:1px solid rgba(201,169,97,.5); border-radius:14px; padding:16px 18px; margin-bottom:14px }
.srh .solde .sv{ font-size:30px; font-weight:800; letter-spacing:-0.02em; color:var(--gold-dk,#A6843F); line-height:1 }
.srh .solde .sl{ font-size:13px; font-weight:650; color:var(--t1,#1c1c1e); margin-top:4px }
.srh .solde .sd{ font-size:11.5px; color:var(--t3,#8a8a8e); margin-top:4px }
.srh .frmnote{ font-size:12px; color:var(--t2,#555); background:rgba(0,0,0,.03); border-radius:8px; padding:7px 10px }
.srh .frmnote.warn{ color:#8a5a00; background:rgba(255,149,0,.10) }
.srh .rsolde{ font-size:11.5px; color:var(--gold-dk,#A6843F); margin-top:3px; font-weight:600 }
.srh .rsolde.neg{ color:#FF3B30 }
.srh .prow{ display:flex; align-items:center; gap:10px; padding:6px 2px; border-bottom:1px solid #F4F2ED; font-size:12.5px }
.srh .prow .pn{ font-weight:700; color:var(--navy); min-width:120px }
.srh .prow .pd{ color:#5b6470; flex:1; font-variant-numeric:tabular-nums }
.srh .prow .pt{ font-size:10.5px; font-weight:700; color:var(--gold-dk); background:#FBF4E4; border-radius:5px; padding:1px 7px }
.srh .ftrow{ display:flex; gap:10px; align-items:center; margin-top:10px }
.srh .ftrow input[type=month]{ border:1px solid rgba(0,0,0,.14); border-radius:9px; padding:7px 10px; font-size:13px; font-family:inherit; color:var(--t1,#1c1c1e); background:#fff }
.srh .blochd{ margin-bottom:6px }
.srh .blochd .bk{ font-size:10.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--gold,#C9A961) }
.srh .blochd .bt{ font-size:14px; font-weight:700; color:var(--t1,#1c1c1e); margin-top:3px }
.srh .blochd .bs{ font-size:11.5px; color:var(--t3,#8a8a8e); margin-top:2px }
.srh .pgroupe{ font-size:10px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:var(--gold-dk,#A6843F); margin:14px 0 4px; padding-bottom:4px; border-bottom:1px solid rgba(201,169,97,.25) }
.srh .srow{ display:flex; align-items:center; gap:10px; padding:8px 2px; border-bottom:1px solid #F4F2ED }
.srh .srow:last-child{ border-bottom:none }
.srh .sinfo{ display:flex; flex-direction:column; min-width:0; flex:1 }
.srh .snom{ font-size:12.5px; font-weight:700; color:var(--navy,#162443); white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.srh .ssub{ font-size:10.5px; color:var(--t3,#8a8a8e); white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.srh .ssub.sdates{ color:var(--t2,#555); font-weight:600 }
.srh .sgauge{ width:90px; height:6px; flex-shrink:0; background:rgba(0,0,0,.06); border-radius:3px; overflow:hidden }
.srh .sfill{ display:block; height:100%; border-radius:3px; background:linear-gradient(90deg,var(--gold,#C9A961),var(--gold-dk,#A6843F)); transition:width 300ms ease }
.srh .sfill.neg{ background:#FF3B30 }
.srh .sreste{ flex-shrink:0; min-width:66px; text-align:right; font-size:14px; font-weight:800; color:var(--navy,#162443); font-variant-numeric:tabular-nums }
.srh .sreste small{ display:block; font-size:8.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--t3,#8a8a8e) }
.srh .sreste.neg{ color:#FF3B30 }
.srh .sreste .sproj{ color:var(--gold-dk,#A6843F); font-size:8.5px; text-transform:none; letter-spacing:0 }
.srh .sreste.vide2{ color:var(--t3,#8a8a8e); font-weight:500 }
.srh .prow .pj{ font-size:11px; font-weight:700; color:#0071E3; background:rgba(0,113,227,.08); border-radius:5px; padding:1px 7px; white-space:nowrap }
.srh .prow .ps{ font-size:11px; font-weight:700; color:#34C759; background:rgba(52,199,89,.10); border-radius:5px; padding:1px 7px; white-space:nowrap }
.srh .prow .ps.neg{ color:#FF3B30; background:rgba(255,59,48,.10) }
@media(max-width:760px){ .srh .cols{ flex-direction:column } }
`
