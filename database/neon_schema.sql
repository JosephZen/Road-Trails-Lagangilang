-- ============================================================================
-- Lagangilang "Road and Trail" System - Neon PostgreSQL Database Schema
-- Capstone Research Alignment: ISO/IEC 25010 Software Quality & Usability
-- ============================================================================

-- Ensure the public schema exists and set search path explicitly
CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50) DEFAULT 'map-pin',
  badge_color VARCHAR(30) DEFAULT '#4361ee',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tourist Spots (POIs) Table
CREATE TABLE IF NOT EXISTS public.tourist_spots (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category_id VARCHAR(64) REFERENCES public.categories(id) ON DELETE SET NULL,
  barangay VARCHAR(100) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  description TEXT NOT NULL,
  image_url TEXT,
  is_pseudo_image BOOLEAN DEFAULT true,
  pseudo_theme VARCHAR(50) DEFAULT 'indigo',
  primary_pano_id VARCHAR(128),
  target_heading DOUBLE PRECISION DEFAULT 0,
  target_pitch DOUBLE PRECISION DEFAULT 0,
  sync_status VARCHAR(30) DEFAULT 'synced_cloud' CHECK (sync_status IN ('staged_local', 'verified', 'synced_cloud')),
  staged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tourist_spots_coords ON public.tourist_spots(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_tourist_spots_barangay ON public.tourist_spots(barangay);
CREATE INDEX IF NOT EXISTS idx_tourist_spots_sync ON public.tourist_spots(sync_status);

-- 3. 360° Panoramas (Road & Trail Nodes) Table
CREATE TABLE IF NOT EXISTS public.panoramas (
  id VARCHAR(128) PRIMARY KEY,
  source_type VARCHAR(20) DEFAULT 'local' CHECK (source_type IN ('local', 'mapillary')),
  filename VARCHAR(255),
  thumbnail_url VARCHAR(255),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  compass_heading DOUBLE PRECISION DEFAULT 0,
  sequence_id VARCHAR(128),
  label VARCHAR(255),
  description TEXT,
  sync_status VARCHAR(30) DEFAULT 'synced_cloud' CHECK (sync_status IN ('staged_local', 'synced_cloud')),
  captured_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_panoramas_coords ON public.panoramas(latitude, longitude);

-- 4. Panorama Neighbors (Sequential Road & Trail Links)
CREATE TABLE IF NOT EXISTS public.panorama_neighbors (
  id VARCHAR(128) PRIMARY KEY,
  from_pano_id VARCHAR(128) REFERENCES public.panoramas(id) ON DELETE CASCADE,
  to_pano_id VARCHAR(128) REFERENCES public.panoramas(id) ON DELETE CASCADE,
  distance_meters DOUBLE PRECISION NOT NULL,
  bearing DOUBLE PRECISION NOT NULL,
  transition_type VARCHAR(50) DEFAULT 'linear_forward',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Trail Corridors & Coverage Gap Analysis (Objective 1)
CREATE TABLE IF NOT EXISTS public.trail_corridors (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  barangay VARCHAR(100) NOT NULL,
  road_type VARCHAR(50) DEFAULT 'trail',
  survey_status VARCHAR(50) DEFAULT 'fully_mapped' CHECK (survey_status IN ('fully_mapped', 'partially_mapped', 'unmapped_gap')),
  geometry_geojson JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
