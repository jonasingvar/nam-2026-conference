<!--
How to build a page so it looks exactly like an image a person supplied. Not a
command: the factory gives every agent `referenceRule` (factory/lib/visuals.ts)
when a request comes with images, and that rule points here. The images are
files in the sandbox under /vercel/.factory/reference/. Locally, save the image
somewhere and use the same steps.
-->

# Match a reference image

A screenshot, a sketch or a mock-up in a ticket, a pull request or a comment is
the design. The job is to make the page look like it — not like something
inspired by it. Only the words of the request override the image, and only where
they say something specific ("but on My Agenda", "without the sponsors row").

## 1. Read the image before any code

Open it with the Read tool. Then write down what is in it, top to bottom, left
to right — this inventory goes into the spec under `## The reference`:

| Write down | For example |
| --- | --- |
| The regions, in order, and how they are arranged | header; a single column of panels; no sidebar |
| What sits beside what, and what is stacked | portrait left of the title; time above the title |
| Every element in a repeated item, in order | rail, time, title, portrait, name, role, room, venue, button |
| The text shown, as written | "Remove seat", "Day 2 · 11:00" |
| Sizes relative to each other | the panel spans the content width; the portrait is about a third of the panel's height |
| Spacing | a gap about half a panel's padding between panels |
| Type | the title is the largest text and bold; the room is small and muted |
| Colour and shape | violet rail 3–4 px wide, full height of the panel; rounded corners; no shadow |
| What is NOT there | no tiles, no filters, no second button |

Count things. "Three panels, one per session" is a fact the page must match;
"some panels" is not.

A sketch gives structure and order, not pixels: match the arrangement and the
content, and take sizes, type and colour from this app's tokens. A screenshot
gives everything it shows.

## 2. Map it to this app, changing nothing

- **Content.** The image shows the shape of the data, not the data: names and
  times come from the seed. Every field the image shows must be on the page;
  no field the image does not show may be added.
- **Tokens.** Where the app has a token for what the image shows (a colour, a
  font, a radius in `src/index.css`, a component in `src/components/ui.jsx`),
  use the one that matches the image — not the one the app uses elsewhere for
  the same job.
- **What cannot be built** (data the API does not have, an interaction the image
  cannot show) is a Decision in the spec, named. Never a quiet substitute.

## 3. Build in this order

Structure first (regions, order, what is beside what), then sizes and spacing,
then type, then colour and detail. A page with the right colours in the wrong
arrangement is wrong.

## 4. Compare, at the image's own size

Screenshot the page at the reference's dimensions — exactly, for a PNG — so the
two can be read side by side:

```
npm run shot -- /my-agenda --like=/vercel/.factory/reference/reference-1.png --user=1 [--at=2026-11-26T11:00]
```

`--like` sets the viewport to the image's width and height at scale 1 and writes
`.screenshots/<route>-like.png`, for a PNG, JPEG, WebP or GIF reference alike. An
image it cannot read stops the run (exit 2) and takes no screenshot. Pick the attendee and
the clock so the page has the same amount of content as the image.

Read both images. Go through the inventory row by row and write each difference
down:

| Element | The reference | The page | Fix |
| --- | --- | --- | --- |
| panel layout | portrait left, text right | portrait above text | flex row |

Fix every row, screenshot again, compare again. Stop when a pass finds no
difference, or after four passes — then every difference left is listed for the
person as a Decision, with why.

## 5. What counts as a difference

A blocker, unless the words asked for it: a region missing, added or in another
order; elements arranged differently (stacked for side by side, left for right);
an element of an item missing or added; a clearly different size relation (small
for large, narrow for full width); a different control or label; a horizontal
layout where the image is vertical.

Not a difference: other names, times or counts from the seed; the browser's own
text rendering; a pixel or two; content the image cuts off at its edge; the app
shell (the navigation) when the image shows only the page's content.

## 6. Auditing someone else's page

Do steps 1 and 4 yourself, from the image and the running page — not from the
spec's description, which may have misread it. Each blocker names the element,
what the reference shows, and what was built.
