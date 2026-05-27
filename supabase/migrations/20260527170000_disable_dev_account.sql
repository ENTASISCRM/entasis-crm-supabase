-- Désactive le compte développeur "martin borgis" qui apparaissait dans
-- la vue Management. C'est un compte technique, pas un conseiller réel.
--
-- Idempotent : si le profil n'existe pas / déjà désactivé, no-op.

update public.profiles
   set is_active = false
 where lower(full_name) like '%martin%borgis%'
    or lower(full_name) like '%borgis%martin%'
    or lower(email) like '%martin%borgis%'
    or lower(email) like '%borgis%';

-- Si tu veux aussi le retirer des advisors Lead Room côté CRM (au cas où
-- il aurait été pushé), décommente :
-- update public.advisors set active = false
--  where lower(name) like '%martin%borgis%' or lower(email) like '%borgis%';
