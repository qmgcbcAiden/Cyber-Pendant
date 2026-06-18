# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cyber-Pendant is a digital garment hang tag system. Users scan QR codes or enter SN codes to view garment details; admins manage records and generate codes. It's a monorepo with:

- **`client/`**: Uni-app Vue 3 H5 frontend (WeChat Mini Program ready)
- **`server/`**: Node.js API using built-in `node:sqlite`
- **`server/admin/`**: standalone Vue 3 + Vite admin console served by the backend after build
- **`data/`**: Local SQLite database (runtime-generated, gitignored)

## Requirements

- Node.js >= 24.0.0

## Commands

```bash
# Install all dependencies
npm --prefix server install && npm --prefix client install && npm --prefix server/admin install

# Development (run in separate terminals)
npm run dev          # backend with auto-prepared admin console
npm run dev:server   # same backend dev server
npm run dev:client   # uni -p h5 (H5) or uni -p mp-weixin (Mini Program)
npm run dev:admin    # optional admin hot reload server

# Build
npm start            # production backend with auto-prepared admin console
npm run build:client # uni build -p h5
npm run build:admin  # Vite build to server/admin/dist for backend hosting

# Test
npm test             # node --test server/test/*.test.js
```

## Architecture

### Server (Node.js ESM, built-in http + sqlite)

Entry point: `server/src/index.js` → `api.js` (HTTP routing & handlers)

Core modules:
- `db.js`: SQLite schema, migrations, garment CRUD queries. Three-layer data model (clothes → garment_batches → garments). Uses `FIELD_MAP`, `CLOTHING_FIELD_MAP`, `BATCH_FIELD_MAP` to convert camelCase ↔ snake_case between API and database.
- `auth.js`: PBKDF2 password hashing, custom JWT-like token (HMAC-SHA256, 7-day TTL)
- `sn.js`: SN code generation (`CP{YYYYMMDD}{6-char-alphanum}`), excludes confusing chars (0, O, I, 1)
- `config.js`: Loads `server/.env`, manages runtime config
- `prepare-admin.js`: Auto-installs and builds admin console when `server/admin/dist` is missing or stale

API design (no framework):
- Manual routing via `pathname` patterns in `route()` function
- `HttpError` class for error responses
- CORS configurable via `CORS_ORIGIN` env var
- Admin SPA static hosting is configurable with `ADMIN_BASE_PATH` (default `/admin`) and `ADMIN_STATIC_DIR` (default `server/admin/dist`)
- `server/src/index.js` runs `ensureAdminBuild()` before listening, so server startup automatically installs/builds the admin console when needed

### Client (Uni-app Vue 3)

- `src/pages.json`: Route registry (Uni-app convention)
- `src/utils/api.js`: Public garment lookup/binding API wrapper only
- `src/utils/scanner.js`: QR scanning; handles WeChat Mini Program vs H5 divergence via conditional compilation (`#ifdef MP-WEIXIN`)

## Known Issues & Workarounds

### WeChat Mini Program: Button Click Events Not Working

**Issue**: When using Vue 3 `<script setup>` syntax in uni-app, button click events may not respond when using the standard `@click="functionName"` syntax.

**Symptoms**:
- Console logs show page loads successfully
- Button clicks produce no response, no console output
- Network requests are not initiated

**Workaround**: Use inline arrow functions instead of direct function references:

```vue
<!-- ❌ Does NOT work in WeChat Mini Program -->
<button @click="lookup">查询吊牌</button>
<button @click="handleScan">扫描二维码</button>

<!-- ✅ Works correctly -->
<button @click="() => lookup()">查询吊牌</button>
<button @click="() => handleScan()">扫描二维码</button>
```

**Note**: According to uni-app official documentation, `@click="functionName"` should work in `<script setup>`. This appears to be a bug in the uni-app compiler or WeChat DevTools. Report this to uni-app if issues persist.

**Affected Files** (using workaround):
- `client/src/pages/index/index.vue`
- `client/src/pages/garment/detail.vue`

### Admin Console (Vue 3 + Vite)

- `server/admin/src/router.js`: hash router (`#/login`, `#/dashboard`, `#/clothes/:id`)
- `server/admin/src/utils/api.js`: admin API wrapper, token storage in `localStorage`
- Built assets are served by the backend at `ADMIN_BASE_PATH`

## Environment Setup

Before first run:
```bash
cp server/.env.example server/.env
# Edit server/.env: set ADMIN_PASSWORD and TOKEN_SECRET
```

Default admin username: `admin` (configurable via `ADMIN_USERNAME`)

Demo SN: `CP20260615DEMO01`

## Database Schema

The system uses a three-layer data model (garment master data → production batches → individual SNs):

- **`admins`**: id, username, password_hash, created_at
- **`clothes`** (garment master data): id, product_name, fabric, standard, safety_category, grade, manufacturer, manufacturer_address, care_instructions, remark, status (active/inactive), created_at, updated_at
- **`garment_batches`** (production batches): id, clothing_id (FK → clothes), style_no, color, size, batch_no, production_date, remark, status, created_at, updated_at
- **`garments`** (individual SN records): id, clothing_id (FK → clothes), batch_id (FK → garment_batches), sn (unique), query_count, binding fields (student_name, student_school, etc.), status, created_at, updated_at
  - Also stores denormalized/legacy columns for backward compatibility
- **`garment_styles`** (legacy table): Used for migrating old single-table data to the three-layer model

Seeds: one admin (if none exists), one demo garment with associated clothing/batch records (if tables empty)

The `backfillThreeLayerData()` function in `db.js` automatically migrates legacy records to the three-layer structure on startup.

## Testing

Tests use Node.js built-in test runner (`node:test`). Each test creates an in-memory temp database. Pattern: `startTestServer()` → run fetch requests → assert response status/body.

Run individual test:
```bash
node --test server/test/api.test.js
```
