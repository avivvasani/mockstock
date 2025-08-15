# MockStock (Firebase + Firestore, Free Tier)

Single-page mock stock market:
- Users can sign up / log in (Email+Password or Google).
- Everyone sees the **same** prices from one Firestore doc: `market/state`.
- **Admin-only** button “Tick Market Now” updates prices for all users (no Cloud Functions required).

## 1) Firebase setup
- Create a Firebase project (you already have: `mockstock-5c5e3`).
- Enable **Authentication** → Sign-in methods: Email/Password and Google.
- Enable **Firestore** (test or locked mode).
- Paste your `firebaseConfig` into `script.js` (already set to your config here).

## 2) Import market data
Use the HTML uploader you created earlier *or* manually create `market/state` with fields:
- `updatedAt`: number (milliseconds)
- `categories`: array of strings (include `"All"` as first)
- `stocks`: array of maps with keys: id, name, symbol, category, price, prevClose

> I also provided a 50-stock NIFTY JSON earlier. Load that into `market/state`.

## 3) Firestore Rules
Publish `firestore.rules` from Firebase Console → Firestore → Rules.

## 4) Make yourself admin
- Find your `uid` (after you log in once).
- Create/Update: `users/{uid}` with `{ "role": "admin" }`.

## 5) Run
- Open `index.html` (via VS Code Live Server or GitHub Pages).
- Log in → if you're admin you will see **“Tick Market Now”** button.
- Click it: prices update for everyone in real time.

## 6) Deploy to GitHub Pages
- Push repo to GitHub.
- Settings → Pages → Deploy from branch → `main` → `/root`.
- Wait for the page link; open it.

## Notes
- Client keys in `script.js` are safe to expose; security is enforced in Firestore rules.
- No Cloud Functions; stays on Firebase free tier.
