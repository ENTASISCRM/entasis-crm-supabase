# Lead Room, code hébergé ici faute de mieux

Ce dossier contient du code destiné au projet Supabase de la **Lead Room**
(`mtqowhjshvgkpkhnpilb`), pas au CRM. Il vit dans ce dépôt parce que le dépôt
de la Lead Room n'est pas accessible depuis les sessions de travail du CRM. À
déplacer là bas dès que possible.

## meta-leadgen : recevoir les leads Facebook sans Zapier

`functions/meta-leadgen/index.ts` reçoit les notifications « leadgen » de Meta,
vérifie leur signature, va chercher le lead par l'API Graph, retrouve la
campagne Lead Room par l'identifiant du formulaire et rejoue l'appel que Zapier
faisait. Le score et la priorité restent calculés par la Lead Room.

`migrations/20260926_meta_leadgen.sql` crée les deux tables dont elle a besoin.

### Mise en route, dans l'ordre

1. Jouer la migration dans l'éditeur SQL de la Lead Room.
2. Poser les secrets (Supabase → Edge Functions → Secrets) : `META_APP_SECRET`,
   `META_VERIFY_TOKEN`, `META_PAGE_TOKEN`, `LEADROOM_WEBHOOK_URL`,
   `LEADROOM_WEBHOOK_SECRET`, `LEADROOM_WEBHOOK_HEADER`.
3. Déployer la fonction avec `verify_jwt` à faux.
4. Côté Meta : abonner l'application au webhook `leadgen` avec l'URL
   `https://mtqowhjshvgkpkhnpilb.supabase.co/functions/v1/meta-leadgen` et le
   jeton de vérification choisi à l'étape 2, puis abonner la page.
5. Rattacher chaque formulaire à sa campagne dans `meta_forms`.
6. Tester avec l'outil de test des Lead Ads de Meta et lire
   `meta_leadgen_events` : statut `transmis` attendu.

Un lead reçu pour un formulaire inconnu reste en `form_inconnu` avec sa
notification brute : rattacher le formulaire, puis rejouer la notification.
