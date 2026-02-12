# US Weather Finder

A simple client-side weather app that searches U.S. locations and shows hourly + daily forecasts from weather.gov.

## Run locally

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open: `http://localhost:4173`

## Share with friends and family (public URL)

Because this app is static (`index.html`, `styles.css`, `app.js`), the easiest way to get a permanent shareable URL is to deploy it to a static hosting provider.

### Option 1: Netlify Drop (fastest)

1. Zip this folder.
2. Go to https://app.netlify.com/drop
3. Drag-and-drop the zip.
4. Netlify gives you an instant URL like `https://your-site-name.netlify.app`.

### Option 2: Cloudflare Pages

1. Push this repo to GitHub.
2. In Cloudflare Pages, choose **Create a project** and connect your repo.
3. Build command: *(leave empty)*
4. Output directory: `.`
5. Deploy and share the generated URL.

### Option 3: GitHub Pages

1. Push this repo to GitHub.
2. In GitHub repo settings, enable **Pages**.
3. Set source to deploy from branch (`main` or your default branch), root folder.
4. Share the generated URL from the Pages settings panel.
