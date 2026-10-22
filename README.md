# Mojolaade Adegbite: Portfolio

Personal portfolio for Mojolaade Adegbite, Product Designer (design systems, UI/UX).

Plain HTML, CSS and a little JavaScript. No build step and no dependencies.

## Structure

```
index.html          The whole page
styles/tokens.css   Design tokens: primitives, then semantic roles (light and dark)
styles/main.css     Components and layout, using semantic tokens only
scripts/main.js     Theme toggle, sticky header, scroll reveal
favicon.svg
```

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Deploy

- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.
- **Vercel or Netlify:** import the repo. There is no build command, and the output directory is the root.

## Editing

- Copy lives in `index.html`, one `<section>` per part of the page.
- To change the look, edit `styles/tokens.css`. Components pick up the change automatically.
- The "Open to new roles" pill is in the hero. Remove it when it no longer applies.
