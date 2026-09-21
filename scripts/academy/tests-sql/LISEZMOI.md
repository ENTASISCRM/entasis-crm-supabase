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
