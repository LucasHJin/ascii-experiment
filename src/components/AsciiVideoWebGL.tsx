import React, { useRef, useEffect, useMemo } from "react";
import { createProgram, createShader } from "../lib/webgl-utils";
import { computeShapeVectors } from "../lib/ascii-utils";
import vertSrc from '../shaders/vertex.glsl';
import fragSrc from '../shaders/fragment.glsl';
import pass1FragSrc from '../shaders/fragment_pass1.glsl';

// CHANGE CHARS TO FIT BOTH SHAPE AND LUMINANCE
const DEFAULT_CHARS = " `.',-_:!;|\"~+^lr[](\\/L)>t<v=Tz?icf1{sIxY*jJno}CZyVwmSXRqM$O%#9&NW0Q@";

interface MouseEffectOptions {
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

interface ClickEffectOptions {
    brightness?: number;
    speed?: number;
}

interface RevealEffectOptions {
    type?: 'diagonal' | 'radial' | 'random';
    duration?: number;
}

interface Props {
    src: string | string[]; // when calling, can't use inline array directly (or else if state rerenders, it will create a new array)
    videoMode?: boolean;
    numCols?: number;
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
        videoMode = false,
        numCols = 250,
        colored = true,
        brightness = 1.4,
        saturation = 1.8,
        bgOpacity = 0.3,
        revealEffect = false,
        chars = DEFAULT_CHARS,
        mouseEffect = true,
        clickEffect = true,
        charMode = 'shape',
        fit = 'width',
        className,
    }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const atlasTextureRef = useRef<WebGLTexture | null>(null);
    const scatterAtlasTextureRef = useRef<WebGLTexture | null>(null);

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
    numCols = Math.max(60, Math.min(350, Math.round(numCols)));
    brightness = Math.max(0.0, Math.min(2.0, brightness));
    saturation = Math.max(0.0, Math.min(3.0, saturation));
    bgOpacity = Math.max(0.0, Math.min(1.0, bgOpacity));
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

    const sources = useMemo(() => Array.isArray(src) ? src : [src], [src]);
    const isMultiSource = sources.length > 1;

    // refs for props that update dynamically without full GL reinit
    const brightnessRef = useRef(brightness);
    const saturationRef = useRef(saturation);
    const bgOpacityRef = useRef(bgOpacity);
    const coloredRef = useRef(colored);
    const mouseEnabledRef = useRef(mouseEnabled);
    const mouseStyleRef = useRef(mouseStyle);
    const brightenEnabledRef = useRef(brightenEnabled);
    const scatterEnabledRef = useRef(scatterEnabled);
    const mouseBrightnessRef = useRef(mouseBrightness);
    const mouseRadiusRef = useRef(mouseRadius);
    const trailLenRef = useRef(trailLen);
    const trailDecayRef = useRef(trailDecay);
    const durationRef = useRef(duration);
    const scatterCharsRef = useRef(scatterChars);
    const clickEnabledRef = useRef(clickEnabled);
    const clickBrightnessRef = useRef(clickBrightness);
    const clickSpeedRef = useRef(clickSpeed);
    const numColsRef = useRef(numCols);
    const videoModeRef = useRef(videoMode);
    // update refs inside useEffect (not in render) -> avoids unintentional errors
    useEffect(() => {
        brightnessRef.current = brightness;
        saturationRef.current = saturation;
        bgOpacityRef.current = bgOpacity;
        coloredRef.current = colored;
        mouseEnabledRef.current = mouseEnabled;
        mouseStyleRef.current = mouseStyle;
        brightenEnabledRef.current = brightenEnabled;
        scatterEnabledRef.current = scatterEnabled;
        mouseBrightnessRef.current = mouseBrightness;
        mouseRadiusRef.current = mouseRadius;
        trailLenRef.current = trailLen;
        trailDecayRef.current = trailDecay;
        durationRef.current = duration;
        scatterCharsRef.current = scatterChars;
        clickEnabledRef.current = clickEnabled;
        clickBrightnessRef.current = clickBrightness;
        clickSpeedRef.current = clickSpeed;
        numColsRef.current = numCols;
        videoModeRef.current = videoMode;
    }, [
        brightness,
        saturation,
        bgOpacity,
        colored,
        mouseEnabled,
        mouseStyle,
        brightenEnabled,
        scatterEnabled,
        mouseBrightness,
        mouseRadius,
        trailLen,
        trailDecay,
        duration,
        scatterChars,
        clickEnabled,
        clickBrightness,
        clickSpeed,
        numCols,
        videoMode,
    ]);

