-- ═══════════════════════════════════════════════════════════════════════════
-- VERROUILLAGE public.invitations — projet CRM (tvgbblbceqvdtqnbeoik)
-- Date : 2026-07-15. Idempotent, à coller dans le SQL Editor.
--
-- FAILLE (détectée en prod via PROD-CHECK.sql A7-A8)
-- La policy `invitations_select_by_token` était ouverte à {anon, authenticated}
-- en USING(true) : la clé anon publique (embarquée dans le JS du frontend)
-- pouvait faire `SELECT * FROM public.invitations` et récupérer TOUS les emails,
-- rôles, advisor_codes et types de contrat. `invitations_update_used` exposait
-- de même un UPDATE anon.
--
-- CORRECTIF (pattern RPC SECURITY DEFINER — reco officielle Supabase)
-- Le seul besoin anon légitime — un nouvel arrivant, non authentifié, qui clique
-- sur ?invite=<token> pour pré-remplir son inscription — passe désormais par
-- deux fonctions SECURITY DEFINER qui n'exposent QUE le strict nécessaire pour
-- un token valide, sans jamais ouvrir la table en lecture/écriture directe.
-- Toutes les autres opérations (list/create/setTypeContrat/remove) restent
-- couvertes par `invitations_manager` (ALL to authenticated USING is_manager()).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Validation de token (lecture ciblée) ════════════════════════════════
-- Retourne un objet JSON {role, advisor_code, email} SI le token est valide
-- (existe, non consommé, non expiré), sinon NULL. Le type de retour jsonb (et
-- non RETURNS TABLE) garantit que PostgREST renvoie un objet unique ou NULL —
-- compatible avec le contrat frontend `data ?? null` / `if (!data)`.
-- NB : type_contrat n'est PAS retourné — la colonne invitations.type_contrat
-- n'existe pas en prod (migration 20260525140000 jamais appliquee) et le flux
-- de signup ne la consomme pas. À réintroduire seulement si cette migration est
-- appliquee ET qu'un besoin de pre-remplissage apparait.
create or replace function public.validate_invitation_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select to_jsonb(t) into v_result
  from (
    select i.role, i.advisor_code, i.email
    from public.invitations i
    where i.token = p_token
      and i.used_at is null
      and i.expires_at > now()
  ) t;
  return v_result;  -- NULL si aucun token valide ne correspond
end;
$$;

comment on function public.validate_invitation_token(text) is
  'Onboarding : valide un token d''invitation (existe, non consomme, non expire) '
  'et renvoie uniquement role/advisor_code/email pour pre-remplir l''inscription. '
  'SECURITY DEFINER : remplace la lecture anon directe de la table (policy '
  'invitations_select_by_token supprimee). Renvoie NULL si invalide.';

-- ═══ 2. Marquage « consommée » (après signup) ═══════════════════════════════
-- Ne modifie que used_at (aucune lecture, aucun autre champ). Surface strictement
-- inferieure a l'ancienne policy anon UPDATE. Guard `used_at is null` = idempotent
-- (un 2e appel est un no-op, n'ecrase pas l'horodatage initial).
create or replace function public.mark_invitation_used(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invitations
  set used_at = now()
  where token = p_token
    and used_at is null;
end;
$$;

comment on function public.mark_invitation_used(text) is
  'Onboarding : marque une invitation comme consommee (used_at = now()) apres '
  'signup. SECURITY DEFINER : remplace la policy anon UPDATE invitations_update_used. '
  'Ne flippe que used_at, idempotent (no-op si deja consommee).';

-- ═══ 3. Droits d'exécution ══════════════════════════════════════════════════
-- On retire tout droit par defaut (public) puis on autorise explicitement anon
-- (nouvel arrivant non authentifie) ET authenticated (robustesse : si la
-- confirmation d'email Supabase est desactivee, le signup cree une session et
-- markUsed tourne en authenticated non-manager — le grant authenticated evite
-- un echec silencieux). Aucune surface ajoutee : les fonctions ne lisent qu'un
-- token precis / ne modifient que used_at.
revoke all on function public.validate_invitation_token(text) from public;
revoke all on function public.mark_invitation_used(text) from public;

grant execute on function public.validate_invitation_token(text) to anon, authenticated;
grant execute on function public.mark_invitation_used(text)     to anon, authenticated;

-- ═══ 4. Suppression des policies devenues inutiles (surface anon) ════════════
-- Non versionnees dans ce repo (table invitations creee hors depot) mais
-- presentes en prod. DROP IF EXISTS = no-op si absentes (ex. en local).
-- RLS reste ACTIVEE sur la table ; `invitations_manager` reste en place.
drop policy if exists "invitations_select_by_token" on public.invitations;
drop policy if exists "invitations_update_used"     on public.invitations;
