-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION SECURITE. Date, 2026-09-04. Appliquee en production le 04/09/2026.
--
-- Le garde-fou anti-escalade ne couvrait que l UPDATE du role, de is_active et
-- de rh_delegue. Deux trous : advisor_code et email n etaient pas proteges,
-- alors que le pont vers la Lead Room exige justement un advisor_code non vide
-- pour accorder une connexion ; et le garde-fou pose sur l UPDATE seul ne
-- voyait pas passer un profil cree directement en manager, la politique
-- profiles_insert_own laissant inserer sa propre ligne sans controle.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'INSERT' then
    if not public.is_manager() then
      new.role := 'advisor';
      new.rh_delegue := false;
      new.advisor_code := null;  -- attribue ensuite par trg_profiles_advisor_code
    end if;
    return new;
  end if;
  if new.role is distinct from old.role and not public.is_manager() then
    raise exception 'Modification du role interdite';
  end if;
  if new.is_active is distinct from old.is_active and not public.is_manager() then
    raise exception 'Modification de is_active interdite';
  end if;
  if new.rh_delegue is distinct from old.rh_delegue and not public.is_manager() then
    raise exception 'Modification de la delegation RH interdite';
  end if;
  if new.advisor_code is distinct from old.advisor_code and not public.is_manager() then
    raise exception 'Modification du code conseiller interdite';
  end if;
  if new.email is distinct from old.email and not public.is_manager() then
    raise exception 'Modification de l email interdite';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_profiles_no_selfescalation_ins ON public.profiles;
CREATE TRIGGER trg_profiles_no_selfescalation_ins
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();
