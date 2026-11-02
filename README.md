# Mojolaade Adegbite: Portfolio

Personal portfolio for Mojolaade Adegbite, Product Designer (design systems, UI/UX).

Plain HTML, CSS and a little JavaScript. No build step and no dependencies.

## Structure

```
index.html          Homepage: intro, featured projects, about, expertise, experience, education
about.html          Full "About me"
work/*.html         One case study per project (FLYR, Carbon, Netguru, Patricia Business, Patricia web app, Glover, Hank)
images/             WebP images: about/ portrait, work/<project>/ covers and case-study figures
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

- Copy lives in the HTML files, one `<section>` per part of each page.
- The header, footer and contact block are repeated on every page, so change all of them together.
- To change the look, edit `styles/tokens.css`. Components pick up the change automatically.
- Images are WebP, at most 1600px wide. Keep `width` and `height` on each `<img>` so the page doesn't jump while it loads, and write `alt` text that says what the image shows.
