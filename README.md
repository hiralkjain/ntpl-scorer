# NTPL BLR Cricket Tournament — Step 1E

React + TypeScript + Vite + Tailwind CSS + Supabase.

## Run

```bash
npm install
```

Copy `.env.example` to `.env.local` and add your Supabase URL and anon/publishable key.

```bash
npm run dev
```

This stage includes:
- Supabase connection
- Tournament/team/fixture loading
- Realtime match subscription
- Public pages for Home, Live, Fixtures, Points and Teams
- Staff login screen

Next: real ball-by-ball scorer and scoring engine.

Never put a Supabase service-role key in this frontend.
