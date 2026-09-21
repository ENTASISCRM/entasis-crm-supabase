-- Entasis Academy, migration 4 : la purge des intervalles, planifiee.
--
-- La notice de donnees promet que les intervalles bruts d activite sont
-- purges apres la retention fixee par le cabinet (academy_parametres,
-- douze mois par defaut), un total par jour etant conserve dans
-- academy_durees_jour. La fonction academy_purger_intervalles() existe
-- depuis la migration 2, reservee a la cle de service ; ici on la fait
-- tourner chaque nuit par pg_cron, comme purge-journal-cron et
-- purge-login-audit, a une heure ou personne ne travaille.
--
-- Le projet DEV n a pas pg_cron : le bloc ne fait rien si l extension est
-- absente, la migration reste applicable partout. Idempotent : le job est
-- retire puis recree.
do $do$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron absent : purge Academy non planifiee';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'academy-purge-intervalles';
  perform cron.schedule('academy-purge-intervalles', '40 3 * * *', 'select public.academy_purger_intervalles()');
end
$do$;
