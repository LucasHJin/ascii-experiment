const MAX_RIPPLES = 10;

interface ClickEffectRefs {
    clickEnabledRef: { current: boolean };
    clickSpeedRef: { current: number };
    clickBrightnessRef: { current: number };
}

export function createClickEffect({
    clickEnabledRef,
    clickSpeedRef,
    clickBrightnessRef,
}: ClickEffectRefs) {
    const ripples: { x: number, y: number, t: number }[] = [];

    return {
        handleClick(e: MouseEvent, canvas: HTMLCanvasElement) {
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
        },

        tick(
            gl: WebGL2RenderingContext,
            canvas: HTMLCanvasElement,
            ripplePositionsLoc: WebGLUniformLocation | null,
            rippleRadiiLoc: WebGLUniformLocation | null,
            rippleBrightnessesLoc: WebGLUniformLocation | null,
        ) {
            if (!clickEnabledRef.current) return;
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
        },
    };
}
