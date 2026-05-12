# GymStride

A location-aware iOS app for finding workout partners — at the gym or on a run. You browse nearby profiles, send a personal chat request, and once they accept, you're talking in real time.

Built end-to-end as a solo senior project: React Native frontend, Supabase backend, shipped via EAS to the App Store.

---

## Features

- Discover gym-goers and runners nearby, filtered by workout type
- Send a personal chat request with a note — no cold follows, no random DMs
- Real-time 1:1 messaging the moment a request is accepted
- Log workouts (gym, long run, short run, sprint) and earn streak badges
- Push notifications for new messages and incoming requests

---

## Stack

| Layer | Technology |
|---|---|
| Mobile | React Native 0.81 / Expo SDK 54 |
| Routing | Expo Router v6 (file-based, typed) |
| Backend | Supabase — PostgreSQL, Auth, Realtime, Storage |
| State | Zustand |
| Server state | TanStack Query v5 |
| Gestures | react-native-gesture-handler |
| Keyboard | react-native-keyboard-controller |
| Notifications | expo-notifications + APNs |
| Build & submit | EAS Build + EAS Submit |
| Language | TypeScript throughout |

---

## Architecture

### Row Level Security

Every table is locked down with PostgreSQL RLS. Users read only what they're authorized to: profiles within their region, conversations they participate in, messages inside those conversations. No server middleware enforcing access control — the database does it.

One hard-learned detail: cross-table RLS policies on `conversation_participants` trigger infinite recursion in Postgres's policy evaluator (error `42P17`). The solution is a `SECURITY DEFINER` function that steps outside RLS for internal lookups. I spent a full day on this before finding the pattern.

```sql
-- participants can read only their own rows
create policy "participants: read own"
  on conversation_participants for select
  using (profile_id = auth.uid());

-- accept / decline run as SECURITY DEFINER to bypass RLS
-- (direct writes to conversations are blocked for regular users)
create or replace function accept_chat_request(p_request_id uuid)
returns uuid language plpgsql security definer as $$
...
$$;
```

### Real-time Messaging

Supabase Realtime subscribes to `INSERT` events on `messages`, scoped by `conversation_id`. No polling, no custom WebSocket server. The subscription is set up on mount and torn down on unmount — one channel per open conversation.

### Chat Request Flow

```
Requester  →  INSERT chat_request  (status: pending)

Recipient  →  accept:  RPC creates conversation + participants rows
           →  decline: RPC deletes request row

Requester  →  cancel:  DELETE policy on own pending requests
```

Rate limiting is enforced at the database level: a count query on `chat_requests` filtered to `created_at >= now() - interval '24 hours'` before the modal opens. No rate-limit infrastructure needed.

### Push Notifications

Device push tokens are stored in a `push_tokens` table, registered on login and removed on logout. A Supabase Edge Function fires on new messages and chat requests, delivering to APNs.

---

## Running Locally

```bash
git clone https://github.com/selimfedakar/gymstride.git
cd gymstride
npm install
cp .env.example .env
# Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

Apply the migrations in `supabase/migrations/` in order using Supabase's SQL editor. The Edge Functions in `supabase/functions/` deploy via the Supabase CLI.

---

## What I Learned

Most of the difficult problems in this project weren't in the product logic — they were in the infrastructure. Debugging RLS policies when Postgres gives you a vague recursion error with no stack trace, wiring gesture handlers so they work across the entire React tree, designing auth flows that don't hang when a network call takes too long on a tunnel connection. As a senior student shipping a real app to a real store for the first time, the gap between "it works on localhost" and "it passes App Review" turned out to be a significant part of the project.

---

## License

MIT
