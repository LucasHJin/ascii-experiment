export const DEFAULT_CHARS = " `.',-_:!;|\"~+^lr[](\\/L)>t<v=Tz?icf1{sIxY*jJno}CZyVwmSXRqM$O%#9&NW0Q@";

export interface MouseEffectOptions {
    style?: 'brighten' | 'scatter';
    radius?: number;
    duration?: number;
    // brighten only
    trailLen?: number;
    trailDecay?: number;
    brightness?: number;
    // scatter only
    scatterChars?: string;
}

export interface ClickEffectOptions {
    brightness?: number;
    speed?: number;
}

export interface RevealEffectOptions {
    type?: 'diagonal' | 'radial' | 'random';
    duration?: number;
}

export interface Props {
    src: string | string[]; // when calling, can't use inline array directly (or else if state rerenders, it will create a new array)
    videoMode?: boolean;
    numColsRaw?: number;
    colored?: boolean;
    brightnessRaw?: number;
    saturationRaw?: number;
    bgOpacityRaw?: number;
    revealEffect?: boolean | RevealEffectOptions;
    chars?: string;
    mouseEffect?: boolean | MouseEffectOptions;
    clickEffect?: boolean | ClickEffectOptions;
    charMode?: 'shape' | 'luminance';
    fit?: 'width' | 'height';
    className?: string;
}

export interface ParsedProps {
    numCols: number;
    brightness: number;
    saturation: number;
    bgOpacity: number;
    mouseEnabled: boolean;
    mouseStyle: 'brighten' | 'scatter';
    brightenEnabled: boolean;
    scatterEnabled: boolean;
    scatterChars: string;
    trailLen: number;
    trailDecay: number;
    duration: number;
    mouseRadius: number;
    mouseBrightness: number;
    clickEnabled: boolean;
    clickBrightness: number;
    clickSpeed: number;
    revealEnabled: boolean;
    revealType: string;
    revealDuration: number;
    revealEffectFlag: number;
}

export function parseProps(
    numColsRaw: number,
    brightnessRaw: number,
    saturationRaw: number,
    bgOpacityRaw: number,
    mouseEffect: boolean | MouseEffectOptions,
    clickEffect: boolean | ClickEffectOptions,
    revealEffect: boolean | RevealEffectOptions,
): ParsedProps {
    // destructure effects
    const mouseEnabled = !!mouseEffect;
    const mouseOpts = typeof mouseEffect === 'object' ? mouseEffect : {};
    const mouseStyle: 'brighten' | 'scatter' = mouseOpts.style ?? 'brighten';
    const brightenEnabled = mouseEnabled && mouseStyle !== 'scatter';
    const scatterEnabled = mouseEnabled && mouseStyle === 'scatter';
    const scatterChars = mouseOpts.scatterChars ?? '->o';
    let trailLen = mouseOpts.trailLen ?? 15;
    let trailDecay = mouseOpts.trailDecay ?? 10;
    let duration = mouseOpts.duration ?? 1.0;
    let mouseRadius = mouseOpts.radius ?? (mouseStyle === 'scatter' ? 0.05 : 0.08);
    let mouseBrightness = mouseOpts.brightness ?? 2.0;

    const clickEnabled = !!clickEffect;
    const clickOpts = typeof clickEffect === 'object' ? clickEffect : {};
    let clickBrightness = clickOpts.brightness ?? 1.1;
    let clickSpeed = clickOpts.speed ?? 2;

    const revealEnabled = !!revealEffect;
    const revealOpts = typeof revealEffect === 'object' ? revealEffect : {};
    const revealType = revealOpts.type ?? 'random';
    let revealDuration = revealOpts.duration ?? 0.4;

    // prop checks
    const numCols = Math.max(60, Math.min(350, Math.round(numColsRaw)));
    const brightness = Math.max(0.0, Math.min(2.0, brightnessRaw));
    const saturation = Math.max(0.0, Math.min(3.0, saturationRaw));
    const bgOpacity = Math.max(0.0, Math.min(1.0, bgOpacityRaw));
    revealDuration = Math.max(0.1, Math.min(4, revealDuration));
    trailLen = Math.max(0, Math.min(30, Math.round(trailLen)));
    trailDecay = Math.max(1, Math.min(15, trailDecay));
    duration = Math.max(0.1, Math.min(4, duration));
    mouseRadius = Math.max(0.03, Math.min(0.2, mouseRadius));
    mouseBrightness = Math.max(0.2, Math.min(5.0, mouseBrightness));
    clickBrightness = Math.max(1.05, Math.min(2.0, clickBrightness));
    clickSpeed = Math.max(0.5, Math.min(4.0, clickSpeed));

    let revealEffectFlag;
    if (!revealEnabled) {
        revealEffectFlag = 0;
    } else if (revealType === 'diagonal') {
        revealEffectFlag = 1;
    } else if (revealType === 'radial') {
        revealEffectFlag = 2;
    } else {
        revealEffectFlag = 3;
    }

    return {
        numCols, brightness, saturation, bgOpacity,
        mouseEnabled, mouseStyle, brightenEnabled, scatterEnabled,
        scatterChars, trailLen, trailDecay, duration, mouseRadius, mouseBrightness,
        clickEnabled, clickBrightness, clickSpeed,
        revealEnabled, revealType, revealDuration, revealEffectFlag,
    };
}
