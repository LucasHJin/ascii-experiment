# react-video-ascii

React component optimized for rendering videos as ASCII using WebGL2. 

[Try it out!](https://video-ascii-demo.vercel.app/)

## Installation

```bash
npm install react-video-ascii
```

## Usage

```tsx
import { VideoAscii } from 'react-video-ascii';

// Basic usage
<VideoAscii src="/video.mp4" />

// Multiple videos (loop sequentially)
const sources = ['/video1.mp4', '/video2.mp4'];
<VideoAscii src={sources} />

// With options
<VideoAscii
  src="/video.mp4"
  videoMode={false}
  numColsRaw={150}
  brightnessRaw={1.2}
  saturationRaw={1.0}
  bgOpacityRaw={0.3}
  chars=" `.',-_:!abcdef"
  charMode="shape"
  mouseEffect={{
    style: 'brighten',
    radius: 0.08,
    duration: 1.0,
    trailLen: 15,
    trailDecay: 10,
    brightness: 2.0,
  }}
  clickEffect={{
    style: 'ripple',
    brightness: 1.1,
    speed: 2,
  }}
  revealEffect={{
    type: 'random',
    duration: 0.4,
  }}
  className="my-ascii"
/>
```

> **Note 1:** When passing an array to `src`, define it outside the component or in a `useMemo`/`useRef` (an inline array literal creates a new reference on every render and will cause the video to reload).

> **Note 2:** The component fills its parent container. Control size via the parent element or the `className` prop.

## Props

| Prop | Type | Default | Range | Description |
|------|------|---------|-------|-------------|
| `src` | `string \| string[]` | — | — | Video source URL(s). Multiple URLs play sequentially. |
| `videoMode` | `boolean` | `false` | — | Show original video colors instead of ASCII. |
| `numColsRaw` | `number` | `250` | `20–350` | Number of character columns. |
| `brightnessRaw` | `number` | `1.0` | `0.0–2.0` | Brightness multiplier. |
| `saturationRaw` | `number` | `1.0` | `0.0–2.0` | Saturation multiplier. |
| `bgOpacityRaw` | `number` | `0.3` | `0.0–1.0` | Background opacity. |
| `chars` | `string` | *(standard)* | — | Character set, ordered dark to bright. |
| `charMode` | `'shape' \| 'luminance'` | `'shape'` | — | `shape` matches glyph silhouettes; `luminance` uses brightness. |
| `mouseEffect` | `boolean \| MouseEffectOptions` | `true` | — | Mouse hover effects. `true` uses defaults. |
| `clickEffect` | `boolean \| ClickEffectOptions` | `true` | — | Click effects. `true` uses defaults. |
| `revealEffect` | `boolean \| RevealEffectOptions` | `false` | — | Reveal animation on load. `true` uses defaults. |
| `className` | `string` | — | — | CSS class on the outer container. |

---

### `MouseEffectOptions`

Passed to `mouseEffect`. All fields optional.

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `style` | `'brighten' \| 'scatter'` | `'brighten'` | — | `brighten` highlights chars; `scatter` replaces them. |
| `radius` | `number` | `0.08` / `0.05` | `0.03–0.2` | Effect radius as a fraction of the smaller canvas dimension. |
| `duration` | `number` | `1.0` | `0.1–4` | Seconds the effect lingers after the cursor leaves. |
| `trailLen` | `number` | `15` | `0–30` | *(brighten)* Trail positions tracked. |
| `trailDecay` | `number` | `10` | `1–15` | *(brighten)* How fast older trail positions fade. |
| `brightness` | `number` | `2.0` | `0.2–5.0` | *(brighten)* Brightness boost at the cursor. |
| `scatterChars` | `string` | `'->o'` | — | *(scatter)* Chars substituted near the cursor. |

---

### `ClickEffectOptions`

Passed to `clickEffect`. All fields optional.

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `style` | `'ripple' \| 'spread'` | `'ripple'` | — | `ripple` sends a brightness ring outward; `spread` expands a scatter region. |
| `brightness` | `number` | `1.1` | `1.05–2.0` | *(ripple)* Brightness of the ripple ring. |
| `speed` | `number` | `2` | `0.5–4.0` | *(ripple)* Ripple expansion speed. |
| `spreadExpandDuration` | `number` | `1.5` | `0.5–5.0` | *(spread)* Seconds for the region to fully expand. |
| `spreadSpeed` | `number` | `7.5` | `0.5–10.0` | *(spread)* Speed of the spread wave front. |

---

### `RevealEffectOptions`

Passed to `revealEffect`. All fields optional.

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `type` | `'diagonal' \| 'radial' \| 'random'` | `'random'` | — | Pattern in which characters appear on load. |
| `duration` | `number` | `0.4` | `0.1–4` | Reveal animation duration in seconds. |
