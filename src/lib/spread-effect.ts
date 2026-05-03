interface SpreadRefs {
    spreadEnabledRef: { current: boolean };
    scatterCharsRef: { current: string };
    spreadExpandDurationRef: { current: number };
    spreadSpeedRef: { current: number };
}

export function createSpreadEffect({
    spreadEnabledRef,
    scatterCharsRef,
    spreadExpandDurationRef,
    spreadSpeedRef,
}: SpreadRefs) {
    let cellChar = new Uint8Array(0);
    let cellPhase = new Uint8Array(0); // 0 = inactive, 1 = expanding, 2 = eroding

    let gridCols = 0;
    let gridRows = 0;
    let charW = 1;
    let charH = 1;
    let _spreadStateTexture: WebGLTexture | null = null;
    let lastFrameMs = -1;
    let expandUntil = -1;

    const pickCharIdx = () => Math.floor(Math.random() * scatterCharsRef.current.length);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

    return {
        // called when grid resizes -> allocate arrays for cellChar and cellPhase (which to show, what state)
        setup(gl: WebGL2RenderingContext, cols: number, rows: number, cw: number, ch: number, spreadStateTexture: WebGLTexture) {
            gridCols = cols;
            gridRows = rows;
            charW = cw;
            charH = ch;
            _spreadStateTexture = spreadStateTexture;

            const cellCount = cols * rows;
            cellChar = new Uint8Array(cellCount);
            cellPhase = new Uint8Array(cellCount);
            expandUntil = -1;
            lastFrameMs = -1;

            gl.activeTexture(gl.TEXTURE6);
            gl.bindTexture(gl.TEXTURE_2D, spreadStateTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, cols, rows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, cellChar);
        },

        handleClick(e: MouseEvent, canvas: HTMLCanvasElement) {
            if (!spreadEnabledRef.current || gridCols === 0) {
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            const col = Math.floor(x / charW);
            const row = Math.floor(y / charH);
            if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) {
                return;
            }
            const k = row * gridCols + col;
            cellChar[k] = 1 + pickCharIdx(); // set char
            cellPhase[k] = 1; // set phase to expanding
            expandUntil = performance.now() + spreadExpandDurationRef.current * 1000; // expand for duration
        },

        tick(gl: WebGL2RenderingContext) {
            if (!spreadEnabledRef.current || gridCols === 0 || gridRows === 0) {
                return;
            }
            const now = performance.now();
            const dtSec = lastFrameMs < 0 ? 0 : Math.min(0.1, (now - lastFrameMs) / 1000);
            lastFrameMs = now;

            const expanding = expandUntil > 0 && now < expandUntil;

            // change to eroding
            if (!expanding && expandUntil > 0) {
                for (let i = 0; i < cellChar.length; i++) {
                    if (cellPhase[i] === 1) {
                        cellPhase[i] = 2;
                    }
                }
                expandUntil = -1;
            }

            if (dtSec > 0) {
                for (let row = 0; row < gridRows; row++) {
                    for (let col = 0; col < gridCols; col++) {
                        const k = row * gridCols + col;
                        if (cellPhase[k] === 0) {
                            continue;
                        }

                        if (expanding && cellPhase[k] === 1) {
                            // activate inactive neighbors
                            for (const [dr, dc] of dirs) {
                                const nr = row + dr, nc = col + dc;
                                if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) {
                                    continue;
                                }
                                const nk = nr * gridCols + nc;
                                if (cellPhase[nk] !== 0) {
                                    continue;
                                }
                                if (Math.random() < spreadSpeedRef.current * dtSec) { // probability of being activated
                                    cellChar[nk] = 1 + pickCharIdx();
                                    cellPhase[nk] = 1;
                                }
                            }
                        } else if (cellPhase[k] === 2) {
                            // erode self if on edge
                            for (const [dr, dc] of dirs) {
                                const nr = row + dr, nc = col + dc;
                                const isOutside = nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols;
                                if (isOutside || cellChar[nr * gridCols + nc] === 0) {
                                    if (Math.random() < spreadSpeedRef.current * dtSec) { // probability of being deactivated
                                        cellChar[k] = 0;
                                        cellPhase[k] = 0;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            gl.activeTexture(gl.TEXTURE6);
            gl.bindTexture(gl.TEXTURE_2D, _spreadStateTexture!);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridCols, gridRows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, cellChar);
        },
    };
}
