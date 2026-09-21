# Immersive scenes

`ImmersivePlayer.tsx` owns the playback controls, timeline, volume, and scene
selection, remembered in local storage. It embeds the shared `QueuePanel` with the current scene palette.
`useImmersiveFullscreen.ts` manages native fullscreen and releases fullscreen
when the player closes if it entered fullscreen. It targets the document so
playback confirmations portaled to the body remain accessible.
`useImmersiveControls.ts` manages focus, keyboard handling,
control visibility, and the reduced-motion preference. The player uses the existing audio;
scenes do not create or control their own audio element.

## Discovery and analytics

Both player layouts highlight the entry button with a **New** badge until its first
activation. `audio-share:immersive-discovered` remembers discovery in local storage.
If storage is unavailable, the badge still clears for the mounted player.

Events use the existing `useRybbit` hook:

| Event | Properties | Trigger |
| --- | --- | --- |
| `immersive-player-open` | `entryPoint` (`compact` or `expanded`), `highlighted` | Entry button activation; counts attempts, including failed downloads |
| `immersive-player-close` | `scene` | Back button or Escape leaving immersive mode |
| `immersive-scene-change` | `from`, `to` | Selecting a different scene |
| `immersive-motion-change` | `scene`, `motion` | Toggling scenery motion |
| `immersive-queue-open` | `scene` | Opening the immersive queue |

These events contain UI choices, with no track titles or playback positions.

```text
immersive/
  ImmersivePlayer.tsx
  ImmersivePlayer.css
  useImmersiveFullscreen.ts # Native fullscreen state and cleanup
  useImmersiveControls.ts   # Focus, keyboard navigation, motion preference, idle UI
  scenes/
    types.ts                 # Playback inputs, frame/layer types, scene registration
    registry.ts              # Available scenes and default
    shared/
      SceneCanvas.tsx        # Canvas lifecycle, resizing, visibility, drag seeking
      SceneCanvas.css        # Shared canvas sizing and cursor behavior
      sceneClock.ts          # Audio interpolation, continuous travel, ambient motion
      sceneTransition.ts     # Track transitions and palette blending
      scenery.ts             # Seeded randomness, smoothing, blended waveform sampling
      artworkPalette.ts      # Artwork loading and shared hue extraction
    traveler/
      index.ts               # Metadata and lazy component import
      TravelerScene.tsx     # Data preparation, artwork palette, walking phase
      drawTraveler.ts
      traveler.ts           # Scene data, terrain, seek mapping, palette helpers
      travelerGait.ts
      *.test.ts
    night-train/
      index.ts
      NightTrainScene.tsx
      drawNightTrain.ts       # Countryside, glass, and carriage rendering
      drawBuilding.ts        # Facades, rooflines, windows, and balconies
      drawRain.ts            # Wind-driven rain and sliding droplets
      drawInterior.ts        # Seat viewed in profile beside the window
      nightTrain.ts          # Waveform skyline, hills, and seek mapping
      palette.ts             # Blue night colors and artwork accents
      nightTrain.test.ts
    shrine-path/
      index.ts
      ShrinePathScene.tsx
      drawShrinePath.ts      # Mountain layers, garden layout, path, and parallax
      drawArchitecture.ts   # Tiled roofs, timber halls, torii, and stone lanterns
      drawGarden.ts         # Pines and mossy rocks
      drawCherryTree.ts     # Seeded airy, full-bloom, and weeping cherries
      drawVillage.ts        # Settlement placement and house geometry
      drawGardenLandmark.ts # Pond and grove layouts
      drawPond.ts           # Water, shoreline, bridge, and drawing order
      landmarks.ts          # Stable landmark selection by world cell
      terrain.ts            # Waveform ridges and stable village foundations
      approach.ts           # Shared path and torii perspective, footing clearance
      shrinePath.ts         # Waveform preparation and seek mapping
      palette.ts            # Dusk colors, fixed vermilion, and artwork accents
      shrinePath.test.ts
    desert-dusk/
      index.ts
      DesertDuskScene.tsx
      desertDusk.ts         # Broad waveform envelopes, stable ground, seek mapping
      drawDesertDusk.ts     # Dunes, sunset, sand, and parallax
      drawRuins.ts          # Weathered arches, walls, and columns
      drawCaravan.ts        # Distant camel silhouettes
      drawDesertDetails.ts  # Mesas, rock formations, scrub, and ground detail
      drawCamp.ts           # Canvas tents, supplies, and a small animated fire
      campsite.ts           # Seeded camp layouts and full-silhouette dune clearance
      palette.ts            # Warm sand with artwork-derived dusk accents
      desertDusk.test.ts
    underwater-drift/
      index.ts
      UnderwaterDriftScene.tsx
      underwaterDrift.ts    # Smoothed seabed ridges, stable reef ground, seek mapping
      drawUnderwaterDrift.ts # Water, light shafts, waveform ridges, and particles
      drawReef.ts           # Seabed, submerged ruins, rocks, and plant placement
      drawPlants.ts         # Swaying kelp, sea fans, and tube coral
      drawSeaLife.ts        # Jellyfish and drifting schools of fish
      drawSwimmers.ts       # Gliding rays, paddling turtles, and nearby reef fish
      palette.ts           # Blue-green water with artwork-colored coral and jellyfish
      underwaterDrift.test.ts
```

