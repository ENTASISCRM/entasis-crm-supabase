-- Ouvrir l UPDATE au co conseiller a cree un trou : un WITH CHECK ne peut pas
-- lire l ancienne ligne, il ne verifie que la nouvelle. Or l application
-- reecrivait advisor_code avec le code de celui qui enregistre. Un co
-- conseiller qui ouvrait un dossier partage et cliquait Enregistrer devenait
-- titulaire : le dossier disparaissait du CRM du vrai titulaire, la moitie de
-- la PP s evaporait du classement, et la suppression devenait atteignable.
create or replace function proteger_titulaire_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mon_code text;
  suis_manager boolean;
  trouve boolean;
begin
  if new.advisor_code is not distinct from old.advisor_code then
    return new;
  end if;

  -- Hors session utilisateur (service_role, cron, migration) : on laisse faire.
  if auth.uid() is null then
    return new;
  end if;

  select p.advisor_code, p.role = 'manager', true
    into mon_code, suis_manager, trouve
  from profiles p where p.id = auth.uid();

  if not coalesce(trouve, false) then
    return new;
  end if;

  if coalesce(suis_manager, false) or old.advisor_code is not distinct from mon_code then
    return new;
  end if;

  raise exception
    'Seul le conseiller titulaire (%) ou la direction peut changer l attribution de ce dossier.',
    coalesce(old.advisor_code, 'non renseigne')
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_proteger_titulaire_deal on deals;
create trigger trg_proteger_titulaire_deal
  before update of advisor_code on deals
  for each row
  execute function proteger_titulaire_deal();
