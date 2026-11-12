CREATE TABLE IF NOT EXISTS listings (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source           VARCHAR(32)  NOT NULL,              -- 'otodom' | 'seed'
  source_id        VARCHAR(64)  NOT NULL,              -- id on the source marketplace
  url              VARCHAR(512) NULL,
  title            VARCHAR(255) NOT NULL,
  description      MEDIUMTEXT   NULL,                  -- cleaned plain text
  summary          VARCHAR(600) NULL,                  -- short summary (AI or heuristic)

  price            INT UNSIGNED NULL,                  -- PLN
  area_m2          DECIMAL(7,2) NULL,
  price_per_m2     INT UNSIGNED NULL,                  -- derived
  rooms            TINYINT UNSIGNED NULL,

  floor            TINYINT NULL,                       -- 0 = ground floor
  total_floors     TINYINT UNSIGNED NULL,
  year_built       SMALLINT UNSIGNED NULL,
  market           ENUM('primary','secondary') NULL,
  condition_state  ENUM('to_renovate','good','excellent','developer_standard') NULL,

  has_elevator     TINYINT(1) NULL,                    -- NULL = unknown (not the same as 0!)
  has_balcony      TINYINT(1) NULL,
  has_parking      TINYINT(1) NULL,

  city             VARCHAR(80)  NULL,
  district         VARCHAR(120) NULL,
  street           VARCHAR(160) NULL,
  lat              DECIMAL(9,6) NULL,
  lng              DECIMAL(9,6) NULL,

  images           JSON NULL,                          -- array of URLs
  quality_score    TINYINT UNSIGNED NOT NULL DEFAULT 0, -- 0-100 completeness/clarity
  content_hash     CHAR(40) NOT NULL,                  -- for duplicate detection
  duplicate_of     INT UNSIGNED NULL,                  -- points to the canonical listing
  extraction       VARCHAR(16) NOT NULL DEFAULT 'rules', -- 'rules' | 'ai'
  raw              JSON NULL,                          -- original payload, for re-processing

  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_source (source, source_id),
  KEY idx_city_price (city, price),
  KEY idx_area (area_m2),
  KEY idx_hash (content_hash),
  KEY idx_dup (duplicate_of),
  FULLTEXT KEY ft_text (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
