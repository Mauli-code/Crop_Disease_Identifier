# 🚀 CropDoc AI - Deployment Guide

## Quick Deploy to Railway (Recommended)

### Step 1: Push to GitHub
```bash
git push origin main
```

### Step 2: Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select this repository
5. Railway auto-detects Python/FastAPI
6. **Done!** Your app will go live in 2-3 minutes

### Step 3: Get Your URL
- Railway generates a public URL automatically
- Share it or add a custom domain
- App is now **100% offline-capable** on mobile

---

## Alternative: Deploy to Render.com

1. Go to [render.com](https://render.com)
2. Connect GitHub account
3. Click "New" → "Web Service"
4. Select this repository
5. Set start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
6. Deploy!

---

## Features Deployed

✅ **100% Offline-First PWA**
- Service Worker caches all assets at install
- Works completely offline after first visit
- No internet = no problem

✅ **On-Device AI**
- TensorFlow.js model runs locally
- 38 disease classes detected
- Privacy: No images sent to cloud

✅ **Instant Mobile App**
- Install as PWA: "Add to Home Screen"
- Standalone app experience
- No app store required

✅ **Offline Storage**
- IndexedDB scan history
- All data stays on device
- Works on rural areas with no connectivity

---

## Testing

### Local Testing
```bash
python3 -m uvicorn app:app --host 0.0.0.0 --port 9000
```

### Mobile Testing
1. Visit `http://<your-mac-ip>:9000` on phone
2. Tap "Add to Home Screen"
3. Disconnect WiFi
4. App works 100% offline! ✅

---

## Logs & Monitoring

Railway provides:
- Real-time logs
- Memory/CPU usage
- Error tracking
- Auto-scaling

Access in Railway dashboard → Environment → View Logs

---

## Custom Domain (Optional)

1. In Railway: Settings → Custom Domain
2. Add your domain (e.g., `cropdoc.example.com`)
3. Update DNS records as instructed
4. SSL/HTTPS auto-configured

---

## Environment Variables (if needed)

Currently not required - app works offline!

If you add backend features later:
1. Railway Dashboard → Variables
2. Add as needed (e.g., API keys)
3. Auto restart on change

---

**Questions?** Check out [railway.app docs](https://docs.railway.app/)
