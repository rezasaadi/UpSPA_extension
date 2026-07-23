# Candidate Site Scoping for the 200-Site Registry Expansion

**Primary source (per Reza):** Moz Top 500 — https://moz.com/top500 — via its maintained mirror, the `top-sites` npm package v1.1.225 (Moz blocks direct scraping; the mirror carries the identical `rank / rootDomain / linkingRootDomains / domainAuthority` data). Top 200 entries classified programmatically, 23 July 2026.
**Cross-check source:** Similarweb Top Websites (June 2026, top-50 free tier).
**Filter per instruction:** exclude adult services, YouTube-type SSO-only properties, and out-of-scope pages (no account/password flow).

---

## 1. Headline result: the Moz top 200 yields ~45 usable sites

Moz ranks by **Domain Authority (inbound links)**, not user traffic. The raw 200 breaks down as:

| Bucket | Count | Examples |
|---|---|---|
| **Usable study sites** | **42 rows → ~35 canonical sites** | linkedin, apple, github, paypal, wikipedia, vimeo, medium… |
| Individual-call platforms | 16 → ~8 kept | shopify, wix, vk, scribd… (details §4) |
| Merges into one canonical entry | 29 | 12 Google surfaces/ccTLDs, 3 Amazon ccTLDs, 8 Wikipedia languages, 3 Blogger |
| **Out of scope** | **113** | news publishers (~35), Google/CDN infrastructure (~20), domain marketplaces (~13), government/standards (~15), shorteners, phone-only messengers, hosting vendors |

**Implication for the strategy (this is the useful finding):** a links-based top-200 is dominated by non-account destinations. Even combining Moz + Similarweb + the existing registry, the realistic pool of *study-usable* password-flow sites in the global top tier is **~120–160, not 200**. The registry should target that pool; chasing a literal count of 200 would mean padding with sites nobody uses for password login. The three-tier strategy is unaffected — it just confirms the override list stays small (~15–25) because the usable pool itself is modest.

## 2. Moz top 200 — already in the 40-site registry (23 canonical)

google (r2, +12 merged surfaces/ccTLDs incl. accounts.google.com r23, blogger r3), linkedin (5), apple (6), microsoft (9, + office.com r140 as hostname merge), x/twitter (16/125), tiktok (18), telegram t.me (19), github (27), adobe (29), facebook (37, + fb.com 157), yahoo (44), amazon (50, +3 ccTLDs), dropbox (72), live.com/outlook (90), spotify (94), instagram (124), fandom* (133 — see §3), twitch (134), mail.ru* (142 — optional-regional in registry terms), pinterest (152), booking (167, pwless flag), discord (169), zoom (200).

*Strong sign: more than half of Moz's usable entries were already curated into the 40-site registry.*

## 3. Moz top 200 — NEW in-scope candidates (17)

| Moz rank | Domain | Tier | Note |
|---|---|---|---|
| 7 | wordpress.org | merge→wordpress.com entry | .org is the software site; account flow lives on wordpress.com (in registry) — add hostname only |
| 20 | wikipedia.org | **default** | classic username+password, very permissive; single canonical entry for all language editions |
| 28 | istockphoto.com | default | Getty account, conventional email+password |
| 48 | paypal.com | **override** + `studyRisk` | stricter policy; payment-adjacent — consider detection-only like e-Devlet |
| 49 | vimeo.com | default | conventional flow |
| 69 | mediafire.com | default | conventional flow |
| 74 | imdb.com | merge→amazon | IMDb uses Amazon auth; hostname candidate for the amazon entry |
| 80 | medium.com | **pwless** | email-link-first sign-in |
| 93 | wiley.com | default | academic account; conventional |
| 111 | nature.com | default | Springer account; conventional |
| 118 | aliexpress.com | **override candidate** | e-commerce; length/symbol quirks likely; verify empirically |
| 120 | webmd.com | default | conventional; low study value, keep optional |
| 126 | researchgate.net | default | conventional |
| 133 | fandom.com | **default — NEW** | (not in current 40; conventional password accounts) |
| 155 | archive.org | default | conventional, very permissive |
| 182 | pixabay.com | default | conventional |
| — | chatgpt.com | default | Similarweb r5; not in Moz 200 (young domain, low DA) — include from cross-check |

