# CineScout

A movie browser. Search any movie, see where it's streaming in your country, and watch public-domain classics for free right on the page.

- **Paid movies**: shows Netflix, Prime Video, Disney+ and other services that carry the title in your region, with buttons that open the movie on that service.
- **Free movies**: public-domain films stream from the Internet Archive inside the site.

Plain HTML, CSS and JavaScript. No build step and nothing to install.

## Setup

1. Make a free account at [themoviedb.org](https://www.themoviedb.org/signup), then get a key at **Settings → API**.
2. Paste the key into `config.js` (`TMDB_KEY: "..."`).
3. Serve the folder with any static server, for example:

   ```bash
   python -m http.server 5500
   ```

   Then open http://localhost:5500. Use a server rather than double-clicking `index.html`, because YouTube trailers won't play from a `file://` page.

The free classics work without a key.

## Deploying

Upload the folder to GitHub Pages, Netlify or Vercel. Note that the TMDB key in `config.js` will be visible to visitors. TMDB allows that for read-only keys, but don't reuse the key anywhere sensitive.

## Data sources

- [TMDB](https://www.themoviedb.org/): movie info, posters, trailers. This product uses the TMDB API but is not endorsed or certified by TMDB.
- [JustWatch](https://www.justwatch.com/), via TMDB: streaming availability.
- [Internet Archive](https://archive.org/details/feature_films): free public-domain films. A movie is offered as free only if it's on the hand-picked list in `app.js`, is marked public domain or Creative Commons on archive.org, or was released before US copyright expired for its year.
