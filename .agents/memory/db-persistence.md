---
name: PetroTrack DB Persistence
description: How app state is persisted to PostgreSQL via the API server
---

# Database Persistence Architecture

**Why:** AsyncStorage is device-local; PostgreSQL via API gives server-side persistence across devices.

**How to apply:** Every state slice in AppContext is synced to both AsyncStorage (fast, offline) and the API (authoritative).

## DB Schema
- `lib/db/src/schema/appState.ts` — single table `app_state` with `key TEXT PRIMARY KEY, data JSONB`
- Keys exactly match the AsyncStorage keys used in AppContext

## API Routes
- `artifacts/api-server/src/routes/state.ts`
- `GET /api/state` — returns all keys as object
- `GET /api/state/:key` — returns single slice
- `PUT /api/state/:key` — upserts a slice (body = raw JSON value)
- ALLOWED_KEYS set in state.ts controls which keys are accepted

## Expo API Client
- `artifacts/petrotrack/lib/api.ts` — `stateApi.getAll()`, `stateApi.get(key)`, `stateApi.put(key, data)`
- URL: `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`

## AppContext Load Order
1. AsyncStorage.multiGet (fast, shows data immediately)
2. stateApi.getAll() (after `loaded=true`, overrides with server data)
3. On any state change: syncSlice(key, value) writes to both AsyncStorage + API

## Adding a new state slice
1. Add key to ALLOWED_KEYS in state.ts
2. Add to KEYS array in AppContext mount effect
3. Add setXxx in API fetch effect
4. Add syncSlice useEffect at bottom of persistence section
