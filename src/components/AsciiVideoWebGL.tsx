import React, { useRef, useEffect, useMemo } from "react";
import { createProgram, createShader } from "../lib/webgl-utils";
import { computeShapeVectors, SIMPLE_CIRCLES } from "../lib/ascii-utils";
import vertSrc from '../shaders/vertex.glsl';
import fragSrc from '../shaders/fragment.glsl';

const DEFAULT_CHARS = " .'`^\",:;~-_+=*!?/\\|()[]{}<>iIl1tTfLjJrRsSzZcCvVnNmMwWxXyY0OoQq9&%#@$";

interface MouseEffectOptions {
    trailLen?: number;
    trailDecay?: number;
    trailDuration?: number;
    radius?: number;
    brightness?: number;
}

interface ClickEffectOptions {
    brightness?: number;
    speed?: number;
}

interface RevealEffectOptions {
    type?: 'diagonal' | 'radial';
    duration?: number;
}

interface Props {
    src: string | string[]; // when calling, can't use inline array directly (or else if state rerenders, it will create a new array)
    fontSize?: number;
    colored?: boolean;
    brightness?: number;
    saturation?: number;
    bgOpacity?: number;
    revealEffect?: boolean | RevealEffectOptions;
    chars?: string;
    mouseEffect?: boolean | MouseEffectOptions;
    clickEffect?: boolean | ClickEffectOptions;
    charMode?: 'shape' | 'luminance';
    fit?: 'width' | 'height';
    className?: string;
}

