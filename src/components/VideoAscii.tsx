import React, { useRef, useEffect } from "react";
import { computeShapeVectors } from "../lib/ascii-utils";
import { DEFAULT_CHARS, parseProps } from "../lib/ascii-props";
import type { Props } from "../lib/ascii-props";
import { createGLResources } from "../lib/create-gl-resources";
import { createScatterEffect } from "../lib/scatter-effect";
import { createMouseTrail } from "../lib/brighten-effect";
import { createClickEffect } from "../lib/click-effect";

function VideoAscii({
        src,
        videoMode = false,
        numColsRaw = 250,
        brightnessRaw = 1.0,
        saturationRaw = 1.0,
        bgOpacityRaw = 0.3,
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

    const { numCols, brightness, saturation, bgOpacity,
            mouseEnabled, mouseStyle, brightenEnabled, scatterEnabled,
            scatterChars, trailLen, trailDecay, duration, mouseRadius, mouseBrightness,
            clickEnabled, clickBrightness, clickSpeed,
            revealEnabled, revealDuration, revealEffectFlag,
    } = parseProps(numColsRaw, brightnessRaw, saturationRaw, bgOpacityRaw, mouseEffect, clickEffect, revealEffect);

    // refs for props that update dynamically without full GL reinit
    const brightnessRef = useRef(brightness);
    const saturationRef = useRef(saturation);
    const bgOpacityRef = useRef(bgOpacity);
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
        mouseEnabledRef.current = mouseEnabled;
        mouseStyleRef.current = mouseStyle;
        brightenEnabledRef.current = brightenEnabled;
        scatterEnabledRef.current = scatterEnabled;
        mouseBrightnessRef.current = mouseBrightness;
        mouseRadiusRef.current = mouseRadius;
        trailLenRef.current = trailLen;
        trailDecayRef.current = trailDecay;
        durationRef.current = duration;
        // rebuild immediately after ref -> no effect ordering ambiguity
        if (scatterCharsRef.current !== scatterChars && loadedRef.current) {
            scatterCharsRef.current = scatterChars;
            rebuildScatterAtlasRef.current?.();
        } else {
            scatterCharsRef.current = scatterChars;
        }
        clickEnabledRef.current = clickEnabled;
        clickBrightnessRef.current = clickBrightness;
        clickSpeedRef.current = clickSpeed;
        numColsRef.current = numCols;
        videoModeRef.current = videoMode;
    }, [
        brightness,
        saturation,
        bgOpacity,
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
    const rebuildScatterAtlasRef = useRef<(() => void) | null>(null);
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

        const canvas = canvasRef.current;
        if (!canvas) return;

        const video = videoRef.current;
        if (!video) return;

        const gl = canvas.getContext("webgl2");
        if (!gl) return;

        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

        // all gl textures, uniform locations, etc. in resources
        const resources = createGLResources(gl);
        if (!resources) return;

        const { program, pass1Program } = resources;
        atlasTextureRef.current = resources.atlasTexture;
        scatterAtlasTextureRef.current = resources.scatterAtlasTexture;

        gl.uniform1i(resources.shapeMatchingLoc, charMode === 'shape' ? 1 : 0);
        gl.uniform1i(resources.revealEffectFlagLoc, revealEffectFlag);
        gl.uniform1f(resources.revealProgressLoc, 0.0);

        // create effect handlers
        const scatterEffects = createScatterEffect({ scatterEnabledRef, mouseRadiusRef, durationRef, scatterCharsRef });
        const trailEffects = createMouseTrail({ brightenEnabledRef, trailLenRef, durationRef, trailDecayRef });
        const clickEffects = createClickEffect({ clickEnabledRef, clickSpeedRef, clickBrightnessRef });

        let animFrameId: number;
        let lastTime = -1;
        let startTime = -1;
        let currentVidIndex = 0;

        const sources = Array.isArray(src) ? src : [src];
        const isMultiSource = sources.length > 1;

        // extract hiddenCtx (use it for all reusable writing)
        const hiddenCanvas = document.createElement('canvas');
        const hiddenCtx = hiddenCanvas.getContext('2d')!;

        // sets up new character grid based on column count
        const setupGrid = (nc: number) => {
            charW = Math.max(1, Math.floor(canvas.width / nc)); // num pixels per char (width)
            // probe and scale to find charH
            const probe = charW * 2;
            hiddenCtx.font = `${probe}px monospace`;
            // try a font size of double width, find actually how wide it is, use this as scale factor
            charH = Math.max(1, Math.round(probe * charW / hiddenCtx.measureText('M').width));

            gridCols = Math.floor(canvas.width / charW);
            gridRows = Math.floor(canvas.height / charH);

            // resize for scatter effect
            scatterEffects.setup(gl, gridCols, gridRows, charW, charH, resources.scatterStateTexture);

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
                gl.bindTexture(gl.TEXTURE_2D, resources.charVectorsTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, numChars, 2, 0, gl.RGBA, gl.FLOAT, charVectorData);

                // size FBO texture to match grid dimensions (or resize)
                gl.activeTexture(gl.TEXTURE3);
                gl.bindTexture(gl.TEXTURE_2D, resources.fboTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, gridCols, gridRows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, resources.fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.fboTexture, 0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);

                // scale sampling density with font size
                const circleN = Math.max(1, Math.round(charW / 5));
                gl.useProgram(pass1Program);
                gl.uniform2f(resources.p1CellsizeLoc, charW, charH);
                gl.uniform1i(resources.p1CircleNLoc, circleN);
                gl.uniform1i(resources.p1NumCharsLoc, numChars);
                gl.uniform1f(resources.p1ExponentLoc, 2.0);
                gl.useProgram(program);
            }

            gl.uniform2f(resources.gridSizeLoc, gridCols, gridRows);

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
            gl.uniform1f(resources.numLoc, chars.length);
            gl.uniform2f(resources.sizeLoc, charW, charH);

            rebuildScatterAtlas();
        };

        // explicit rebuild of scatter atlas texture
        const rebuildScatterAtlas = () => {
            const sc = scatterCharsRef.current;
            hiddenCanvas.width = sc.length * charW;
            hiddenCanvas.height = charH;
            hiddenCtx.fillStyle = 'black';
            hiddenCtx.fillRect(0, 0, hiddenCanvas.width, charH);
            hiddenCtx.fillStyle = 'white';
            hiddenCtx.textBaseline = 'top';
            hiddenCtx.font = `${charH}px monospace`;
            for (let c = 0; c < sc.length; c++) {
                hiddenCtx.fillText(sc[c], c * charW, 0);
            }
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, scatterAtlasTextureRef.current);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hiddenCanvas);
            gl.uniform1f(resources.scatterNumCharsLoc, sc.length);
            scatterEffects.reset(gl);
        };

        // attach functions to refs -> can call outside of useEffect without rerender
        setupGridRef.current = setupGrid;
        rebuildScatterAtlasRef.current = rebuildScatterAtlas;

        const onMouseMove = (e: MouseEvent) => {
            if (!mouseEnabledRef.current) return;
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            const t = performance.now();
            trailEffects.handleMouseMove(x, y, t);
            scatterEffects.handleMouseMove(x, y, t);
        };
        canvas.addEventListener("mousemove", onMouseMove);

        const onMouseLeave = () => scatterEffects.handleMouseLeave();
        canvas.addEventListener("mouseleave", onMouseLeave);

        const onClick = (e: MouseEvent) => clickEffects.handleClick(e, canvas);
        canvas.addEventListener("click", onClick);

        const loop = () => {
            // update dynamic uniforms per frame
            gl.uniform1i(resources.videoModeLoc, videoModeRef.current ? 1 : 0);
            gl.uniform1f(resources.brightnessLoc, brightnessRef.current);
            gl.uniform1f(resources.saturationLoc, saturationRef.current);
            gl.uniform1f(resources.bgOpacityLoc, bgOpacityRef.current);
            gl.uniform1i(resources.mouseEffectFlagLoc, brightenEnabledRef.current ? 1 : 0);
            gl.uniform1i(resources.scatterEffectFlagLoc, scatterEnabledRef.current ? 1 : 0);
            gl.uniform1i(resources.clickEffectFlagLoc, clickEnabledRef.current ? 1 : 0);
            gl.uniform1f(resources.mouseBrightnessLoc, mouseBrightnessRef.current);
            gl.uniform1f(resources.mouseRadiusLoc, Math.min(canvas.width, canvas.height) * mouseRadiusRef.current);

            if (revealEnabled) {
                const progress = startTime < 0 ? 0.0 : Math.min(1.0, (performance.now() - startTime) / (revealDuration * 1000));
                gl.uniform1f(resources.revealProgressLoc, progress);
            }

            if (video.currentTime != lastTime && video.readyState >= 2) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, resources.texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
                lastTime = video.currentTime;
            }

            trailEffects.tick(gl, resources.mousePositionsLoc, resources.mouseLifeFracsLoc);
            scatterEffects.tick(gl, canvas);
            clickEffects.tick(gl, canvas, resources.ripplePositionsLoc, resources.rippleRadiiLoc, resources.rippleBrightnessesLoc);

            if (charMode === 'shape') {
                // 2 pass -> switch between the two fragment shaders each frame
                gl.bindFramebuffer(gl.FRAMEBUFFER, resources.fbo);
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
            gl.uniform2f(resources.resLoc, canvas.width, canvas.height);
            gl.useProgram(pass1Program);
            gl.uniform2f(resources.p1ResLoc, canvas.width, canvas.height);
            gl.useProgram(program);

            setupGrid(numColsRef.current);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, resources.texture);
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
            rebuildScatterAtlasRef.current = null;
            loadedRef.current = false;
            cancelAnimationFrame(animFrameId);
            video.removeEventListener("loadeddata", onLoaded);
            if (isMultiSource) {
                video.removeEventListener("ended", onEnded);
            }
            canvas.removeEventListener("mousemove", onMouseMove);
            canvas.removeEventListener("mouseleave", onMouseLeave);
            canvas.removeEventListener("click", onClick);

            gl.deleteTexture(resources.texture);
            gl.deleteTexture(resources.charVectorsTexture);
            gl.deleteFramebuffer(resources.fbo);
            gl.deleteTexture(resources.fboTexture);
            gl.deleteBuffer(resources.buffer);
            gl.deleteShader(resources.vertShader);
            gl.deleteShader(resources.fragShader);
            gl.deleteShader(resources.pass1FragShader);
            gl.deleteProgram(program);
            gl.deleteProgram(pass1Program);
            gl.deleteTexture(atlasTextureRef.current);
            gl.deleteTexture(scatterAtlasTextureRef.current);
            gl.deleteTexture(resources.scatterStateTexture);
        };
    }, [src, charMode, chars, revealEffectFlag, revealDuration, revealEnabled]);

    const canvasStyle: React.CSSProperties = fit === 'height'
        ? { height: '100%', width: 'auto', display: 'block' }
        : { width: '100%', height: 'auto', display: 'block' };

    return (
        <div className={className} style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
            <video ref={videoRef} muted playsInline autoPlay loop={!Array.isArray(src) || src.length === 1} style={{ display: "none" }}>
                <source src={Array.isArray(src) ? src[0] : src} type="video/mp4" />
            </video>
            <canvas ref={canvasRef} style={canvasStyle} />
        </div>
    );
}

export default VideoAscii;
