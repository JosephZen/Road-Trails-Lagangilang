-- ============================================================================
-- Seed Data for Lagangilang Tourist Spots Database (Neon PostgreSQL)
-- 12 Official Municipal Landmarks & Heritage Sites
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- Categories
INSERT INTO public.categories (id, name, icon) VALUES
('cat_nature', 'Nature & Eco-Tourism', '🏞️'),
('cat_heritage', 'Historical & Cultural Heritage', '🏛️'),
('cat_adventure', 'Adventure & Trekking Trail', '🌉'),
('cat_agri', 'Agri-Tourism & Cultural Handicrafts', '🌾'),
('cat_religious', 'Religious & Spiritual Site', '⛪'),
('cat_civic', 'Civic & Public Park', '🌳'),
('cat_viewpoint', 'Scenic Viewpoint & Overlook', '🌄')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon;

-- Clean up any obsolete prototype entries
DELETE FROM public.tourist_spots WHERE id IN (
  'poi_asist_main', 'poi_lagangilang_town_hall', 'poi_abra_river_viewpoint',
  'poi_mount_mag_atong', 'poi_bawa_hanging_bridge', 'poi_tagodtod_bamboo_craft',
  'poi_don_mariano_bridge_view', 'poi_sinapangan_weaving', 'poi_paganao_bamboo',
  'poi_la_paz_lookout', 'poi_abra_river_poblacion'
);

-- 12 Official Municipal Landmarks
INSERT INTO public.tourist_spots (
  id, name, category_id, barangay, latitude, longitude, address,
  description, image_url, is_pseudo_image, pseudo_theme,
  primary_pano_id, target_heading, target_pitch, sync_status,
  staged_at, synced_at, updated_at
) VALUES
(
  'poi_ugiao_river', 'Ugiao River', 'cat_nature', 'Pawa', 17.587492, 120.73661, 'Barangay Pawa, Lagangilang, Abra',
  'Scenic river landscape in Barangay Pawa with freshwater flows and recreational spots.', NULL, true, 'teal',
  '1608965217005049', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_quirsodan_dam', 'Quirsodan River Dam', 'cat_nature', 'San Isidro', 17.59235, 120.785336, 'Barangay San Isidro, Lagangilang, Abra',
  'Major irrigation and scenic dam structure spanning the Quirsodan River.', NULL, true, 'cyan',
  '1532761357806896', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_holy_cross_parish', 'Holy Cross Parish', 'cat_religious', 'Poblacion', 17.60858, 120.735127, 'Church Road, Poblacion, Lagangilang, Abra',
  'Historic religious parish church in Poblacion, serving as the spiritual heart of the community.', NULL, true, 'amber',
  '1724722945416495', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_galangugong_rocks', 'Galangugong Rock Formation', 'cat_nature', 'Bacooc', 17.666497, 120.799143, 'Barangay Bacooc, Lagangilang, Abra',
  'Distinctive limestone rock formations and geological landmark with scenic mountain views.', NULL, true, 'rose',
  '1778693856687129', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_banat_caves', 'BANAT Caves 1 & 2', 'cat_adventure', 'Bacooc', 17.657574, 120.788181, 'Barangay Bacooc, Lagangilang, Abra',
  'Twin natural cavern network popular with adventure trekkers and speleology enthusiasts.', NULL, true, 'purple',
  '1556968976199743', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_ua_main_campus', 'University of Abra Main Campus', 'cat_heritage', 'Poblacion', 17.60825, 120.738083, 'Poblacion, Lagangilang, Abra',
  'The premier higher education institution in Abra, featuring historic academic quadrangles and lush provincial green spaces.', NULL, true, 'indigo',
  '1724722945416495', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_ua_fish_pond', 'University of Abra - Fish Pond', 'cat_agri', 'Poblacion', 17.6068, 120.7392, 'UA Agricultural Research Station, Poblacion, Lagangilang',
  'Aquaculture research and educational fisheries training facility managed by the university.', NULL, true, 'blue',
  '1735531687819496', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_ua_tamarind_farm', 'University of Abra - Tamarind Farm', 'cat_agri', 'Poblacion', 17.6095, 120.741, 'UA Agro-Forestry Grounds, Poblacion, Lagangilang',
  'Commercial tamarind cultivation and agricultural demonstration orchard.', NULL, true, 'emerald',
  '2194203998167208', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_ua_cacao_garden', 'University of Abra - Cacao Clonal Garden', 'cat_agri', 'Poblacion', 17.6075, 120.7418, 'UA Clonal Extension, Poblacion, Lagangilang',
  'Regional clonal cacao nursery and quality bean research demonstration center.', NULL, true, 'amber',
  '1735531687819496', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_dj_farm', 'DJ Farm', 'cat_agri', 'Nagtupacan', 17.5901, 120.7402, 'Barangay Nagtupacan, Lagangilang, Abra',
  'Agri-tourism farm offering orchard tours and rural provincial countryside recreation.', NULL, true, 'orange',
  '1858716472228937', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
),
(
  'poi_rizalista_cave', 'Rizalista Cave', 'cat_heritage', 'Laguiben', 17.6125, 120.7462, 'Barangay Laguiben, Lagangilang, Abra',
  'Cultural and historical heritage cave site revered by local spiritual and folkloric traditions.', NULL, true, 'indigo',
  '1761125488711823', 0, 0, 'synced_cloud',
  NOW(), NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category_id = EXCLUDED.category_id,
  barangay = EXCLUDED.barangay,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  address = EXCLUDED.address,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  is_pseudo_image = EXCLUDED.is_pseudo_image,
  pseudo_theme = EXCLUDED.pseudo_theme,
  primary_pano_id = EXCLUDED.primary_pano_id,
  target_heading = EXCLUDED.target_heading,
  target_pitch = EXCLUDED.target_pitch,
  sync_status = 'synced_cloud',
  synced_at = NOW(),
  updated_at = NOW();
