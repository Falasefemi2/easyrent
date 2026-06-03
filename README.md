# EasyRent

A scalable house rental platform with map-based property discovery, built for the Nigerian market. Landlords post properties, tenants find them via geospatial search and map view.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Caching Strategy](#caching-strategy)
- [Media Upload Flow](#media-upload-flow)
- [Event Architecture](#event-architecture)
- [Geospatial Search](#geospatial-search)
- [Scaling Path](#scaling-path)

---

## Overview

EasyRent is a long-term house rental marketplace. A single user account can act as both landlord and tenant.

**Landlords can:**
- Create, edit, and delete property listings
- Upload images and videos via presigned URLs (direct-to-storage)
- Mark properties as rented or inactive

**Tenants can:**
- Search properties by location, price, rooms, and furnished status
- View listings on an interactive map
- Get directions from their current location to a property
- Save and favorite listings
- Contact landlords via in-app chat (Firebase)

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Runtime | Bun + Effect-TS | Performance, typed errors, composable services |
| Database | PostgreSQL + PostGIS | Geospatial queries via GiST index |
| Cache | Redis | Search result and listing cache |
| Queue | BullMQ (→ Redpanda at scale) | Async jobs, migrate at 100k DAU |
| Media Storage | Cloudflare R2 | No egress fees, Cloudflare PoP in Lagos |
| Chat | Firebase Realtime Database | Outsourced real-time complexity |
| Maps | Mapbox | Cheaper than Google Maps, good African coverage |
| Auth | JWT + refresh tokens | Stateless, scalable |
| API Gateway | Nginx / Cloudflare | Rate limiting, SSL termination |

---

## Architecture

```
┌─────────────────────────────────┐
│         Mobile / Web Client     │
└────────────────┬────────────────┘
                 │
┌────────────────▼────────────────┐
│           API Gateway           │  rate limiting · auth · routing
└──────┬──────────────┬───────────┘
       │              │
┌──────▼──────┐ ┌─────▼────────────────────┐
│ Auth Module │ │     Core API (Monolith)   │
└─────────────┘ │  listings · search ·      │
                │  media · favorites        │
                └──────┬───────────────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│ PostgreSQL  │ │    Redis     │ │   BullMQ    │
│ + PostGIS   │ │    Cache     │ │   Queue     │
└─────────────┘ └─────────────┘ └──────┬──────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
             ┌──────▼──────┐  ┌─────────▼──────┐  ┌───────▼──────┐
             │Media Worker │  │Notification Svc│  │Moderation Svc│
             └──────┬──────┘  └────────────────┘  └──────────────┘
                    │
             ┌──────▼──────┐
             │Cloudflare R2│  object storage
             └─────────────┘
```

**Design decision:** Start as a modular monolith. Each module (auth, listings, search, media) has clean boundaries and no circular dependencies. Extract to microservices only when you hit scale pain on a specific module — search is typically first.

---

## Database Schema

```sql
-- Users
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  phone       TEXT UNIQUE,
  password    TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Listings
CREATE TABLE listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(12,2) NOT NULL,
  rooms         INT NOT NULL,
  furnished     BOOLEAN DEFAULT false,
  status        TEXT DEFAULT 'available',   -- available | rented | inactive
  address       TEXT NOT NULL,
  location      GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS geometry column
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Indexes — do not skip these
CREATE INDEX listings_location_idx ON listings USING GIST(location);
CREATE INDEX listings_status_idx   ON listings(status);
CREATE INDEX listings_price_idx    ON listings(price);

-- Media
CREATE TABLE listing_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID REFERENCES listings(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  type        TEXT NOT NULL,   -- image | video
  "order"     INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Favorites
CREATE TABLE favorites (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  listing_id  UUID REFERENCES listings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
```

---

## API Reference

### Auth

```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
```

### Listings

```
POST   /listings                     create listing
PATCH  /listings/:id                 edit listing
DELETE /listings/:id                 delete listing
GET    /listings/:id                 view single listing
GET    /listings/me                  landlord's own listings
```

### Search

```
GET /search?lat=6.5244&lng=3.3792&radius=5&min_price=50000&max_price=200000&rooms=2&furnished=true&page=1&limit=20
```

| Parameter | Type | Description |
|---|---|---|
| `lat` | float | Tenant's current latitude |
| `lng` | float | Tenant's current longitude |
| `radius` | int | Search radius in kilometers |
| `min_price` | int | Minimum rent in Naira |
| `max_price` | int | Maximum rent in Naira |
| `rooms` | int | Minimum number of rooms |
| `furnished` | boolean | Filter by furnished status |
| `page` | int | Pagination page number |
| `limit` | int | Results per page (max 20) |

### Media

```
POST   /listings/:id/media               generate presigned upload URL
DELETE /listings/:id/media/:mediaId      delete media
```

### Favorites

```
POST   /listings/:id/favorite            save listing
DELETE /listings/:id/favorite            unsave listing
GET    /favorites                        tenant's saved listings
```

### Directions

```
GET /listings/:id/directions?from_lat=6.5244&from_lng=3.3792
```

### Contact

```
POST /listings/:id/contact              initiate Firebase chat thread
```

---

## Caching Strategy

All cache keys use Redis. Search cache keys round `lat/lng` to 3 decimal places (~111m precision) to maximize hit rate — two users 50m apart share the same cached result.

```
# Search results
search:{lat}:{lng}:{radius}:{min_price}:{max_price}:{rooms}:{furnished}:{page}
TTL: 60s

# Single listing
listing:{id}
TTL: 5m  — invalidated on PATCH or DELETE

# Landlord's listings
landlord_listings:{landlord_id}
TTL: 2m

# Favorites count
favorites_count:{listing_id}
TTL: 5m

# Directions
directions:{listing_id}:{from_lat}:{from_lng}
TTL: 1h  — roads don't change often
```

---

## Media Upload Flow

Media never passes through the API server. Direct-to-storage upload via presigned URLs keeps the API server stateless and eliminates bandwidth bottlenecks.

```
1.  Client        →  POST /listings/:id/media
2.  API Server    →  generates presigned URL from Cloudflare R2
3.  API Server    →  returns presigned URL to client
4.  Client        →  uploads file directly to R2 (bypasses API server)
5.  R2            →  fires webhook on upload complete
6.  BullMQ        →  queues media processing job
7.  Worker        →  validates file type and size
8.  Worker        →  generates image thumbnails
9.  Worker        →  writes final CDN URL to listing_media table
10. Worker        →  invalidates listing:{id} cache
```

---

## Event Architecture

Async jobs are decoupled from the request lifecycle via BullMQ queues. Migrate to Redpanda at 100k+ DAU.

| Event | Consumers |
|---|---|
| `listing.created` | moderation check, search index update |
| `listing.updated` | cache invalidation, search index update |
| `listing.deleted` | cache invalidation, media cleanup |
| `media.uploaded` | thumbnail generation, virus scan |
| `user.registered` | welcome notification |
| `listing.contacted` | landlord push notification, Firebase thread init |
| `listing.favorited` | analytics |

---

## Geospatial Search

The core search query uses PostGIS `ST_DWithin` which leverages the GiST spatial index — no full table scan.

```sql
SELECT
  l.*,
  ST_Distance(
    l.location,
    ST_MakePoint($lng, $lat)::GEOGRAPHY
  ) AS distance_meters
FROM listings l
WHERE
  l.status = 'available'
  AND ST_DWithin(
    l.location,
    ST_MakePoint($lng, $lat)::GEOGRAPHY,
    $radius_meters       -- radius converted to meters before query
  )
  AND l.price BETWEEN $min_price AND $max_price
  AND l.rooms >= $rooms
  AND ($furnished::boolean IS NULL OR l.furnished = $furnished)
ORDER BY distance_meters ASC
LIMIT $limit OFFSET $offset;
```

Without the GiST index this query does a full table scan computing distance for every row. With it, PostgreSQL eliminates irrelevant spatial regions instantly via the R-tree structure PostGIS builds internally.

---

## Scaling Path

| Stage | DAU | Changes |
|---|---|---|
| Launch | 10k | Modular monolith, single PostgreSQL, Redis, BullMQ, R2 |
| Growth | 100k | Extract search service, add PG read replica, migrate to Redpanda |
| Scale | 500k | Extract media service, PgBouncer for connection pooling, Redis cluster, add Elasticsearch for full-text search |
| Hyperscale | 1M+ | Horizontal scaling per service, sharded PostgreSQL, global CDN |

---

## Fraud & Moderation

Listings are auto-approved but run through async moderation post-publish. Suspicious listings are shadow-banned — visible to the landlord, hidden from search results.

**Signals flagged automatically:**
- Same phone or email across multiple landlord accounts
- Listings with duplicate descriptions
- Price outliers (statistically anomalous for the area)
- New account posting more than 5 listings within an hour
- Images found on other platforms via reverse image search

Phone number verification is required before a user can publish their first listing.

---

## Project Structure

```
easyrent/
  src/
    modules/
      auth/
      listings/
      search/
      media/
      favorites/
    shared/
      database/
      cache/
      events/
      storage/
  migrations/
  workers/
  tests/
```
