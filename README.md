# fotovault.co.za

The public marketing site for Fotovault. Static, no build step, served by
GitHub Pages from the `main` branch of this repository.

## What this is not

This is the *marketing* site only. The product — accounts, uploads, galleries,
billing — is `portal.fotovault.co.za`, which is a Node/Express application on a
separate server with its own repository. Nothing here touches it.

## Running it locally

```bash
cd fotovault
python3 -m http.server 8080
```

Then open http://127.0.0.1:8080/. It has to be *served*, not opened as a
`file://` URL, because the import map resolves `three` out of `./vendor`.

## Layout

```
index.html        the whole marketing page
terms.html        Terms & Conditions
privacy.html      Privacy Policy
css/style.css
js/main.js        the 3D scene
vendor/three/     Three.js, vendored — nothing to install
assets/img/       the photographs on the wall
.nojekyll         stops GitHub's Jekyll step touching the files
CNAME             added by GitHub when the custom domain is attached
robots.txt        allows everything, points at the sitemap
sitemap.xml       update lastmod when the copy changes
LICENSE           all rights reserved
```

## Things that will trip you up

**`.nojekyll` must exist.** Without it GitHub runs the files through Jekyll,
which ignores folders starting with an underscore and can break the build.

**Do not hand-edit `CNAME`.** GitHub writes it when the custom domain is set in
Settings → Pages. Editing it by hand gets the two out of step.

**All paths are relative** (`./css/...`, `./vendor/...`). Keep them that way —
that is what lets the site be tested at `kowin-tech.github.io/fotovault/` before
it takes over the real domain.

**The `og:image` is `assets/img/hero-1.jpg`.** That exact filename is what the
old site advertised, so previews already cached by WhatsApp and LinkedIn still
resolve. Do not rename it; replace the file if you want a different picture.

## Analytics

Umami, self-hosted at `stats.fotovault.co.za`, website id
`1d61428d-81ed-4c97-a0c5-ed84a23d9219`. The tag is at the bottom of
`index.html`.

**The numbers are South-Africa-only.** That box only accepts HTTPS from South
African IP ranges, so a visitor from anywhere else cannot reach the tracker and
their visit is never recorded. International interest reads as zero on this
dashboard — it is biased, not merely incomplete. Do not present these figures as
total traffic.

## The brand typeface

**Fraunces** (headings) and **Inter** (body) are loaded from Google Fonts in
`index.html`, matching the previous marketing page. This was settled before
launch — do not swap them back to the system stack.

`terms.html` and `privacy.html` deliberately still use the system sans stack so
those two pages make no external requests at all. That is the one place the
brand face is not applied.
