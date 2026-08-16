-- EasyRent perf dataset seed.
-- Run with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/perf/seed.sql
--
-- Creates:
--   users:          10,000 (+ 1 known sign-in user perf@easyrent.test / password123)
--   listings:       50,000 distributed across the Lagos metro bbox
--   listing_media:  3 per listing (150,000)
--   favorites:      ~100,000 random user->listing pairs

BEGIN;

-- Known sign-in user for the load harness. email_verified so signIn succeeds.
INSERT INTO users (email, phone, password_hash, full_name, "emailVerified")
VALUES (
  'perf@easyrent.test',
  '+2348000000001',
  '$argon2id$v=19$m=65536,t=3,p=4$HxgddwnvR6qvccCpLoaVwQ$Xl2bvXn5fhpfij+KQzpzIWQoUzqI0XHBre3LE+WxlMc',
  'Perf User',
  true
)
ON CONFLICT (email) DO NOTHING;

-- Bulk users.
INSERT INTO users (email, phone, password_hash, full_name, "emailVerified")
SELECT
  'user' || g || '@perf.test',
  '+234800' || lpad((g + 1)::text, 7, '0'),
  '$argon2id$v=19$m=65536,t=3,p=4$HxgddwnvR6qvccCpLoaVwQ$Xl2bvXn5fhpfij+KQzpzIWQoUzqI0XHBre3LE+WxlMc',
  'Tenant ' || g,
  (g % 5 <> 0)  -- ~80% verified
FROM generate_series(1, 10000) g;

-- Listings across Lagos bbox (lon 3.2..3.5, lat 6.35..6.65).
INSERT INTO listings (landlord_id, title, description, price, rooms, furnished, status, location, address)
SELECT
  landlord.id,
  (ARRAY['Luxury','Cozy','Modern','Spacious','Executive','Compact','Charming','Sunny'])[floor(random()*8)::int + 1]
    || ' ' ||
  (ARRAY['Apartment','Flat','Townhouse','Studio','Duplex','Bungalow','Penthouse','Bedsitter'])[floor(random()*8)::int + 1]
    || ' at ' ||
  (ARRAY['Lekki Phase 1','Yaba','Surulere','Victoria Island','Ikoyi','Ikeja GRA','Ajah','Magodo','Gbagada','Oniru'])[floor(random()*10)::int + 1],
  'Spacious ' ||
    (ARRAY['2-bedroom','3-bedroom','4-bedroom','self-contained','executive','family'])[floor(random()*6)::int + 1] ||
    ' ' ||
    (ARRAY['apartment with ample parking','flat with 24h security','duplex with a garden','townhouse near the mall','studio with fast internet','bedsitter close to bus stop'])[floor(random()*6)::int + 1],
  (100000 + floor(random()*5000000))::numeric(10,2),
  floor(random()*6)::int,
  random() < 0.5,
  (ARRAY['avaiable','rented','inative'])[floor(random()*3)::int + 1]::status,
  ST_SetSRID(ST_MakePoint(
    3.2 + random() * 0.3,
    6.35 + random() * 0.3
  ), 4326),
  (ARRAY['Lekki','Yaba','Surulere','Victoria Island','Ikoyi','Ikeja','Ajah','Magodo','Gbagada','Oniru'])[floor(random()*10)::int + 1]
    || ', Lagos, Nigeria'
FROM generate_series(1, 50000) g
JOIN (
  SELECT row_number() OVER (ORDER BY id) AS idx, id FROM users WHERE email <> 'perf@easyrent.test'
) landlord ON landlord.idx = (g % 10000) + 1;

-- 3 media rows per listing (order 1..3; order 1 is the cover).
INSERT INTO listing_media (listing_id, url, type, "order")
SELECT
  l.id,
  'https://res.cloudinary.com/dev/image/upload/perf/listing-' || l.id || '-photo-' || g,
  'image',
  g
FROM listings l, generate_series(1, 3) g;

-- ~100k random favorites. ON CONFLICT dedupes accidental same-pair picks.
CREATE TEMP TABLE uid_map ON COMMIT DROP AS
  SELECT row_number() OVER (ORDER BY id) AS idx, id FROM users;
CREATE TEMP TABLE lid_map ON COMMIT DROP AS
  SELECT row_number() OVER (ORDER BY id) AS idx, id FROM listings;

INSERT INTO favorites (user_id, listing_id)
SELECT u.id, l.id
FROM (
  SELECT floor(random()*10000)::int + 1 AS uidx, floor(random()*50000)::int + 1 AS lidx
  FROM generate_series(1, 120000)
) g
JOIN uid_map u ON u.idx = g.uidx
JOIN lid_map l ON l.idx = g.lidx
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'users' AS tbl, count(*) FROM users
UNION ALL SELECT 'listings', count(*) FROM listings
UNION ALL SELECT 'listing_media', count(*) FROM listing_media
UNION ALL SELECT 'favorites', count(*) FROM favorites;