## Adding a scene

1. Create `scenes/<name>/` with a component accepting `SceneProps` from
   `scenes/types.ts`. Keep its rendering, styles, assets, helpers, and tests together.
   The component can use canvas, SVG, DOM, or WebGL.
   For 2D canvas, `shared/SceneCanvas.tsx` provides the animation lifecycle and
   gestures. Pass stable scene data, a drawing function accepting `SceneFrame<T>`,
   a `travelSpan(duration)` function (seconds per travel unit), a drag-to-time
   mapping, and a scene-specific class name. Canvas sizing and cursor behavior
   are shared; add scene CSS only for scene-specific styling.
   Artwork and waveform updates are read by the existing loop, preserving the
   ambient clock and camera position while resources load.
2. Export a `SceneDefinition` from that folder's `index.ts`. Include a unique `id`,
   `label`, Lucide `icon`, lazy-loaded `Component`, and the four hint/caption strings.
   Follow `traveler/index.ts` for the complete example.
3. Add the definition to `scenes/registry.ts`. The player shows a scene picker when
   more than one scene is registered, including on mobile. Change `defaultScene`
   there to choose the fallback when no valid saved selection exists.

Scenes receive track identity, artwork, waveform peaks, playback position and
duration, playback state, and the motion preference. `peaks` and `thumbnail` can
be null. Use a flat waveform until peaks arrive, and a default palette without artwork.
Scene entry points prepare data with a pure `create…` function, publish the
control palette, and pass only `ScenePlaybackProps` plus prepared data to `SceneCanvas`.
Keep artwork/peak loading out of draw functions; renderers receive `SceneFrame<T>`
and scene data, with no dependency on React or the audio context.

`SceneFrame.travel` is the continuous journey position in world units; it does
not reset when playback moves to the next track. Use it for scenery positions
and movement phases. Convert units to CSS pixels with `SCENE_TRAVEL_DISTANCE`
from `shared/scenery.ts` (1440 pixels), then apply the layer's parallax speed.
Use viewport width for framing and culling, not movement speed. `SceneCanvas`
passes this same distance as the third argument of the drag-to-time mapping.
Keep procedural decoration seeds stable for the mounted
scene. `frame.layers` contains weighted old/new data with each track's sampling
time and duration. Use `sampleSceneWaveform(layers, samples, span, offset, speed)`
to blend amplitudes; `offset` is in world units and `speed` defaults to 1.
Use `mixPalette` for colors (six-digit hex or HSL), keeping the original palette
on the scene data. Transitions last 2.4 seconds and can be interrupted by late
resources or another skip without losing the visible mixture. `isLoading` keeps
the journey moving while audio loads; it does not advance the audio timeline.
`frame.moving` describes that visual movement, including loading, while
`SceneProps.isPlaying` describes audio playback. Both loading and playing states
are explicit inputs. Still mode makes `frame.moving` false.