    const setupGridRef = useRef<((nc: number) => void) | null>(null);
    const loadedRef = useRef(false);

    // numCols change -> refresh atlas/grid textures without full GL reinit
    useEffect(() => {
        if (loadedRef.current) {
            setupGridRef.current?.(numCols);
        }
    }, [numCols]);

    useEffect(() => {
        loadedRef.current = false;

        let shapeData: { char: string, vector: number[] }[] = [];
        let gridCols = 0;
        let gridRows = 0;
        let charW = 1;
        let charH = 1;
        const MAX_RIPPLES = 10;
        const trail: { x: number, y: number, t: number }[] = [];
        const ripples: { x: number, y: number, t: number }[] = [];

        // scatter effect setup (size in setupGrid)
        let cellChar = new Uint8Array(0); // for each cell -> 0 for inactive, else 1-indexed character from scatterChars
        let cellLife = new Float32Array(0); 
        let cellSpeed = new Float32Array(0); // per-cell decay speed multiplier
        let cellTouched = new Uint8Array(0); 
        let cursor: { x: number, y: number, t: number } | null = null; // where cursor is currently
        let cursorPrev: { x: number, y: number, t: number } | null = null;
        let smoothVx = 0;
        let smoothVy = 0;
        let lastFrameMs = -1;
        const pickCharIdx = (): number => Math.floor(Math.random() * scatterCharsRef.current.length); // pick random scatter char

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

        // atlas texture 
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

        // charVectors texture -> one time texture of vectors for each character
        const charVectorsTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, charVectorsTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // pass1 -> compute best vector once per cell (writes char index per cell to frame buffer)
        const pass1FragShader = createShader(gl, gl.FRAGMENT_SHADER, pass1FragSrc);
        if (!pass1FragShader) return;
        const pass1Program = createProgram(gl, vertShader, pass1FragShader);
        if (!pass1Program) return;
        gl.useProgram(pass1Program);
        gl.uniform1i(gl.getUniformLocation(pass1Program, "u_texture"), 0);
        gl.uniform1i(gl.getUniformLocation(pass1Program, "u_charVectors"), 2);
        const p1ResLoc      = gl.getUniformLocation(pass1Program, "u_resolution");
        const p1CellsizeLoc = gl.getUniformLocation(pass1Program, "u_cellsize");
        const p1CircleNLoc  = gl.getUniformLocation(pass1Program, "u_circleN");
        const p1NumCharsLoc = gl.getUniformLocation(pass1Program, "u_numCharsInt");
        const p1ExponentLoc = gl.getUniformLocation(pass1Program, "u_shapeExponent");

        // FBO texture (each byte stores one character index)
        const fboTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, fboTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const fbo = gl.createFramebuffer();

        // scatter atlas texture
        const scatterAtlasTexture = gl.createTexture();
        scatterAtlasTextureRef.current = scatterAtlasTexture;
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, scatterAtlasTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // scatter state texture (based on cellChar) 
        const scatterStateTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, scatterStateTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // pass2 uniform locations
        gl.useProgram(program);
        gl.uniform1i(gl.getUniformLocation(program, "u_fboTexture"), 3);
        gl.uniform1i(gl.getUniformLocation(program, "u_scatterAtlas"), 4);
        gl.uniform1i(gl.getUniformLocation(program, "u_scatterStateTexture"), 5);
        
        // effects
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
        const scatterEffectFlagLoc = gl.getUniformLocation(program, "u_scatterEffect");
        const scatterNumCharsLoc = gl.getUniformLocation(program, "u_scatterNumChars");
        const videoModeLoc = gl.getUniformLocation(program, "u_videoMode");
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

        // sets up new character grid based on column count
        const setupGrid = (nc: number) => {
            const hiddenCanvas = document.createElement('canvas');
            const hiddenCtx = hiddenCanvas.getContext('2d')!;

            charW = Math.max(1, Math.floor(canvas.width / nc)); // num pixels per char (width)
            // probe and scale to find charH
            const probe = charW * 2;
            hiddenCtx.font = `${probe}px monospace`;
            // try a font size of double width, find actually how wide it is, use this as scale factor
            charH = Math.max(1, Math.round(probe * charW / hiddenCtx.measureText('M').width));

            gridCols = Math.floor(canvas.width / charW);
            gridRows = Math.floor(canvas.height / charH);

            // resize for scatter effect
            const cellCount = gridCols * gridRows;
            cellChar = new Uint8Array(cellCount);
            cellLife = new Float32Array(cellCount);
            cellSpeed = new Float32Array(cellCount);
            cellTouched = new Uint8Array(cellCount);
            cursor = null;
            cursorPrev = null;
            smoothVx = 0;
            smoothVy = 0;
            gl.activeTexture(gl.TEXTURE5);
            gl.bindTexture(gl.TEXTURE_2D, scatterStateTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, gridCols, gridRows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, cellChar);

            if (charMode === 'shape') {
                shapeData = computeShapeVectors(chars, charW, charH);

                // need 2 rows -> can only store 4 floats per char
                // row 0: components [v0,v1,v2,v3], row 1: components [v4,v5,_,_]
                const numChars = shapeData.length;
                const charVectorData = new Float32Array(numChars * 8);
                for (let i = 0; i < numChars; i++) {
                    const v = shapeData[i].vector;
                    charVectorData[i * 4 + 0] = v[0];
                    charVectorData[i * 4 + 1] = v[1];
                    charVectorData[i * 4 + 2] = v[2];
                    charVectorData[i * 4 + 3] = v[3];
                    // row 2
                    charVectorData[numChars * 4 + i * 4 + 0] = v[4];
                    charVectorData[numChars * 4 + i * 4 + 1] = v[5];
                }
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, charVectorsTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, numChars, 2, 0, gl.RGBA, gl.FLOAT, charVectorData);

                // size FBO texture to match grid dimensions (or resize)
                gl.activeTexture(gl.TEXTURE3);
                gl.bindTexture(gl.TEXTURE_2D, fboTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, gridCols, gridRows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTexture, 0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);

                // scale sampling density with font size
                const circleN = Math.max(1, Math.round(charW / 5));
                gl.useProgram(pass1Program);
                gl.uniform2f(p1CellsizeLoc, charW, charH);
                gl.uniform1i(p1CircleNLoc, circleN);
                gl.uniform1i(p1NumCharsLoc, numChars);
                gl.uniform1f(p1ExponentLoc, 2.0);
                gl.useProgram(program);
            }

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

            // draw scatter atlas texture
            const sc = scatterCharsRef.current;
            hiddenCanvas.width = sc.length * charW;
            hiddenCanvas.height = charH;
            hiddenCtx.fillStyle = 'black';
            hiddenCtx.fillRect(0, 0, sc.length * charW, charH);
            hiddenCtx.fillStyle = 'white';
            hiddenCtx.textBaseline = 'top';
            hiddenCtx.font = `${charH}px monospace`;
            for (let c = 0; c < sc.length; c++) {
                hiddenCtx.fillText(sc[c], c * charW, 0);
            }
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, scatterAtlasTextureRef.current);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hiddenCanvas);
            gl.uniform1f(scatterNumCharsLoc, sc.length);
        };

        // attach function to ref -> can call outside of useEffect without rerender
        setupGridRef.current = setupGrid;

        const onMouseMove = (e: MouseEvent) => {
            if (!mouseEnabledRef.current) return;
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            const t = performance.now();

            if (brightenEnabledRef.current) {
                trail.push({ x, y, t });
                if (trail.length > trailLenRef.current) {
                    trail.shift();
                }
                return;
            }

            if (scatterEnabledRef.current) {
                cursorPrev = cursor;
                cursor = { x, y, t };
            }
        };
        canvas.addEventListener("mousemove", onMouseMove);

        const onMouseLeave = () => {
            // stop activating new cells (rest erodes)
            cursor = null;
            cursorPrev = null;
            smoothVx = 0;
            smoothVy = 0;
        };
        canvas.addEventListener("mouseleave", onMouseLeave);

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
            gl.uniform1i(videoModeLoc, videoModeRef.current ? 1 : 0);
            gl.uniform1f(brightnessLoc, brightnessRef.current);
            gl.uniform1f(saturationLoc, saturationRef.current);
            gl.uniform1f(bgOpacityLoc, bgOpacityRef.current);
            gl.uniform1i(mouseEffectFlagLoc, brightenEnabledRef.current ? 1 : 0);
            gl.uniform1i(scatterEffectFlagLoc, scatterEnabledRef.current ? 1 : 0);
            gl.uniform1i(clickEffectFlagLoc, clickEnabledRef.current ? 1 : 0);
            gl.uniform1f(mouseBrightnessLoc, mouseBrightnessRef.current);
            gl.uniform1f(mouseRadiusLoc, Math.min(canvas.width, canvas.height) * mouseRadiusRef.current);

            if (revealEnabled) {
                const progress = startTime < 0 ? 0.0 : Math.min(1.0, (performance.now() - startTime) / (revealDuration * 1000));
                gl.uniform1f(revealProgressLoc, progress);
            }

            if (video.currentTime != lastTime && video.readyState >= 2) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
                lastTime = video.currentTime;
            }

            if (brightenEnabledRef.current) {
                const now = performance.now();
                const positions = new Float32Array(trailLenRef.current * 2);
                const lifeFracs = new Float32Array(trailLenRef.current);
                for (let i = 0; i < trail.length; i++) {
                    const age = now - trail[i].t;
                    const linearLife = Math.max(0, 1 - age / (durationRef.current * 1000));
                    const lifeFrac = linearLife ** trailDecayRef.current;
                    positions[i * 2] = trail[i].x;
                    positions[i * 2 + 1] = trail[i].y;
                    lifeFracs[i] = lifeFrac;
                }
                gl.uniform2fv(mousePositionsLoc, positions);
                gl.uniform1fv(mouseLifeFracsLoc, lifeFracs);
            }

            if (scatterEnabledRef.current && gridCols > 0 && gridRows > 0) {
                const now = performance.now();
                const dtSec = lastFrameMs < 0 ? 0 : Math.min(0.1, (now - lastFrameMs) / 1000); // time since last frame
                lastFrameMs = now;
                const radiusPx = Math.min(canvas.width, canvas.height) * mouseRadiusRef.current;

                // movement gate -> if no movement then erode cursor circle 
                let cursorActive = false;
                if (cursor && now - cursor.t < 80) { // cursor moved in last 80ms
                    if (cursorPrev) {
                        const eventDt = (cursor.t - cursorPrev.t) / 1000;
                        // compute smooth velocity
                        if (eventDt > 0 && eventDt < 0.2) {
                            const vx = (cursor.x - cursorPrev.x) / eventDt;
                            const vy = (cursor.y - cursorPrev.y) / eventDt;
                            smoothVx = smoothVx * 0.7 + vx * 0.3;
                            smoothVy = smoothVy * 0.7 + vy * 0.3;
                        }
                    } else {
                        smoothVx = 0;
                        smoothVy = 0;
                    }
                    // needs to move fast enough
                    if (Math.hypot(smoothVx, smoothVy) > charW * 2) {
                        cursorActive = true;
                    }
                } else {
                    smoothVx *= 0.6;
                    smoothVy *= 0.6;
                }

                // activate cells (no erosion for these cells)
                cellTouched.fill(0);
                if (cursorActive && cursor && radiusPx > 0) {
                    const cx = cursor.x;
                    const cy = cursor.y;
                    // bound checking area for performance
                    const minCol = Math.max(0, Math.floor((cx - radiusPx) / charW));
                    const maxCol = Math.min(gridCols - 1, Math.floor((cx + radiusPx) / charW));
                    const minRow = Math.max(0, Math.floor((cy - radiusPx) / charH));
                    const maxRow = Math.min(gridRows - 1, Math.floor((cy + radiusPx) / charH));
                    for (let row = minRow; row <= maxRow; row++) {
                        for (let col = minCol; col <= maxCol; col++) {
                            const cellCx = (col + 0.5) * charW;
                            const cellCy = (row + 0.5) * charH;
                            const dd = Math.hypot(cellCx - cx, cellCy - cy);
                            if (dd > radiusPx) {
                                continue;
                            }

                            const k = row * gridCols + col;
                            cellTouched[k] = 1;
                            // spawn if new
                            if (cellChar[k] === 0) {
                                cellChar[k] = 1 + pickCharIdx();
                                cellSpeed[k] = 0.5 + Math.random() * 2.0;
                            }
                            cellLife[k] = 1.0; // keep at full life
                        }
                    }
                }

                // edge-first erosion
                const lifetimeSec = durationRef.current;
                if (dtSec > 0) {
                    for (let row = 0; row < gridRows; row++) {
                        for (let col = 0; col < gridCols; col++) {
                            const k = row * gridCols + col;
                            // skip inactive/just touched cells
                            if (cellChar[k] === 0 || cellTouched[k]) {
                                continue;
                            }
                            const left  = col > 0 ? cellChar[k - 1] !== 0 : false;
                            const right = col < gridCols-1 ? cellChar[k + 1] !== 0 : false;
                            const up    = row > 0 ? cellChar[k - gridCols] !== 0 : false;
                            const down  = row < gridRows-1 ? cellChar[k + gridCols] !== 0 : false;
                            const isEdge = !left || !right || !up || !down; // if it isn't surrounded on all 4 sides
                            const rate = (isEdge ? 5.0 : 1.0) * cellSpeed[k] / lifetimeSec; // 5 times faster decay rate
                            cellLife[k] -= rate * dtSec;
                            if (cellLife[k] <= 0) {
                                cellChar[k] = 0;
                            }
                        }
                    }
                }

                gl.activeTexture(gl.TEXTURE5);
                gl.bindTexture(gl.TEXTURE_2D, scatterStateTexture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridCols, gridRows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, cellChar);
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

            if (charMode === 'shape') {
                // 2 pass -> switch between the two fragment shaders each frame
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.viewport(0, 0, gridCols, gridRows);
                gl.useProgram(pass1Program);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.useProgram(program);
            }
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            animFrameId = requestAnimationFrame(loop);
        };

        const onLoaded = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(resLoc, canvas.width, canvas.height);
            gl.useProgram(pass1Program);
            gl.uniform2f(p1ResLoc, canvas.width, canvas.height);
            gl.useProgram(program);

            setupGrid(numColsRef.current);

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
        if (video.readyState >= 2) {
            onLoaded(); // call onloaded again if its the reveal effect that changed (no freeze)
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
            canvas.removeEventListener("mouseleave", onMouseLeave);
            canvas.removeEventListener("click", onClick);

            gl.deleteTexture(texture);
            gl.deleteTexture(charVectorsTexture);
            gl.deleteFramebuffer(fbo);
            gl.deleteTexture(fboTexture);
            gl.deleteBuffer(buffer);
            gl.deleteShader(vertShader);
            gl.deleteShader(fragShader);
            gl.deleteShader(pass1FragShader);
            gl.deleteProgram(program);
            gl.deleteProgram(pass1Program);
            gl.deleteTexture(atlasTextureRef.current);
            gl.deleteTexture(scatterAtlasTextureRef.current);
            gl.deleteTexture(scatterStateTexture);
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