## 4. Individual calls on the 16 platform/legacy entries

**Keep (8):** shopify.com (default; merchant accounts), wix.com (default), weebly.com (default; Square account), vimeo — already above, scribd.com (default), slideshare.net (merge→scribd auth), dailymotion.com (default), issuu.com (default), vk.com (optional-regional, password flow exists).
**Drop (8):** myspace/livejournal/typepad (legacy, negligible study value), jimdofree (regional site-builder), ok.ru (regional), msn.com (content; auth = Microsoft), hatena.ne.jp (JP-regional), 4shared (file-locker, low value).

## 5. Reconciliation with Similarweb top 50 (traffic view)

Traffic-ranked additions that Moz's link-ranking misses but belong in the registry: **chatgpt.com** (SW r5), **temu.com** (SW r28, pwless-leaning OTP signup), **samsung.com** (SW r41), **bbc.co.uk account** (SW r45; the *news* side stays out, the BBC account flow is an easy conventional target), **netflix / ebay / canva / reddit / slack** (already in registry; SW confirms). Claude.ai (SW r34): no password flow — exclude or pwless-flag only.

Turkish-market and category-tail candidates (trendyol, hepsiburada, sahibinden, yemeksepeti, gitlab, atlassian, steam†, epicgames†, roblox, playstation, coursera, udemy, duolingo, indeed, etsy, walmart, hulu, disneyplus, crunchyroll, soundcloud, expedia, tripadvisor, turkishairlines, paypal—above…) remain as previously scoped; †already in registry. These fill the pool from ~70 to the ~120–160 realistic target.

## 6. Updated override & flag shortlists

- **Override (empirical check):** amazon, paypal, stripe, aliexpress, trendyol, hepsiburada, mega.nz, roblox, riotgames, playstation, ubisoft + existing (google, apple, github, dr, n11). Total ≈ 16–20 → within the report's 15–25 prediction.
- **Passwordless flag:** booking, notion, slack (confirmed in July round), medium, temu, getir, wetransfer, skyscanner, vercel, claude.ai (if included) + existing 7 flagged entries.

## 7. Numbers summary

| | Count |
|---|---|
| Moz top 200 raw | 200 |
| → out of scope | 113 |
| → merges/dedups | 29 |
| → usable canonical (incl. existing) | ~43 |
| + Similarweb-only additions | ~6 |
| + category tail (previous scoping) | ~75 |
| **Realistic registry target** | **~120–160 sites** |
| Existing registry | 40 |
| **Net new rows to write** | **~80–120, of which ~16–20 overrides; rest = `relaxed20Policy` + flags** |

*Method note: full ranked data and the classification script are reproducible — `npm pack top-sites`, then the Node classifier (kept with this file). Ranks 201–500 were also scanned: they follow the same news/infra/marketplace distribution but contain **~28 recognizable account-flow sites**, of which 11 are already in the registry or listed above (ebay 202, canva 251, quora 262, netflix 300, steam 356/452, telegram 389, uber 447, gitlab 487, coursera 488) and **~17 are genuinely new**: goodreads 208, behance 210, soundcloud 226, unsplash 272, walmart 308, kickstarter 314, hubspot 320, tripadvisor 321, surveymonkey 346, zendesk 360, disney 365, eventbrite 367, salesforce 412, imgur 415, substack 417 (pwless — email-link), flickr 444, patreon 473. These fold into the §5 category tail and slightly raise the realistic target's upper bound; the totals in §7 already accommodate them.*
