
# Ashoka Mock-Stock — Firebase + GitHub Pages

A lightweight mock stock market with **global, identical prices** for all users, **persistent accounts**, and **portable portfolios**.  
Front-end is static (GitHub Pages). User data + prices live in Firebase (Auth + Firestore).  
A Cloud Function updates a single **market state** so everyone sees the same prices.

---

## Features
- 🔐 Email/password sign-up + login from anywhere (optional guest mode).
- 💾 Per-user portfolio/watchlist saved in Firestore (not localStorage).
- 🌐 One shared market state in Firestore, updated by a scheduled Cloud Function.
- 🌓 Dark mode-friendly, responsive UI.
- 📦 Zero servers to manage (serverless).

## Quick start

### 1) Create Firebase project
1. Go to Firebase Console → create project.
2. Enable **Authentication** → Providers → enable *Email/Password* and *Anonymous* (optional).
3. Enable **Firestore** (Native mode).
4. Create a Web App → get your `firebaseConfig` object.

### 2) Clone this repo & configure
```bash
# in your terminal
cp web/firebase-config.sample.js web/firebase-config.js
# paste your config into web/firebase-config.js
```

### 3) Deploy Cloud Function (global price feed)
Install Firebase CLI, log in, then:
```bash
cd functions
npm install
# Set your region if desired: --region=asia-south1
npx firebase deploy --only functions,firestore:rules
```
> The scheduled function `tickMarket` writes the latest prices into `firestore` under `market/state`.  
> By default it ticks **every 1 minute** (GitHub Pages is static; the function keeps the market moving).

### 4) Host front-end on GitHub Pages
Commit & push. In repo settings → Pages → serve `/web` as the site root (or use a `gh-pages` branch).  
The app loads Firebase in the browser and subscribes to prices + user data.

### 5) Security
Firestore security rules in `web/firestore.rules` restrict:
- `users/{uid}` → readable/writable only by that `uid`
- `market/state` → read-only to everyone (prices) and writable only by Cloud Functions (via Admin SDK).

> Tip: After deploying, in Firebase Console → Firestore → import `market/state` document once if it doesn't exist.  
> The first tick will overwrite it with live values.

---

## Local dev
You can use `npx serve web` or any static server to preview. Market will stream once you set your Firebase config.

## Editing prices/volatility
- The function keeps a canonical `stocks` array and volatility per symbol.
- Change symbols/categories in `functions/index.js` and `web/app.js` to match.

## License
MIT
