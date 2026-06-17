# EasyRent

EasyRent is a scalable house rental platform backend designed for the Nigerian market. It features geospatial property discovery, comprehensive listing management, and a robust authentication system.

## Overview

The platform serves both landlords and tenants through a unified backend architecture. Landlords can manage property listings and media, while tenants can discover properties using location-based search and maintain a list of favorites.

## Tech Stack

- Runtime: Bun
- Framework: Effect-TS
- Database: PostgreSQL with PostGIS for geospatial capabilities
- ORM: Drizzle ORM
- Caching: Redis (ioredis)
- Media Management: Cloudinary
- Authentication: JWT with Refresh Tokens
- Email: Resend
- Security: Argon2 for password hashing
- Validation: Effect Schema
- Logging: Axiom

## Core Features

- Authentication: Secure registration, login, and token refresh mechanisms.
- Listing Management: CRUD operations for property listings with support for status tracking (available, rented, inactive).
- Geospatial Search: Efficient property discovery using PostGIS coordinates and radius-based filtering.
- Media Support: Integrated image and video management via Cloudinary.
- Favorites: Capability for users to save and track preferred listings.
- Modular Architecture: Developed as a modular monolith using Effect-TS for clear service boundaries and dependency injection.

## Project Structure

- src/auth: Authentication logic, token services, and authorization middleware.
- src/db: Database schema definitions and Drizzle configuration.
- src/listings: Core property listing management and geospatial query logic.
- src/favorites: User favorite management.
- src/users: User profile and repository management.
- src/services: Shared infrastructure services including Redis, Cloudinary, and Email.
- src/middleware: Global HTTP middlewares such as logging and CORS.

## Getting Started

### Prerequisites

- Bun runtime
- PostgreSQL with PostGIS extension
- Redis instance

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Configure environment variables in a .env file (see example for required keys like DATABASE_URL, REDIS_URL, CLOUDINARY_*).

### Database Setup

Generate and run migrations:
```bash
bun run db:generate
bun run db:migrate
```

### Running the Application

Start the development server:
```bash
bun run index.ts
```

## API Documentation

The API documentation is available via OpenAPI/Scalar at the following endpoints when the server is running:

- Scalar Docs: /docs
- OpenAPI Spec: /openapi.json

## Testing

Run the test suite using Vitest:
```bash
bun test
```

## Performance and Scalability

- Geospatial Indexing: Uses GiST indexes on PostgreSQL for high-performance spatial queries.
- Caching Layer: Implements Redis caching for frequently accessed listing data and search results.
- Type Safety: Full end-to-end type safety provided by TypeScript and Effect-TS.
- Statelessness: JWT-based authentication ensures the API remains stateless and horizontally scalable.
