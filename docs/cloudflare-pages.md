# Cloudflare Pages deployment

This repository deliberately deploys only the generated `site/` directory. Do **not** point Cloudflare Pages at the repository root: it also contains internal research, historical drafts, legacy test scripts, and local working areas that are not public website content.

## One-time Cloudflare dashboard setup

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Choose **Create application** → **Pages** → **Connect to Git**.
3. Authorize Cloudflare to access GitHub, then select `hkustenterprize/RM2027-webpage`.
4. Use `main` as the production branch.
5. Select no framework preset.
6. Configure the build settings exactly as follows:

   | Setting | Value |
   | --- | --- |
   | Root directory | `/` (repository root) |
   | Build command | `node scripts/build-site.mjs` |
   | Build output directory | `site` |
   | Node.js version | `20` |

7. Select **Save and Deploy**. Cloudflare will deploy the `site/` directory to a `*.pages.dev` address.
8. Every future push to `main` triggers a production deploy. Other Git branches become preview deployments.

## Custom domain

Add domains through **Workers & Pages → [project] → Custom domains** first.

- For an apex domain such as `robomaster.hk`, add the zone to Cloudflare and switch its nameservers to Cloudflare. Pages can then create the needed DNS record.
- For a subdomain such as `www.robomaster.hk`, configure it through the Pages dashboard and point a DNS CNAME to the assigned `<project>.pages.dev` host when Cloudflare instructs you to do so.
- Do not add only a manual CNAME before associating the domain in Pages; Cloudflare documents that this can cause connection errors.
- A repository `CNAME` file is not required for Cloudflare Pages.

## Pre-release gate

The build directory prevents research, drafts, legacy tests, and local scratch files from deploying. It does not itself clear public-content issues. Before associating a public production domain, complete the tracked checks for:

- permissions or replacements for watermarked photos and reused diagrams;
- approved team facts, awards, recruitment contacts, and school affiliations;
- Star Trek-derived phrasing/branding review;
- moving private local badge/reference materials outside the project workspace.

## Validate the deployment artifact locally

```bash
node scripts/build-site.mjs
python -m http.server 8377 --directory site
```

Open <http://127.0.0.1:8377/> and verify that `research/`, `drafts/`, `tests/`, and `tmp/` cannot be reached from the generated directory.

## Metric refresh

`.github/workflows/refresh-metrics.yml` refreshes `data/metrics.json` each Monday using public GitHub data and the forum's source-page citation field. Its commit to `main` triggers a new Pages deploy automatically. The workflow intentionally does not show forum view counts on the public site, because an automated page read may affect that counter.
