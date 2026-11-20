# Calligraphy Studio

Design Arabic calligraphy in your browser: type a name or phrase, pick a traditional script style, shape each letter, and export the result for print, the web or cutting machines.

Inspired by https://kaleam.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create, rename, open and delete calligraphy projects that save as you work.
- Write Arabic text in Naskh, Ruqʿah, Nastaʿlīq or Kufi, and set its size, colours and line alignment.
- Adjust any single letter's thickness, elongation, position, scale, rotation and colour, with undo and redo.
- Add a mirrored copy side by side or above and below, set the gap and move each half.
- Export PNG (2000 px, with or without background), SVG, outline SVG and vector PDF.
- Share a project with teammates as viewer or editor, and publish templates anyone in the team can copy.

Left out: accounts and sign-in, which your Gateway handles; plans and quotas; live co-editing; posting to social networks; a ready-made template catalogue.

## Setup

The app has no secrets or settings: its database is created by the deploy.

```sh
pnpm install
pnpm dev                 # run locally behind the local Gateway
pnpm test                # query and access-rule tests
pnpm run deploy          # deploy to your Cloudflare account behind your Gateway
```

The checks in `checks/` run against a packaged release in a local runtime; a real Cloudflare deploy is not part of them.

## Limitations

- A teammate can be shared with only after they have opened the app once.
- Outline SVG exports the letters' shapes; extra stroke thickness is not included.
- Letter adjustments follow the character's position in its line: an edit that moves a letter to another position drops its adjustments.
- Fonts are the bundled open-licence ones (licences in `public/fonts/`); there is no font upload.
