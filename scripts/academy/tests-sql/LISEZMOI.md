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
