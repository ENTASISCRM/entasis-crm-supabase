import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { retrocessionsAnnuelles, appliquerRetrocessions, contributionsAnnuelles, enrichirContributions } from '../api/_lib/pnl-retrocessions.js'
import { compteDeResultat, totaux, equipe, associes } from '../src/lib/pnl-calculs.js'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).replace(/^"|"$/g,'')]))
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{autoRefreshToken:false,persistSession:false} })
const annee = 2026
const { data: lignesBrutes, error } = await admin.rpc('pnl_conseiller_annuel', { p_annee: annee, p_repartir: null })
if (error) throw error
const [{ data: deals }, { data: contrats }] = await Promise.all([
  admin.from('deals').select('*'),
  admin.from('conseiller_contrats').select('*, profile:profile_id(id, advisor_code, full_name, is_active)'),
])
const retro = retrocessionsAnnuelles({ deals: deals||[], contrats: contrats||[], annee })
const avecRetro = appliquerRetrocessions(lignesBrutes||[], retro)
const contributions = contributionsAnnuelles({ deals: deals||[], contrats: contrats||[], annee })
const lignes = enrichirContributions(avecRetro, contributions)
const { data: mensuel } = await admin.from('production_encaissee').select('mois, commission_encaissee').eq('annee', annee).eq('source','BANQUE')
const encaisseBanque = (mensuel||[]).reduce((t,l)=>t+Number(l.commission_encaissee||0),0)
const { data: courantLignes } = await admin.rpc('pnl_cout_mensuel_courant', {})
const courant = Array.isArray(courantLignes)?courantLignes[0]:courantLignes
const structureMensuelle = Number(courant?.frais_fixes||0)
const structureAnnuelle = structureMensuelle*12
const cr = compteDeResultat(lignes, structureAnnuelle, encaisseBanque)
const tEquipe = totaux(equipe(lignes))
const tAsso = totaux(associes(lignes))
const sommeMarges = lignes.reduce((s,l)=>s+Number(l.marge||0),0)
console.log(JSON.stringify({
  nbLignes: lignes.length,
  encaisseBanque, structureMensuelle, structureAnnuelle,
  cr,
  tEquipe: {personnes:tEquipe.personnes, marge:tEquipe.marge, cout:tEquipe.cout, encaisse:tEquipe.encaisse, enPerte:tEquipe.enPerte, retro:tEquipe.retrocessions},
  tAsso: {personnes:tAsso.personnes, marge:tAsso.marge, encaisse:tAsso.encaisse},
  sommeMarges,
  identite_marges_moins_nonabs_plus_nonattr: sommeMarges - cr.structureNonAbsorbee + cr.encaisseNonAttribue,
  ecart_vs_resultat: (sommeMarges - cr.structureNonAbsorbee + cr.encaisseNonAttribue) - cr.resultat,
  retroSources: lignes.map(l=>({n:l.nom, src:l.retrocession_source, r:l.cout_retrocession, ff:l.cout_frais_fixes, marge:l.marge, rem:l.remuneration_associe, com:l.commission_encaissee, dossiers_crm:l.dossiers_crm})),
}, null, 1))
