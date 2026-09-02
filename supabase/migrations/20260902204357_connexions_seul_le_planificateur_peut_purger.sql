-- La purge du journal de connexions restait executable par tout le monde :
-- PostgreSQL accorde EXECUTE a PUBLIC par defaut sur une fonction neuve, et
-- mon REVOKE ne visait que authenticated et anon, pas PUBLIC. N importe quel
-- conseiller connecte pouvait donc effacer six mois de journal d un appel.
-- Un journal de securite que le surveille peut vider ne sert a rien.
REVOKE EXECUTE ON FUNCTION public.purger_login_audit() FROM PUBLIC;

-- Meme correction preventive sur la fonction serveur : seule la cle de
-- service doit pouvoir ecrire une connexion localisee.
REVOKE EXECUTE ON FUNCTION public.enregistrer_connexion_serveur(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
