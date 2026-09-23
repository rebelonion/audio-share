# Immersive scenes

Immersive mode pairs the existing audio player with a full-screen scene. Scenes
visualize playback, but do not create or control an audio element. The player owns
the controls, queue, timeline, volume, scene selection, and saved preferences.

Available scenes are Traveler, Night train, Shrine path, Desert at dusk,
Underwater drift, River lanterns, and Moonlit pond. Their definitions and the
default scene live in [`scenes/registry.ts`](scenes/registry.ts). Each scene keeps
its component, rendering code, styles, and tests in its own folder.

## Structure

- `ImmersivePlayer.tsx` hosts the scene and shared playback UI.
- `useImmersiveControls.ts`, `useImmersiveFullscreen.ts`, and
  `useImmersiveWakeLock.ts` handle controls, fullscreen, and screen wake lock.
- `scenes/types.ts` defines scene inputs, palettes, and registration.
- `scenes/shared/SceneCanvas.tsx` provides the animation lifecycle and seeking
  gestures for 2D canvas scenes. Other rendering approaches can use `SceneProps`
  directly.
- `scenes/shared/` also contains the clock, transitions, waveform sampling, and
  artwork palette helpers shared by canvas scenes.

## Adding a scene

1. Create `scenes/<name>/` with a component that accepts `SceneProps`. Keep its
   rendering code, styles, and tests in that folder. For a canvas scene, use
   `SceneCanvas` and follow an existing scene for data preparation and drawing.
2. Export a `SceneDefinition` from the folder's `index.ts` with a unique ID,
   label, icon, lazy-loaded component, and hint and caption text. See
   [`scenes/traveler/index.ts`](scenes/traveler/index.ts) for an example.
3. Register it in [`scenes/registry.ts`](scenes/registry.ts).

Scenes receive playback state, artwork, waveform peaks, and callbacks for seeking
and control colors. Artwork and peaks can be missing, so provide visual fallbacks.
Use `onPaletteChange` when scene colors change. If the scene supports dragging,
call `onPreview` during a drag and `onSeek` on release; honor `canSeek`.

Respect the motion setting and stop animation work when the scene is hidden or
unmounted. Track changes should preserve the mounted scene and its ambient motion;
explicit seeks and new track data should still update a scene in Still mode.

Run `npm test`, `npm run build`, and `npm run lint` from `frontend/` after adding
a scene.
