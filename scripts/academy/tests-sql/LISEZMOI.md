# Scenarios d acceptation SQL d Entasis Academy

`acceptation.sql` joue, dans une seule transaction annulee a la fin, les
verifications demandees par le brief : corriges illisibles par un conseiller,
tentatives d un collegue invisibles, tirage sans corrige et idempotent par
jeton, soumission et correction en base, resoumission sans doublon, echec puis
reussite avec premier score conserve, deux revisions uniques dues a leur date
et faites une seule fois, fusion des intervalles d activite (deux onglets qui
se chevauchent ne comptent qu une fois), version publiee immuable, nouvelle
version imposee sans perte de la validation anterieure, pilotage reserve a la
direction avec « non evalue » distinct de zero.

Ou : projet de developpement `entasis-crm-DEV` (`leuqchrianpasianwmjg`)
seulement, apres les migrations `academy_1_socle`, `academy_2_fonctions` et
les treize fichiers de seed. Jamais en production.

Comment : executer le fichier entier (MCP `execute_sql`). Le bloc se termine
par une exception volontaire dont le message commence par `TESTS OK` et liste
les quatorze etapes ; toute autre exception commence par `ECHEC` et nomme
l etape. La transaction est annulee dans les deux cas : rien ne reste en base.

Identites simulees comme le fait PostgREST : `set local role authenticated`
et `request.jwt.claims` avec le `sub` d un profil fictif du projet DEV
(camille, noe, martin borgis).

Journal : joue le 21 septembre 2026 sur DEV apres le seed, quatorze etapes
`OK`. Le premier passage avait revele une erreur dans
`academy_nouvelle_version` (variable de boucle `q` homonyme de l alias de
table, « record q is not assigned yet ») : corrigee dans la migration 2
du depot et appliquee sur DEV sous le nom
`academy_2_correctif_nouvelle_version` (version 20260921103158). En
production, la migration 2 corrigee s applique telle quelle.

Relecture a froid contre la production (21 septembre 2026, quatre lentilles
puis contre expertise) : rien de bloquant, six corrections avant la mise en
production, toutes rejouees sur DEV (`academy_2_correctifs_relecture`) avec
le jeu d acceptation a quatorze etapes, deux verifications ajoutees :
* `academy_duree_active` et `academy_duree_version` n etaient pas reservees :
  tout compte authentifie pouvait lire le temps d activite d un collegue ;
  retirees des droits `authenticated` (seules les fonctions security
  definer les appellent) ;
* le trigger `academy_progression_garde` pose la version depuis la lecon a
  l insertion, au lieu de croire celle du client ;
* `academy_fiche` ne livre les commentaires de coaching qu a un manager,
  comme la policy ;
* `academy_durees_jour.lecon_id` non nul et en cascade (il fait partie de
  la cle) ; la purge ignore les intervalles orphelins ;
* le journal append only laisse passer la cle de service (cascade d une
  suppression de profil decidee par l administration) ;
* `set lock_timeout = '5s'` en tete du socle, et la notice de donnees dit
  qui lit quoi ; migration 4 : purge planifiee par pg_cron chaque nuit.

## Mode entrainement (migration 6)

`acceptation-entrainement.sql` joue, de la meme facon (un bloc, transaction
annulee, message `TESTS OK` ou `ECHEC`), le mode entrainement : verification
type par type de `academy_verifier_reponse`, deck de douze items cree par
les fonctions d administration (ordre et association stockes melanges,
corrige coherent), publication et affectation, items, corriges, forces et
sessions inaccessibles en direct par un conseiller (le deck se lit par
`academy_module`), tirage sans corrige et idempotent par jeton, session
incomplete refusee, reponses corrigees en base avec une fausse volontaire,
XP, serie, couronnes, validation a trois couronnes avec attestation,
cloisonnement entre collegues, pilotage, matrice et fiche cote direction,
immutabilite d une version publiee, nouvelle version dont les affectations
non validees suivent la publication, deck trop court refuse, corrige ambigu
(deux choix identiques) refuse, deck valide dont les forces retombent passe
« a revoir », purge des intervalles.

Ou : DEV seulement, apres les migrations 1 a 6 et les treize decks de la
migration 7.

