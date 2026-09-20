# Adding screenshots and clips to the minisites

Each mod's minisite has a **Screenshots and clips** section made of named slots. A slot with
no files shows a dashed "Not captured yet" frame; a slot with files shows them. Adding media
is two steps: drop the files into the mod's `media/` folder, and list them in that folder's
`manifest.json`. No HTML, CSS or script changes, and no layout work.

| Mod | Page | Folder |
| --- | --- | --- |
| Ghostty | `/mods/ffxiv/term/` | `public/mods/ffxiv/term/media/` |
| XivMcp | `/mods/ffxiv/xivmcp/` | `public/mods/ffxiv/xivmcp/media/` |
| XivDesktop | `/mods/ffxiv/xivdesktop/` | `public/mods/ffxiv/xivdesktop/media/` |
| Almanac | `/mods/ffxiv/almanac/about/` | `public/mods/ffxiv/almanac/media/` |

Ghostty's slots are the shot list in ghostty-dalamud's `docs/media/shot-quests.json`, with the
same ids and in the same order, plus the homepage video and its planned cuts. The other three
have a shorter list written for their page. These are community screenshots' curated
counterpart: shots sent by players go through the moderated gallery instead, never here.

## The manifest

```json
{
  "version": 1,
  "mod": "ghostty",
  "slots": [
    {
      "id": "dropdown-limsa",
      "title": "The Drop from Above",
      "kind": "gif + screenshot",
      "caption": "The glass dropdown sliding down, switching tabs, closing again.",
      "where": "Aftcastle, facing the harbour, Limsa Lominsa Upper Decks.",
      "wide": false,
      "files": [
        {
          "type": "image",
          "src": "dropdown-limsa.webp", "width": 1920, "height": 1080,
          "sizes": [ { "src": "dropdown-limsa-640.webp", "w": 640 }, { "src": "dropdown-limsa-1280.webp", "w": 1280 } ],
          "alt": "A translucent terminal dropped over the Limsa Lominsa harbour, three tabs open"
        },
        {
          "type": "video",
          "src": "dropdown-limsa.mp4", "poster": "dropdown-limsa-poster.webp",
          "width": 960, "height": 540, "loop": true
        }
      ]
    }
  ],
  "video": { "title": "...", "length": "...", "caption": "...", "cuts": [ { "t": "0-8 s", "note": "..." } ], "file": null }
}
```

- `files` is a list: a slot whose kind is "gif + screenshot" takes both, shown in order.
- `type` is `image` or `video`. `width` and `height` are the real pixel size of `src` and are
  required, so the page does not jump while media loads.
- `alt` is required for an image: say what is in the picture. For a video it becomes the label.
- `sizes` (optional, images) lists smaller copies by pixel width. The page builds a `srcset`
  from them plus `src`, so a phone downloads the 640 px copy, not the 1920 px one.
- `poster` (optional, video) is the still shown before play. `loop: true` makes a muted,
  looping clip: use it for what would have been a GIF.
- `wide: true` makes the slot span the full row.
- `video.file` takes the same shape as a `video` entry, for the long homepage video.
- File names: lower-case letters, digits, `.`, `_`, `-`; extensions `webp avif jpg jpeg png
  mp4 webm`. Files sit beside the manifest, never in subfolders or on another host.
- To add a new shot to the plan, add a slot. To reorder, reorder the list.

`node --test tests/` fails if a listed file is missing, if a file in a `media/` folder is not
listed (nothing is published by accident), if an image has no `alt` or a file no size, or if
a file is over 25 MiB, the per-file limit of Workers Static Assets.

## Making the files

Do not publish GIFs or full-size PNGs: a 30 fps GIF at 960 px is tens of megabytes, where the
same clip as H.264 is one or two. Every image is lazy-loaded except the first slot's, and
videos use `preload="none"`, so nothing is fetched until it is near the screen or played.

```sh
# a screenshot: full size plus two smaller copies, metadata stripped
magick shot.png -strip -quality 82 dropdown-limsa.webp
magick shot.png -strip -resize 1280x -quality 80 dropdown-limsa-1280.webp
magick shot.png -strip -resize 640x  -quality 78 dropdown-limsa-640.webp

# a short loop (what would have been a GIF): 960 px wide, 30 fps, no audio
ffmpeg -i clip.mkv -an -vf "scale=960:-2,fps=30" -c:v libx264 -crf 24 -preset slow \
  -pix_fmt yuv420p -movflags +faststart -map_metadata -1 dropdown-limsa.mp4
ffmpeg -i dropdown-limsa.mp4 -frames:v 1 -q:v 3 poster.png && magick poster.png -quality 80 dropdown-limsa-poster.webp

# the long video: 1080p, keep it well under 25 MiB (about 2.5 Mbit/s for 75 s)
ffmpeg -i tour.mkv -vf "scale=1920:-2" -c:v libx264 -b:v 2400k -maxrate 3000k -bufsize 6000k \
  -preset slow -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart -map_metadata -1 tour.mp4
```

`magick identify file.webp` and `ffprobe file.mp4` print the width and height for the manifest.

Before capturing, follow the shot list's own rules: fresh terminals or `/term showcase`, your
own name hidden, no tokens, paths or chat on screen. `-strip` and `-map_metadata -1` remove
metadata, not what is visible in the picture.

Then: `node --test tests/`, commit on `master`, `npx wrangler@4 deploy`.