function AsciiVideoWebGL({
        src,
        fontSize = 12,
        colored = true,
        brightness = 1.4,
        saturation = 1.8,
        bgOpacity = 0.3,
        revealEffect = false,
        chars = DEFAULT_CHARS,
        mouseEffect = true,
        clickEffect = true,
        charMode = 'luminance',
        fit = 'width',
        className,
    }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const atlasTextureRef = useRef<WebGLTexture | null>(null);

    // destructure mouse and click effect (simpler top level api)
    const mouseEnabled = !!mouseEffect;
    const mouseOpts = typeof mouseEffect === 'object' ? mouseEffect : {};
    let trailLen = mouseOpts.trailLen ?? 15;
    let trailDecay = mouseOpts.trailDecay ?? 10;
    let trailDuration = mouseOpts.trailDuration ?? 2;
    let mouseRadius = mouseOpts.radius ?? 0.08;
    let mouseBrightness = mouseOpts.brightness ?? 2.0;

    const clickEnabled = !!clickEffect;
    const clickOpts = typeof clickEffect === 'object' ? clickEffect : {};
    let clickBrightness = clickOpts.brightness ?? 1.1;
    let clickSpeed = clickOpts.speed ?? 2;

    const revealEnabled = !!revealEffect;
    const revealOpts = typeof revealEffect === 'object' ? revealEffect : {};
    const revealType = revealOpts.type ?? 'diagonal';
    let revealDuration = revealOpts.duration ?? 0.4;

    // prop checks
    fontSize = Math.max(7, Math.min(50, fontSize));
    brightness = Math.max(0.0, Math.min(2.0, brightness));
    saturation = Math.max(0.0, Math.min(3.0, saturation));
    bgOpacity = Math.max(0.0, Math.min(1.0, bgOpacity));
    revealDuration = Math.max(0.1, Math.min(4, revealDuration));
    trailLen = Math.max(0, Math.min(30, Math.round(trailLen)));
    trailDecay = Math.max(1, Math.min(15, trailDecay));
    trailDuration = Math.max(0.1, Math.min(4, trailDuration));
    mouseRadius = Math.max(0.03, Math.min(0.2, mouseRadius));
    mouseBrightness = Math.max(0.2, Math.min(5.0, mouseBrightness));
    clickBrightness = Math.max(1.05, Math.min(2.0, clickBrightness));
    clickSpeed = Math.max(0.5, Math.min(4.0, clickSpeed));

    const revealEffectFlag = !revealEnabled ? 0 : revealType === 'radial' ? 2 : 1;

    const sources = useMemo(() => Array.isArray(src) ? src : [src], [src]);
    const isMultiSource = sources.length > 1;

    // refs for props that update dynamically without full GL reinit
    const brightnessRef = useRef(brightness);
    const saturationRef = useRef(saturation);
    const bgOpacityRef = useRef(bgOpacity);
    const coloredRef = useRef(colored);
    const mouseEnabledRef = useRef(mouseEnabled);
    const mouseBrightnessRef = useRef(mouseBrightness);
    const mouseRadiusRef = useRef(mouseRadius);
    const trailLenRef = useRef(trailLen);
    const trailDecayRef = useRef(trailDecay);
    const trailDurationRef = useRef(trailDuration);
    const clickEnabledRef = useRef(clickEnabled);
    const clickBrightnessRef = useRef(clickBrightness);
    const clickSpeedRef = useRef(clickSpeed);
    const fontSizeRef = useRef(fontSize);
    // update refs inside useEffect (not in render) -> avoids unintentional errors
    useEffect(() => {
        brightnessRef.current = brightness;
        brightnessRef.current = brightness;
        saturationRef.current = saturation;
        bgOpacityRef.current = bgOpacity;
        coloredRef.current = colored;
        mouseEnabledRef.current = mouseEnabled;
        mouseBrightnessRef.current = mouseBrightness;
        mouseRadiusRef.current = mouseRadius;
        trailLenRef.current = trailLen;
        trailDecayRef.current = trailDecay;
        trailDurationRef.current = trailDuration;
        clickEnabledRef.current = clickEnabled;
        clickBrightnessRef.current = clickBrightness;
        clickSpeedRef.current = clickSpeed;
        fontSizeRef.current = fontSize;
    }, [
        brightness,
        saturation,
        bgOpacity,
        colored,
        mouseEnabled,
        mouseBrightness,
        mouseRadius,
        trailLen,
        trailDecay,
        trailDuration,
        clickEnabled,
        clickBrightness,
        clickSpeed,
        fontSize,
    ]);

    // font size refs
    const setupGridRef = useRef<((fs: number) => void) | null>(null);
    const loadedRef = useRef(false);

    // fontSize change -> refresh atlas/grid textures without full GL reinit
    useEffect(() => {
        if (loadedRef.current) {
            setupGridRef.current?.(fontSize);
        }
    }, [fontSize]);

    useEffect(() => {
        loadedRef.current = false;

        let sampleCtx: CanvasRenderingContext2D | null = null;
        let charGridData: Uint8Array | null = null;
        let charGridTexture: WebGLTexture | null = null;
        let shapeData: { char: string, vector: number[] }[] = [];
        let gridCols = 0;
        let gridRows = 0;
        const cache = new Map<number, number>(); // cache vectors for faster lookups
        const SAMPLE_HEIGHT = 3;
        const SAMPLE_WIDTH = 2;
        const MAX_RIPPLES = 10;
        const trail: { x: number, y: number, t: number }[] = [];
        const ripples: { x: number, y: number, t: number }[] = [];

        const canvas = canvasRef.current;
        if (!canvas) return;

        const video = videoRef.current;
        if (!video) return;

        const gl = canvas.getContext("webgl2");
        if (!gl) return;

        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

        const vertShader = createShader(gl, gl.VERTEX_SHADER, vertSrc);
        const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!vertShader || !fragShader) return;

        const program = createProgram(gl, vertShader, fragShader);
        if (!program) return;

        const data = new Float32Array([
            1.0, 1.0,
            -1.0, 1.0,
            1.0, -1.0,
            -1.0, -1.0,
            -1.0, 1.0,
            1.0, -1.0,
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(program, "a_position");
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(posLoc);

        gl.useProgram(program);

        // video texture
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const texLoc = gl.getUniformLocation(program, "u_texture");
        gl.uniform1i(texLoc, 0);

        // atlas texture (data uploaded in setupGrid)
        const atlasTexture = gl.createTexture();
        atlasTextureRef.current = atlasTexture;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const atlasLoc = gl.getUniformLocation(program, "u_atlas");
        gl.uniform1i(atlasLoc, 1);

        // charGrid texture (data allocated in setupGrid)
        charGridTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, charGridTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const charGridLoc = gl.getUniformLocation(program, "u_charGrid");
        gl.uniform1i(charGridLoc, 2);

        // uniform locations
        const revealEffectFlagLoc = gl.getUniformLocation(program, "u_revealEffectFlag");
        const coloredFlagLoc = gl.getUniformLocation(program, "u_coloredFlag");
        const mouseEffectFlagLoc = gl.getUniformLocation(program, "u_mouseEffect");
        const clickEffectFlagLoc = gl.getUniformLocation(program, "u_clickEffect");
        const shapeMatchingLoc = gl.getUniformLocation(program, "u_shapeMatching");
        const revealProgressLoc = gl.getUniformLocation(program, "u_revealProgress");
        const brightnessLoc = gl.getUniformLocation(program, "u_brightness");
        const saturationLoc = gl.getUniformLocation(program, "u_saturation");
        const bgOpacityLoc = gl.getUniformLocation(program, "u_bgOpacity");
        const mouseBrightnessLoc = gl.getUniformLocation(program, "u_mouseBrightness");
        const mousePositionsLoc = gl.getUniformLocation(program, "u_mousePositions");
        const mouseLifeFracsLoc = gl.getUniformLocation(program, "u_mouseLifeFracs");
        const mouseRadiusLoc = gl.getUniformLocation(program, "u_mouseRadius");
        const ripplePositionsLoc = gl.getUniformLocation(program, "u_ripplePositions");
        const rippleRadiiLoc = gl.getUniformLocation(program, "u_rippleRadii");
        const rippleBrightnessesLoc = gl.getUniformLocation(program, "u_rippleBrightnesses");
        const resLoc = gl.getUniformLocation(program, "u_resolution");
        const sizeLoc = gl.getUniformLocation(program, "u_cellsize");
        const numLoc = gl.getUniformLocation(program, "u_numChars");
        const gridSizeLoc = gl.getUniformLocation(program, "u_gridSize");

        gl.uniform1i(shapeMatchingLoc, charMode === 'shape' ? 1 : 0);
        gl.uniform1i(revealEffectFlagLoc, revealEffectFlag);
        gl.uniform1f(revealProgressLoc, 0.0);

        let animFrameId: number;
        let lastTime = -1;
        let startTime = -1;
        let currentVidIndex = 0;

        // sets up new character grid based on font size
        const setupGrid = (fs: number) => {
            const hiddenCanvas = document.createElement('canvas');
            const hiddenCtx = hiddenCanvas.getContext('2d')!;

            hiddenCtx.font = `${fs}px monospace`;
            const charW = Math.ceil(hiddenCtx.measureText('M').width);
            const charH = fs;

            if (charMode === 'shape') {
                shapeData = computeShapeVectors(chars, charW, charH);
            }
            gridCols = Math.floor(canvas.width / charW);
            gridRows = Math.floor(canvas.height / charH);

            if (charMode === 'shape') {
                charGridData = new Uint8Array(gridCols * gridRows);
                const sampleCanvas = document.createElement('canvas');
                sampleCanvas.width = gridCols * SAMPLE_WIDTH;
                sampleCanvas.height = gridRows * SAMPLE_HEIGHT;
                sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
            }

            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, charGridTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, gridCols, gridRows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
            gl.uniform2f(gridSizeLoc, gridCols, gridRows);

            hiddenCanvas.width = chars.length * charW;
            hiddenCanvas.height = charH;
            hiddenCtx.font = `${charH}px monospace`;
            hiddenCtx.fillStyle = 'black';
            hiddenCtx.fillRect(0, 0, chars.length * charW, charH);
            hiddenCtx.fillStyle = 'white';
            hiddenCtx.textBaseline = 'top';
            for (let c = 0; c < chars.length; c++) {
                hiddenCtx.fillText(chars[c], c * charW, 0);
            }
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, atlasTextureRef.current);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hiddenCanvas);
            gl.uniform1f(numLoc, chars.length);
            gl.uniform2f(sizeLoc, charW, charH);

            cache.clear();
        };

        // attach function to ref -> can call outside of useEffect without rerender
        setupGridRef.current = setupGrid;

        const onMouseMove = (e: MouseEvent) => {
            if (!mouseEnabledRef.current) return;
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            trail.push({ x, y, t: performance.now() });
            if (trail.length > trailLenRef.current) {
                trail.shift();
            }
        };
        canvas.addEventListener("mousemove", onMouseMove);

        const onClick = (e: MouseEvent) => {
            if (!clickEnabledRef.current) {
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            ripples.push({ x, y, t: performance.now() });
            if (ripples.length > MAX_RIPPLES) {
                ripples.shift();
            }
        };
        canvas.addEventListener("click", onClick);

        const loop = () => {
            // update dynamic uniforms per frame
            gl.uniform1i(coloredFlagLoc, coloredRef.current ? 1 : 0);
            gl.uniform1f(brightnessLoc, brightnessRef.current);
            gl.uniform1f(saturationLoc, saturationRef.current);
            gl.uniform1f(bgOpacityLoc, bgOpacityRef.current);
            gl.uniform1i(mouseEffectFlagLoc, mouseEnabledRef.current ? 1 : 0);
            gl.uniform1i(clickEffectFlagLoc, clickEnabledRef.current ? 1 : 0);
            gl.uniform1f(mouseBrightnessLoc, mouseBrightnessRef.current);
            gl.uniform1f(mouseRadiusLoc, Math.min(canvas.width, canvas.height) * mouseRadiusRef.current);

            if (revealEnabled) {
                const progress = startTime < 0 ? 0.0 : Math.min(1.0, (performance.now() - startTime) / (revealDuration * 1000));
                gl.uniform1f(revealProgressLoc, progress);
            }

            if (video.currentTime != lastTime && video.readyState >= 2) {
                if (sampleCtx && charGridData) {
                    sampleCtx.drawImage(video, 0, 0, sampleCtx.canvas.width, sampleCtx.canvas.height);
                    const imageData = sampleCtx.getImageData(0, 0, sampleCtx.canvas.width, sampleCtx.canvas.height);
                    const sw = sampleCtx.canvas.width;

                    for (let row = 0; row < gridRows; row++) {
                        for (let col = 0; col < gridCols; col++) {
                            const samplingVector: number[] = [];
                            const cellX = col * SAMPLE_WIDTH;
                            const cellY = row * SAMPLE_HEIGHT;

                            for (const [dx, dy] of SIMPLE_CIRCLES) {
                                const i = ((cellY + dy) * sw + (cellX + dx)) * 4;
                                const r = imageData.data[i] / 255;
                                const g = imageData.data[i + 1] / 255;
                                const b = imageData.data[i + 2] / 255;
                                samplingVector.push(0.299 * r + 0.587 * g + 0.114 * b);
                            }

                            let maxVal = 0;
                            for (let d = 0; d < 6; d++) {
                                if (samplingVector[d] > maxVal) {
                                    maxVal = samplingVector[d];
                                }
                            }
                            if (maxVal > 0) {
                                const EXPONENT = 2;
                                for (let d = 0; d < 6; d++) {
                                    const norm = samplingVector[d] / maxVal;
                                    samplingVector[d] = Math.pow(norm, EXPONENT) * maxVal;
                                }
                            }

                            const RANGE = 6;
                            let key = 0;
                            for (let d = 0; d < RANGE; d++) {
                                const q = Math.min(RANGE - 1, Math.floor(samplingVector[d] * RANGE));
                                key = key * RANGE + q;
                            }

                            let charIndex: number;
                            if (cache.has(key)) {
                                charIndex = cache.get(key)!;
                            } else {
                                let bestIndex = 0;
                                let bestDist = Infinity;
                                for (let i = 0; i < shapeData.length; i++) {
                                    let dist = 0;
                                    for (let d = 0; d < 6; d++) {
                                        const diff = samplingVector[d] - shapeData[i].vector[d];
                                        dist += diff * diff;
                                    }
                                    if (dist < bestDist) {
                                        bestDist = dist;
                                        bestIndex = i;
                                    }
                                }
                                charIndex = bestIndex;
                                cache.set(key, charIndex);
                            }

                            const gridIndex = row * gridCols + col;
                            charGridData[gridIndex] = charIndex;
                        }
                    }

                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, charGridTexture!);
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridCols, gridRows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, charGridData);
                }

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
                lastTime = video.currentTime;
            }

            if (mouseEnabledRef.current) {
                const now = performance.now();
                const positions = new Float32Array(trailLenRef.current * 2);
                const lifeFracs = new Float32Array(trailLenRef.current);
                for (let i = 0; i < trail.length; i++) {
                    const age = now - trail[i].t;
                    const linearLife = Math.max(0, 1 - age / (trailDurationRef.current * 1000));
                    const lifeFrac = linearLife ** trailDecayRef.current;
                    positions[i * 2] = trail[i].x;
                    positions[i * 2 + 1] = trail[i].y;
                    lifeFracs[i] = lifeFrac;
                }
                gl.uniform2fv(mousePositionsLoc, positions);
                gl.uniform1fv(mouseLifeFracsLoc, lifeFracs);
            }

            if (clickEnabledRef.current) {
                const now = performance.now();
                const maxDist = Math.hypot(canvas.width, canvas.height);
                const ripplePositions = new Float32Array(MAX_RIPPLES * 2);
                const rippleRadii = new Float32Array(MAX_RIPPLES);
                const rippleBrightnesses = new Float32Array(MAX_RIPPLES);
                while (ripples.length > 0 && (now - ripples[0].t) * clickSpeedRef.current >= maxDist) {
                    ripples.shift();
                }
                for (let i = 0; i < ripples.length; i++) {
                    const radius = (now - ripples[i].t) * clickSpeedRef.current;
                    const t = radius / maxDist;
                    const brightness = 1.0 + (clickBrightnessRef.current - 1.0) * (1 - t ** 2);
                    ripplePositions[i * 2] = ripples[i].x;
                    ripplePositions[i * 2 + 1] = ripples[i].y;
                    rippleRadii[i] = radius;
                    rippleBrightnesses[i] = brightness;
                }
                gl.uniform2fv(ripplePositionsLoc, ripplePositions);
                gl.uniform1fv(rippleRadiiLoc, rippleRadii);
                gl.uniform1fv(rippleBrightnessesLoc, rippleBrightnesses);
            }

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            animFrameId = requestAnimationFrame(loop);
        };

        const onLoaded = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(resLoc, canvas.width, canvas.height);

            setupGrid(fontSizeRef.current);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

            video.play();
            startTime = performance.now();
            loadedRef.current = true;
            animFrameId = requestAnimationFrame(loop);
        };

        const onEnded = () => {
            currentVidIndex = (currentVidIndex + 1) % sources.length;
            video.src = sources[currentVidIndex];
            video.load();
            video.addEventListener('canplay', () => video.play(), { once: true });
        };

        video.addEventListener("loadeddata", onLoaded, { once: true });
        if (isMultiSource) {
            video.addEventListener("ended", onEnded);
        }

        return () => {
            setupGridRef.current = null;
            loadedRef.current = false;
            cancelAnimationFrame(animFrameId);
            video.removeEventListener("loadeddata", onLoaded);
            if (isMultiSource) {
                video.removeEventListener("ended", onEnded);
            }
            canvas.removeEventListener("mousemove", onMouseMove);
            canvas.removeEventListener("click", onClick);

            gl.deleteTexture(texture);
            gl.deleteTexture(charGridTexture);
            gl.deleteBuffer(buffer);
            gl.deleteShader(vertShader);
            gl.deleteShader(fragShader);
            gl.deleteProgram(program);
            gl.deleteTexture(atlasTextureRef.current);
        };
    }, [sources, isMultiSource, charMode, chars, revealEffectFlag, revealDuration, revealEnabled]);

    const canvasStyle: React.CSSProperties = fit === 'height'
        ? { height: '100%', width: 'auto', display: 'block' }
        : { width: '100%', height: 'auto', display: 'block' };

    return (
        <div className={className} style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
            <video ref={videoRef} muted playsInline autoPlay loop={!isMultiSource} style={{ display: "none" }}>
                <source src={sources[0]} type="video/mp4" />
            </video>
            <canvas ref={canvasRef} style={canvasStyle} />
        </div>
    );
}

export default AsciiVideoWebGL;
