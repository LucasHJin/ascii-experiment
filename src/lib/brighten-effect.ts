interface MouseTrailRefs {
    brightenEnabledRef: { current: boolean };
    trailLenRef: { current: number };
    durationRef: { current: number };
    trailDecayRef: { current: number };
}

export function createMouseTrail({
    brightenEnabledRef,
    trailLenRef,
    durationRef,
    trailDecayRef,
}: MouseTrailRefs) {
    const trail: { x: number, y: number, t: number }[] = [];

    return {
        handleMouseMove(x: number, y: number, t: number) {
            if (brightenEnabledRef.current) {
                trail.push({ x, y, t });
                if (trail.length > trailLenRef.current) {
                    trail.shift();
                }
            }
        },

        tick(gl: WebGL2RenderingContext, mousePositionsLoc: WebGLUniformLocation | null, mouseLifeFracsLoc: WebGLUniformLocation | null) {
            if (!brightenEnabledRef.current) return;
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
        },
    };
}
