-- ============================================================================
-- Seed Data for Lagangilang Tourist Spots Database (Neon PostgreSQL)
-- ============================================================================

-- Ensure the public schema exists and set search path explicitly
CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- Insert Categories
INSERT INTO public.categories (id, name, icon, badge_color, description) VALUES
('cat_heritage', 'Education & Heritage', 'graduation-cap', '#4361ee', 'Academic institutions, historic archives, and cultural preservation centers.'),
('cat_religion', 'Religious & Cultural Heritage', 'church', '#f72585', 'Historic churches, shrines, and sacred community landmarks.'),
('cat_civic', 'Civic & Public Park', 'landmark', '#06d6a0', 'Municipal government compounds, town squares, and public gathering spaces.'),
('cat_nature', 'Nature & Eco-Tourism', 'waves', '#4cc9f0', 'Riverbanks, scenic lookouts, and environmental conservation spots.'),
('cat_adventure', 'Adventure & Trekking Trail', 'mountain', '#ff6d00', 'Hiking trails, mountain peaks, and rough terrain corridors.'),
('cat_handicraft', 'Agri-Tourism & Cultural Handicrafts', 'sparkles', '#7209b7', 'Bamboo processing centers, traditional weaving houses, and agro-farms.')
ON CONFLICT (id) DO NOTHING;

-- Insert Tourist Spots
INSERT INTO public.tourist_spots (
  id, name, category_id, barangay, latitude, longitude, address, 
  description, is_pseudo_image, pseudo_theme, primary_pano_id, 
  target_heading, target_pitch, sync_status
) VALUES
(
  'poi_asist_main',
  'ASIST Main Campus (University of Abra)',
  'cat_heritage',
  'Poblacion',
  17.608250,
  120.738083,
  'Poblacion, Lagangilang, Abra, Philippines',
  'The premier state higher education institution in Abra, featuring historic academic quadrangles, lush provincial green spaces, and cultural research archives showcasing Tingguian and Abra heritage. Click to immerse yourself in the campus grounds.',
  true,
  'indigo',
  'pano_1785458227165_1j20c9',
  45.0,
  -5.0,
  'synced_cloud'
),
(
  'poi_holy_cross_parish',
  'Holy Cross Parish Church',
  'cat_religion',
  'Poblacion',
  17.615800,
  120.735000,
  'Church Road, Poblacion, Lagangilang, Abra',
  'The spiritual heart of Lagangilang, this historic Roman Catholic parish features Spanish-colonial-inspired brick architecture and serves as the center of Holy Cross fiesta celebrations and community gatherings.',
  true,
  'amber',
  'pano_1785458811653_j5vnmy',
  90.0,
  0.0,
  'synced_cloud'
),
(
  'poi_lagangilang_town_hall',
  'Lagangilang Municipal Town Hall & Freedom Park',
  'cat_civic',
  'Poblacion',
  17.614200,
  120.734000,
  'Municipal Compound, Poblacion, Lagangilang, Abra',
  'The administrative seat of Lagangilang, surrounded by the town plaza and Freedom Park. It hosts municipal cultural festivities, open-air community sports, and showcases local Tingguian craftsmanship monuments.',
  true,
  'emerald',
  'pano_1785458901520_jb1b5w',
  180.0,
  0.0,
  'synced_cloud'
),
(
  'poi_abra_river_viewpoint',
  'Abra River Viewpoint & Bawa Riverbanks',
  'cat_nature',
  'Bawa',
  17.621000,
  120.728000,
  'Riverside Trail, Barangay Bawa, Lagangilang, Abra',
  'A breathtaking scenic vantage point overlooking the mighty Abra River and its pebble riverbanks. Popular among trail trekkers, local fishermen, and nature photographers capturing the river gorge during sunset.',
  true,
  'cyan',
  'pano_1785458903585_a9jv8p',
  270.0,
  -10.0,
  'synced_cloud'
),
(
  'poi_mount_mag_atong',
  'Mount Mag-atong Eco-Trail & Summit',
  'cat_adventure',
  'Nagtipulan',
  17.632000,
  120.751000,
  'Mag-atong Trailhead, Barangay Nagtipulan, Lagangilang, Abra',
  'Lagangilang''s iconic panoramic mountain trail, offering exhilarating hiking paths through indigenous pine and hardwood groves, culminating in a 360° summit vista of the Abra River Valley and Cordillera mountains.',
  true,
  'rose',
  'pano_1785458907688_3ycntg',
  315.0,
  15.0,
  'synced_cloud'
),
(
  'poi_bawa_hanging_bridge',
  'Bawa Hanging Footbridge & Rapids',
  'cat_adventure',
  'Bawa',
  17.625000,
  120.742000,
  'Bawa Crossing, Lagangilang, Abra',
  'A classic suspension footbridge spanning across the Bawa tributary waters, connecting rural agricultural farming communities with panoramic river gorge views and clear freshwater swimming spots.',
  true,
  'teal',
  'pano_1785458911472_jf2n58',
  120.0,
  -8.0,
  'synced_cloud'
),
(
  'poi_tagodtod_bamboo_craft',
  'Tagodtod Bamboo Craft & Cultural Center',
  'cat_handicraft',
  'Tagodtod',
  17.611500,
  120.731000,
  'Barangay Tagodtod, Lagangilang, Abra',
  'Center for Lagangilang''s renowned engineered bamboo and traditional Tingguian basketry. Visitors can experience native loom-weaving demonstrations and purchase handcrafted bamboo eco-souvenirs.',
  true,
  'violet',
  'pano_1785458933279_gohnbu',
  60.0,
  0.0,
  'synced_cloud'
),
(
  'poi_don_mariano_bridge_view',
  'Don Mariano Marcos Bridge Scenic Overlook',
  'cat_nature',
  'Laguiben',
  17.601500,
  120.725000,
  'Abra-Kalinga National Road, Lagangilang, Abra',
  'The historic steel bridge entryway to eastern Abra, offering panoramic views of the Abra River canyon, river transport bancas, and the surrounding Cordillera mountain ridges.',
  true,
  'orange',
  'pano_1785458951667_shihgp',
  210.0,
  -5.0,
  'synced_cloud'
)
ON CONFLICT (id) DO NOTHING;