Journal : joue le 21 septembre 2026 sur DEV, sept etapes vertes avant la
relecture adversariale ; puis, corrections appliquees sur DEV
(`academy_6_correctifs_relecture`, version 20260921152944) et reportees
dans les fichiers de migration 6, 6b et 6c du depot (une seule migration
logique en trois fichiers, chacun assez court pour l outil MCP ; corps des
fonctions identiques octet pour octet, verifie par md5), dix etapes vertes.
En production, les trois fichiers corriges s appliquent tels quels, dans
l ordre ; sur DEV, le meme contenu est enregistre sous le nom unique
`academy_6_entrainement` plus `academy_6_correctifs_relecture`.

## Gamification et schemas (migration 8)

`acceptation-gamification.sql` joue, de la meme facon (un bloc `do`,
transaction annulee, message `TESTS OK` ou `ECHEC`), tout ce que la
migration 8 ajoute : XP par reponse et combo (10, 10 puis 15 des la
troisieme bonne d affilee, 0 sur une erreur qui remet le combo a zero,
5 pour une carte sue), reprise d une session ouverte qui rend `xp_session`
et `combo`, rejeu qui rend les valeurs memorisees sans rien recalculer
(`deja`), bilan dont `xp_detail` se recoupe avec l XP de la session,
niveau qui monte de 1 a 2 puis au dela, succes `premiere_session`,
`premiere_couronne`, `combo_6`, puis `session_parfaite` et `deck_valide`,
colonne `etait_du` posee sur les reponses, defis du jour identiques pour
deux profils et credites une seule fois (leur XP entre dans l XP de la
session qui les gagne, donc `sum(academy_entrainements.xp)` reste la seule
source de l XP total), classement anonyme (camille premiere, noe deuxieme,
`xp_devant`, aucun nom ni identifiant dans le JSON, aucune cle inattendue),
ecritures directes refusees sur `academy_succes_obtenus` et
`academy_defis_faits`, cloche `defis_du_jour`, `schemas` et `figure` rendus
par `academy_demarrer_entrainement`, `academy_module` et
`academy_version_admin`, SVG de plus de 24 000 caracteres refuse par
`academy_enregistrer_version` (`check_violation`), schemas copies par
`academy_nouvelle_version` puis figes par le trigger d immutabilite,
pilotage et fiche avec le niveau et le nombre de succes.

Le fichier suppose `acceptation-entrainement.sql` vert : il ne rejoue pas
les verifications du mode entrainement. Les deux se jouent a la suite. Ils
sont separes parce que le premier depassait 40 Ko avec les nouvelles
etapes.

`acceptation-entrainement.sql` gagne de son cote les XP par reponse dans
sa boucle de session 1 (combo compris) et un `xp_detail` coherent en fin
de session, sans supposer quels defis tombent ce jour la (la part `defis`
du bilan est lue, pas devinee).

Ou : DEV seulement, apres les migrations 1 a 7 puis les trois fichiers de
la migration 8, dans l ordre 8, 8b, 8c.

Journal : joues le 22 septembre 2026 sur DEV, `TESTS OK` des deux cotes
(onze etapes pour l entrainement, sept pour la gamification) ; rejoues tels
quels le 24 septembre 2026, toujours verts. Migration appliquee en trois
fichiers, tous sous 40 Ko : `academy_8_gamification` (version
20260921221034), `academy_8b_gamification_fonctions` (20260921221237) et
`academy_8c_gamification_admin_pilotage` (20260921221422). Le troisieme
fichier n etait pas prevu par la conception : 8b ne tenait pas sous 40 Ko
avec les fonctions d administration, elles sont donc dans 8c
(`academy_enregistrer_version`, `academy_nouvelle_version`,
`academy_version_immuable`, `academy_version_admin`, `academy_pilotage`,
`academy_fiche` et les droits d execution).

Controle d identite entre le depot et DEV : `select name,
md5(statements[1]) from supabase_migrations.schema_migrations where name
like 'academy_8%'` rend a29618e2cc5e0ad813ced68c593d49ef,
699368df6931b0dd59dc03d2be36c1f5 et 57c8577fc34fe1dedc552d3621c7ed37, soit
exactement `md5 -q` des trois fichiers. Attention : l ordre enregistre la
derniere ligne blanche du fichier, il ne faut donc pas ajouter de saut de
ligne a `statements[1]` pour comparer.
