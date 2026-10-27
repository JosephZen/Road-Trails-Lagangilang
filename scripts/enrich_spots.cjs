const fs = require('fs');

const filePath = 'src/data/tourist_spots.json';
const spots = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const metadata = {
  poi_ugiao_river: {
    trail_difficulty: 'Moderate',
    trail_condition: 'Passable - Clear Riverbanks',
    operating_hours: '6:00 AM - 5:30 PM daily',
    estimated_travel_time: { foot: '25-35 mins', vehicle: '8-12 mins' },
    safety_guidelines: 'Watch out for slippery river stones. Avoid swimming during sudden mountain rainfalls.'
  },
  poi_quirsodan_dam: {
    trail_difficulty: 'Moderate',
    trail_condition: 'Open - Concrete & Gravel Road',
    operating_hours: '6:00 AM - 6:00 PM daily',
    estimated_travel_time: { foot: '35-45 mins', vehicle: '10-15 mins' },
    safety_guidelines: 'Stay clear of spillway edge during high water releases.'
  },
  poi_holy_cross_parish: {
    trail_difficulty: 'Easy',
    trail_condition: 'Paved Road - Fully Accessible',
    operating_hours: '5:30 AM - 7:00 PM daily',
    estimated_travel_time: { foot: '5-10 mins', vehicle: '2 mins' },
    safety_guidelines: 'Observe sacred church silence and proper attire.'
  },
  poi_galangugong_rocks: {
    trail_difficulty: 'Challenging',
    trail_condition: 'Caution - Rocky Mountain Trail',
    operating_hours: '6:00 AM - 5:00 PM (Daylight only)',
    estimated_travel_time: { foot: '30-45 mins', vehicle: '10 mins' },
    safety_guidelines: 'Wear rugged trekking shoes with good grip. Do not climb wet cliff edges.'
  },
  poi_banat_caves: {
    trail_difficulty: 'Challenging',
    trail_condition: 'Caution - Cave Interior Wet & Slippery',
    operating_hours: '7:00 AM - 4:30 PM (Local Guide Recommended)',
    estimated_travel_time: { foot: '40-50 mins', vehicle: '12 mins' },
    safety_guidelines: 'Bring headlamps or flashlights. Register with Barangay Bacooc desk before entry.'
  },
  poi_ua_main_campus: {
    trail_difficulty: 'Easy',
    trail_condition: 'Paved Campus Boulevard - Fully Accessible',
    operating_hours: '7:00 AM - 7:00 PM daily',
    estimated_travel_time: { foot: '0-5 mins', vehicle: '1 min' },
    safety_guidelines: 'Follow university vehicle speed limit (15 km/h).'
  },
  poi_ua_fish_pond: {
    trail_difficulty: 'Easy',
    trail_condition: 'Open - Scenic Earthen Dike Path',
    operating_hours: '6:30 AM - 5:30 PM',
    estimated_travel_time: { foot: '5-10 mins', vehicle: '2 mins' },
    safety_guidelines: 'Keep away from muddy pond edges.'
  },
  poi_ua_tamarind_farm: {
    trail_difficulty: 'Easy',
    trail_condition: 'Open - Farm Trail Passable',
    operating_hours: '7:00 AM - 5:00 PM',
    estimated_travel_time: { foot: '10-15 mins', vehicle: '3 mins' },
    safety_guidelines: 'Do not harvest tamarind pods without staff permission.'
  },
  poi_ua_cacao_garden: {
    trail_difficulty: 'Easy',
    trail_condition: 'Open - Shaded Agro-Forestry Walkway',
    operating_hours: '7:00 AM - 5:00 PM',
    estimated_travel_time: { foot: '8-12 mins', vehicle: '3 mins' },
    safety_guidelines: 'Stay on designated farm walkways.'
  },
  poi_dj_farm: {
    trail_difficulty: 'Easy',
    trail_condition: 'Open - Countryside Barangay Road',
    operating_hours: '8:00 AM - 5:00 PM',
    estimated_travel_time: { foot: '20-25 mins', vehicle: '6-8 mins' },
    safety_guidelines: 'Family-friendly destination with fruit-bearing trees.'
  },
  poi_rizalista_cave: {
    trail_difficulty: 'Moderate',
    trail_condition: 'Caution - Mountain Foothill Trail',
    operating_hours: '7:00 AM - 5:00 PM',
    estimated_travel_time: { foot: '25-35 mins', vehicle: '8-10 mins' },
    safety_guidelines: 'Respect sacred religious artifacts and historical cave inscriptions.'
  },
  poi_lagangilang_municipal_hall: {
    trail_difficulty: 'Easy',
    trail_condition: 'Paved Town Center - Fully Accessible',
    operating_hours: '8:00 AM - 5:00 PM Mon-Fri (Emergency 24/7)',
    estimated_travel_time: { foot: '5-8 mins', vehicle: '2 mins' },
    safety_guidelines: 'Municipal help desk, tourism brochures, and emergency response office on site.'
  }
};

for (const spot of spots) {
  const meta = metadata[spot.id] || {
    trail_difficulty: 'Easy',
    trail_condition: 'Passable',
    operating_hours: '6:00 AM - 6:00 PM',
    estimated_travel_time: { foot: '15 mins', vehicle: '5 mins' },
    safety_guidelines: 'Follow standard trail safety rules.'
  };
  Object.assign(spot, meta);
}

fs.writeFileSync(filePath, JSON.stringify(spots, null, 2));
console.log('Successfully enriched all 12 tourist spots with municipal parameters!');
