-- ============================================================================
-- MIGRATION : Onglet Immobilier Neuf
-- Exécuter dans l'ordre dans Supabase SQL Editor
-- ============================================================================

-- 1. Promoteurs partenaires
CREATE TABLE promoteurs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  couleur TEXT DEFAULT '#22c55e',
  url_site TEXT,
  url_espace_partenaires TEXT,
  contact_nom TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Programmes immobilier neuf
CREATE TABLE programmes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  promoteur_id UUID REFERENCES promoteurs(id),
  promoteur_slug TEXT,
  nom TEXT NOT NULL,
  ville TEXT,
  code_postal TEXT,
  region TEXT DEFAULT 'ile-de-france',
  statut TEXT DEFAULT 'disponible',
  typologies TEXT[],
  dispositifs TEXT[],
  prix_a_partir_de INTEGER,
  date_livraison TEXT,
  image_url TEXT,
  url_fiche TEXT,
  nb_lots_total INTEGER,
  nb_lots_dispo INTEGER,
  dpe TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Dossiers clients immobilier
CREATE TABLE dossiers_immo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID,
  programme_id UUID REFERENCES programmes(id),
  conseiller_id UUID REFERENCES profiles(id),
  client_nom TEXT,
  client_email TEXT,
  client_telephone TEXT,
  objectif TEXT DEFAULT 'investissement',
  dispositif_retenu TEXT,
  budget_total INTEGER,
  apport INTEGER,
  statut_pipeline TEXT DEFAULT 'prospect',
  date_reservation DATE,
  date_financement DATE,
  date_acte DATE,
  date_livraison DATE,
  prix_lot INTEGER,
  honoraires_ht INTEGER,
  honoraires_percus BOOLEAN DEFAULT FALSE,
  url_espace_partenaire TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Index pour performance
CREATE INDEX idx_programmes_promoteur ON programmes(promoteur_slug);
CREATE INDEX idx_programmes_statut ON programmes(statut);
CREATE INDEX idx_dossiers_immo_conseiller ON dossiers_immo(conseiller_id);
CREATE INDEX idx_dossiers_immo_pipeline ON dossiers_immo(statut_pipeline);

-- 5. RLS
ALTER TABLE promoteurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers_immo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture programmes" ON programmes FOR SELECT USING (true);
CREATE POLICY "Lecture promoteurs" ON promoteurs FOR SELECT USING (true);
CREATE POLICY "Dossiers immo direction" ON dossiers_immo FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'direction'));
CREATE POLICY "Dossiers immo conseiller" ON dossiers_immo FOR ALL
  USING (conseiller_id = auth.uid());

-- 6. Seed promoteurs
INSERT INTO promoteurs (nom, slug, couleur, url_site, url_espace_partenaires) VALUES
  ('GreenCity Immobilier', 'greencity', '#16a34a', 'https://www.greencityimmobilier.fr', 'https://greencity.partenaires.iwit.pro'),
  ('Nexity', 'nexity', '#2563eb', 'https://www.nexity.fr', NULL),
  ('LP Promotion', 'lp-promotion', '#ea580c', 'https://www.lp-promotion.com', NULL);

-- Ajout policy INSERT/UPDATE pour les managers sur programmes
CREATE POLICY "Gestion programmes direction" ON programmes FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'direction'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'direction'));

-- Unique constraint sur url_fiche pour l'upsert
ALTER TABLE programmes ADD CONSTRAINT programmes_url_fiche_unique UNIQUE (url_fiche);
