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