Shrine path's village uses a stable hillside sampled in world coordinates. Houses
and trees share its parallax, and foundations clear the entire terrain footprint.
Only the two distant ridges respond to the waveform, so track transitions cannot
lift or drop the settlement. Keep shoreline rocks below the pond bridge in drawing
order. Cherry artwork is cached by seed, distance, and resolution with a bounded
cache; ambient motion is applied when drawing the cached tree.

Desert at dusk also keeps landmark terrain independent of waveform changes. Its
two distant dune layers use smoothed waveform envelopes; ruins and caravans share
the stable middle dune's ground function. Ruins render before the dune to bury
their foundations. Caravan travel and wind use ambient time, so Still scene freezes
them and loading the next track preserves their motion. Artwork tints the haze,
distant sand, and controls while nearby sand and stone retain their warm colors.
Campsites vary between single awning shelters, paired tents, and three-tent groups.
Their bounds include roofs, ropes, supplies, and fire effects; placement keeps the
entire silhouette below the stable middle dune's crest without following waveform
changes. The foreground dune may naturally obscure the lower part of a camp.

Underwater drift uses two waveform-shaped distant seabed ridges and a stable reef
for plants, rocks, and submerged ruins. Kelp, jellyfish, rays, turtles, fish, light, and particles
animate from the shared ambient clock, so Still scene freezes the entire view.
World cells keep decoration stable when revisiting a position; foreground kelp
and suspended particles move at different depths. Artwork colors tint coral,
jellyfish, and controls while water and kelp retain their blue-green palette.
Larger swimmers travel independently in both directions with distinct fin and
flipper cycles; their world cells keep them moving continuously across tracks.
`SWIMMERS` keeps each species' drawing function, spacing, speed, starting position,
and seed offset together. Preserve existing seed offsets when adding or reordering
species so their direction, size, and movement phase stay consistent.

The player preloads the next queued waveform in the final 20 seconds. Playback
metadata and waveforms load independently, so a slow waveform does not delay audio.

Call `onPaletteChange` when the scene's colors change to theme the shared picker.
Provide `background`, `control`, `hover`, `border`, and `accent` from the colors
used by the scene. All scenes report artwork-derived palettes; Night train keeps
its blue environment and warm lamps, using artwork color for upholstery, carriage
lighting, and selected buildings and their reflections. Shrine path keeps its
vermilion gates, timber, and warm lanterns, while artwork tints the sky, mountain
ridges, and control accents. `shared/artworkPalette.ts`
loads artwork and falls back to each scene's default colors when unavailable.
Keep the callback out of canvas rendering loops.

For scrubbing, call `onPreview(time)` while dragging, then `onSeek(time)` on
release and `onPreview(null)` to end the preview. Cancellation only clears the
preview. Honor `canSeek` before starting a seek. `previewTime` also lets the scene
render the target position without moving the actual audio during a drag.
The shared timeline uses the same preview/commit behavior for mouse and touch
drags, including release outside the slider. Keyboard changes seek immediately.
Track and scene changes discard pending timeline drags.

Honor `motion=false` by stopping continuous animation and parallax, while still
redrawing for resizing, scrubbing, or track updates. Stop animation work in hidden
tabs and release animation frames, observers, listeners, and rendering resources
on unmount. The player remounts a scene only when its selection changes. Track
changes preserve its canvas, ambient clock, and parallax, but clear any pending
seek preview. Still mode applies new track data immediately without animating a
transition. Playback and the motion setting stay in the shared player.

`seekVersion` increments on explicit seeks from any playback control. In still
mode, use it to update the scene to `currentTime` without following normal playback
updates. `SceneCanvas` handles this for canvas scenes, including drag commits.

Scene styles should use their own class prefix. The shared controls use
`immersive-*`; their layout and accessibility belong to the player. Extract more
shared rendering helpers only when another scene needs them.

Run `npm test`, `npm run build`, and `npm run lint` from `frontend/`. Keep scene
geometry and palette tests with the scene; lifecycle, seeking, and transition
tests belong in `shared/`. Verify artwork changes, delayed waveforms, track
changes, and reduced motion when adding a renderer.
