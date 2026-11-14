# Plan: dark "space" globe screen + mobile layout

Status: proposal for review (2026-11-14). Nothing here is built yet.

## Part A. Dark "space" theme for the globe screen

**Decision:** the landing page (`/`) stays white. The globe screen (`/explore`) goes dark, so Earth floats in space.

Why: Earth on white loses the feeling of looking at the planet from orbit; every comparable tool (Google Earth, NASA Worldview, NASA Eyes) puts the globe on black. The jump from the white story page into the dark globe also becomes a moment: the existing circular reveal transition reads as "launching into space".

### Look
| Role | Colour | Notes |
|---|---|---|
| Space (behind the globe) | `#05070B` | near-black, with a faint real star map (Cesium's built-in Tycho star catalogue) dimmed to ~35 % so it never competes with the data |
| Panel | `#11161E` | dark grey, not pure black (pure black kills depth and causes text halation) |
| Raised surface | `#1A212C` | hover, inset boxes, chips |
| Lines | `#273140` | |
| Text | `#E8EDF2` | off-white for body text; pure white only for big headings |
| Muted text | `#9AA6B5` | still ≥ 4.5 : 1 on the panel colour (WCAG AA) |
| Highlighter (signature) | `#FFE14D` | unchanged: "Proven" and key findings keep the yellow highlighter, with dark text on it |
| Primary button | off-white `#E8EDF2` with dark text | the inverse of the landing page's black buttons |
| Fire | `#FF6A3D` | slightly brighter so it holds up on dark |

The atmosphere glow around Earth comes back on (it was toned down for the white page).

### How (low risk)
- All colours are already CSS variables, so one `theme-space` class on the globe screen redefines them. The landing page is untouched.
- Audit for hard-coded colours: chart lines (`SeriesChart`), the selected-spot marker outline, tooltips, the "How we know" modal, the fire panel, and the Cesium credit strip.
- Labels already use white text with a dark outline, which suits a dark globe.
- Check: every text and colour pair against WCAG AA, then screenshots of every panel state on dark.

Effort: about half a day.

## Part B. Mobile layout

### What's broken today (screenshots in `.verify/mobile-audit/`)
- On a phone the analyst panel covers the whole screen, so the globe can't be seen or tapped.
- The top bar runs off the right edge (only "Temperature" and half of "Plant growth" show).
- The legend and timeline get squeezed into a sliver.
- On iPad portrait, the two side panels cover most of the globe.

### Principle
Nothing gets cut. Every feature (analyst, voice, search, case file, chart, fires, change scans, opposite trends, place names, 3D buildings, "How we know") stays reachable. We change where things live, not what they do.

### Three layouts by screen width
| Screen | Layout |
|---|---|
| Phone (< 768 px, and tablets in portrait < 1024 px) | Full-screen globe + one bottom sheet (the Google Maps / Apple Maps pattern) |
| Tablet landscape / small laptop (1024–1279 px) | Globe + one right-hand panel with two tabs: **Ask** and **Details** |
| Desktop (≥ 1280 px) | Today's three columns, unchanged |

### Phone layout, in detail

```
┌───────────────────────────┐
│ ◉  Search a place or ask… 🎤│  ← one search pill: type a place OR a question; mic = voice
│ [Temperature][Plants][Rain]→│  ← variable chips, swipe sideways (like Google Maps' category chips)
│                           │
│        🌍  full-screen     │  ← the globe is always the main thing on screen
│           globe            │
│                    [Layers]│  ← floating button: Satellite / Night, 3D buildings, Names, Fires, How we know
│ ┌───────────────────────┐ │
│ │ ───                   │ │  ← bottom sheet with a drag handle
│ │ Ikorodu               │ │     peek: the headline
│ │ 2 of 4 records show…  │ │
└─┴───────────────────────┴─┘
```

**The bottom sheet** has three resting heights, sized as fractions of the screen:
- **Peek (~15 %):** a one-glance summary. The globe stays almost fully visible.
- **Half (~50 %):** the main content.
- **Full (~92 %):** everything, scrollable.

There is no dark overlay behind it: the globe stays touchable at peek and half. Drag the handle or flick to move between heights; swipe down to dismiss. The handle has a 48 px touch area and a screen-reader label.

**What the sheet shows depends on what you're doing (one sheet, never stacked panels):**

| You… | Peek | Half | Full |
|---|---|---|---|
| Just opened the globe | "What the colours mean" + legend + Proven trends / Play the years | the explanation + "Not sure what to ask? Try one" | — |
| Tap a spot, a name, or search a place | place name + one-line answer | the four findings (Proven / Not proven) | chart, "How sure are we?", this month, "For scientists" |
| Ask the analyst (type or 🎤) | the latest answer's first line | the conversation | the conversation with the input pinned above the keyboard |
| Turn on fires / tap a flame | "10,317 fires in the last 24 h" + Fly to the biggest | the fire card (where, when, how intense) | — |
| Scan for changes | "Found 20 changed patches" | the numbered list | — |

**The analyst stays magical on a phone.** When the analyst moves the globe (flies to a place, shows hotspots), the sheet drops to peek automatically, so you watch the globe move. Then you pull up to read the answer.

**Voice-first on phones:** the mic sits right in the search pill. Talking is easier than typing on a phone, so this is where the live voice analyst can stand out.

**Smaller pieces:**
- The year scrubber becomes a slim bar just above the sheet while "Play the years" is on.
- The place name that rises over the globe (the signature) scales down to fit a phone.
- A back arrow in the sheet header returns to the previous view (place → conversation).

### Phone-specific engineering
- **Touch:** targets ≥ 44 px (Apple) / 48 dp (Material). Only the sheet handle drags the sheet; the globe gets every touch outside the sheet, so pinch-zoom and spin keep working.
- **Screen edges:** respect the notch and home indicator (`env(safe-area-inset-*)`). Use `100dvh` so the browser's address bar doesn't cut off the bottom.
- **Keyboard:** keep the input above the on-screen keyboard using `visualViewport`, which is the reliable method on iOS; CSS `dvh` alone ignores the keyboard. Test the known iOS 26 bug where the page doesn't snap back after the keyboard closes. Inputs use ≥ 16 px text so iPhone doesn't auto-zoom.
- **Voice on iPhone:** start the mic and the audio from the Talk tap (Safari requires a user gesture and HTTPS, which Railway provides). Test on a real iPhone, including Low Power Mode, which blocks autoplay.
- **Performance (rendering, not features):**
  - Cap the render resolution on high-density phone screens, which is Cesium's biggest frame-rate lever.
  - **3D buildings start off on phones** (still one tap away in Layers). Google 3D tiles are the most common cause of iPhone browser crashes in Cesium's own forums.
  - When 3D buildings are on, a phone gets a tighter memory budget.
  - Fewer labels on screen at once (about 60 instead of 140), because a phone screen is smaller.
  - The fires layer already shares one image across all flames, so 10,000 fires are fine.

### Tablet landscape (1024–1279 px)
The globe plus one 380 px panel on the right, with **Ask | Details** tabs. Tapping a place switches to Details; asking switches to Ask. The panel collapses to a thin edge tab for a full-width globe. Variable chips scroll sideways in the top bar.

### Landing page on phones
It already passes the motion check at phone size. A small polish pass: hero Earth placement, the card stack, and type sizes.

### How we'll test
- Automated browser tests on iPhone 14, Pixel 7, iPad Mini (portrait and landscape) and desktop:
  - open the globe, search a place
  - move the sheet between peek, half and full
  - ask the analyst, turn on fires and tap a flame
  - check names show
  - screenshots of every state
- Re-run the full desktop walkthrough to prove nothing regressed.
- On real devices (your team): an iPhone in Safari (voice, keyboard, memory with 3D buildings) and an Android phone in Chrome. Emulators can't prove the microphone or iPhone memory limits.

Effort: Part B is about one and a half to two days. Part A first, because the dark tokens are what the mobile panels will use.

## Decisions for you
1. **Stars behind Earth:** a faint real star map (recommended) or plain deep black?
2. **3D buildings on phones:** start off, one tap to turn on (recommended), or on by default?
3. **What phones show first:** the legend at peek (recommended), or the analyst ready to type?

## Sources
- Bottom-sheet pattern used by map apps (peek/half/full, no overlay so the map stays interactive): [Google Maps-style sheet](https://proandroiddev.com/building-a-google-maps-style-bottom-sheet-with-jetpack-compose-eccc1f3cf578), [Apple Maps-style detents](https://vp0.com/blogs/draggable-bottom-sheet-map-modal), [Eleken bottom sheet guide](https://www.eleken.co/blog-posts/bottom-sheet-ui)
- Standard vs modal sheets, 48 dp drag handle: [Material Components bottom sheet](https://super12138.github.io/material-components-android/components/BottomSheet.html), [Material sheets](https://material.io/components/sheets-bottom)
- Google Earth adapting its UI by width: [Flutter case study](https://flutter.dev/blog/extreme-ui-adaptability-in-flutter-how-google-earth-supports-every-use-case-on-earth)
- Cesium on phones: [resolution scale on retina](https://community.cesium.com/t/lowering-the-resolution-in-retina-displays-for-much-faster-rendering/3693), [iOS memory crash with Google 3D Tiles](https://community.cesium.com/t/ios-memory-crash-with-google-3d-tiles/33037), [3D tiles on low-RAM phones](https://community.cesium.com/t/error-when-loading-cesium3dtileset-on-mobile-devices-with-lower-ram/21057), [iOS 18 WebGL crashes](https://community.cesium.com/t/crashing-on-ios-18-2-and-18-3-on-specific-devices/39615)
- Keyboard and viewport on iOS: [visualViewport fix](https://dev.to/franciscomoretti/fix-mobile-keyboard-overlap-with-visualviewport-3a4a), [why dvh ignores the keyboard](https://dev.to/rl0425/why-css-dvh-ignores-the-mobile-keyboard-and-how-to-fix-it-31ao), [iOS 26 viewport bug](https://developer.apple.com/forums/thread/800125)
- Voice on iPhone Safari: [autoplay and WebRTC](https://webrtchacks.com/autoplay-restrictions-and-webrtc/), [Safari WebRTC guide](https://webrtchacks.com/guide-to-safari-webrtc/)
- Dark UI: [avoid pure black, off-white text, AA contrast](https://atmos.style/blog/dark-mode-ui-best-practices), [12 principles of dark mode](https://uxcel.com/blog/12-principles-of-dark-mode-design-627)
