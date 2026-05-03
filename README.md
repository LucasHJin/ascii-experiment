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

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string \| string[]` | — | Video source URL(s). Multiple URLs play sequentially. |
| `videoMode` | `boolean` | `false` | Renders the original video colors instead of ASCII. |
| `numColsRaw` | `number` | `250` | Number of character columns. Clamped to `20–350`. |
| `brightnessRaw` | `number` | `1.0` | Overall brightness multiplier. Clamped to `0.0–2.0`. |
| `saturationRaw` | `number` | `1.0` | Color saturation multiplier. Clamped to `0.0–2.0`. |
| `bgOpacityRaw` | `number` | `0.3` | Background (black cell) opacity. Clamped to `0.0–1.0`. |
| `chars` | `string` | *(built-in set)* | Characters used for rendering, ordered dark to bright. |
| `charMode` | `'shape' \| 'luminance'` | `'shape'` | How characters are matched to pixels. `shape` uses glyph silhouettes; `luminance` uses brightness. |
| `mouseEffect` | `boolean \| MouseEffectOptions` | `true` | Enables a mouse hover effect. `true` uses defaults. |
| `clickEffect` | `boolean \| ClickEffectOptions` | `true` | Enables a click effect. `true` uses defaults. |
| `revealEffect` | `boolean \| RevealEffectOptions` | `false` | Plays a reveal animation on load. `true` uses defaults. |
| `className` | `string` | — | CSS class applied to the outer container div. |

---

### `MouseEffectOptions`

Passed to `mouseEffect`. All fields optional.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `style` | `'brighten' \| 'scatter'` | `'brighten'` | Effect style. `brighten` highlights characters under the cursor; `scatter` replaces them with custom chars. |
| `radius` | `number` | `0.08` / `0.05` | Effect radius as a fraction of the smaller canvas dimension. Clamped to `0.03–0.2`. Default is `0.05` for scatter, `0.08` for brighten. |
| `duration` | `number` | `1.0` | How long (in seconds) the effect lingers after the cursor moves away. Clamped to `0.1–4`. |
| `trailLen` | `number` | `15` | *(brighten only)* Number of trail positions tracked. Clamped to `0–30`. |
| `trailDecay` | `number` | `10` | *(brighten only)* How quickly older trail positions fade. Clamped to `1–15`. |
| `brightness` | `number` | `2.0` | *(brighten only)* Brightness boost at the cursor. Clamped to `0.2–5.0`. |
| `scatterChars` | `string` | `'->o'` | *(scatter only)* Characters randomly substituted near the cursor. |

---

### `ClickEffectOptions`

Passed to `clickEffect`. All fields optional.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `style` | `'ripple' \| 'spread'` | `'ripple'` | Effect style. `ripple` sends a brightness ring outward; `spread` expands a region of scatter chars from the click point. |
| `brightness` | `number` | `1.1` | *(ripple only)* Brightness of the ripple ring. Clamped to `1.05–2.0`. |
| `speed` | `number` | `2` | *(ripple only)* Speed of the ripple expansion. Clamped to `0.5–4.0`. |
| `spreadExpandDuration` | `number` | `1.5` | *(spread only)* Seconds the spread region takes to fully expand. Clamped to `0.5–5.0`. |
| `spreadSpeed` | `number` | `7.5` | *(spread only)* Speed of the spread wave front. Clamped to `0.5–10.0`. |

---

### `RevealEffectOptions`

Passed to `revealEffect`. All fields optional.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `'diagonal' \| 'radial' \| 'random'` | `'random'` | Pattern in which characters appear on load. |
| `duration` | `number` | `0.4` | Duration of the reveal animation in seconds. Clamped to `0.1–4`. |
