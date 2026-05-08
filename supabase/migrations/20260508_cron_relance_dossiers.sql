-- Schedule pg_cron : déclenche l'Edge Function relance-dossiers-vieillissants
-- tous les jours à 7h UTC (= 8h ou 9h Paris selon l'heure d'été).
--
-- Prérequis (à activer une seule fois côté projet, via Dashboard -> Database -> Extensions) :
--   - pg_cron : déclenche les jobs
--   - pg_net  : permet l'appel HTTP sortant
--
-- Avant d'appliquer cette migration, remplacer les placeholders ci-dessous :
--   - <PROJECT_REF> : ref du projet Supabase (visible dans Settings -> General).
--   - <SERVICE_ROLE_KEY> : clé service_role du projet (Settings -> API). À traiter
--     comme un secret. Idéalement la stocker via vault.create_secret(...) puis y
--     référer (cf doc Supabase). Pour démarrer simple, l'inliner ici suffit côté
--     projet privé — la clé n'est visible qu'aux admins de la base.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Supprime un job existant du même nom pour rester idempotent.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'relance-dossiers-vieillissants';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end $$;

select cron.schedule(
  'relance-dossiers-vieillissants',
  '0 7 * * *',
  $cmd$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/relance-dossiers-vieillissants',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $cmd$
);
