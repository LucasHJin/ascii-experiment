import { useRef, useEffect } from "react";
import { createProgram, createShader } from "../lib/webgl-utils";
import { computeShapeVectors, SIMPLE_CIRCLES } from "../lib/ascii-utils";
import vertSrc from '../shaders/vertex.glsl';
import fragSrc from '../shaders/fragment.glsl';

interface Props {
    coloredBg?: boolean;
    initialEffect?: 0 | 1 | 2;
}

function AsciiVideoWebGL({ coloredBg = true, initialEffect = 0 }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const atlasTextureRef = useRef<WebGLTexture | null>(null);

    useEffect(() => {
        let sampleCtx: CanvasRenderingContext2D | null = null;
        let charGridData: Uint8Array | null = null;
        let charGridTexture: WebGLTexture | null = null;
        let shapeData: { char: string, vector: number[] }[] = [];
        let gridCols = 0;
        let gridRows = 0;
        const cache = new Map<number, number>(); // cache vectors for faster lookups
        const SAMPLE_HEIGHT = 3;
        const SAMPLE_WIDTH = 2;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const video = videoRef.current;
        if (!video) return;

        const gl = canvas.getContext("webgl");
        if (!gl) return;

        const vertShader = createShader(gl, gl.VERTEX_SHADER, vertSrc);
        const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!vertShader || !fragShader) return;

        const program = createProgram(gl, vertShader, fragShader);
        if (!program) return;
        
        // x, y, u, v
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

        // create empty slot in gpu
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // set the parameters to render any size image
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const texLoc = gl.getUniformLocation(program, "u_texture");
        gl.uniform1i(texLoc, 0); // bind u_texture to slot 0

        let animFrameId: number;
        let lastTime = -1;
        let startTime = -1;

        // set flags
        const coloredBgFlagLoc = gl.getUniformLocation(program, "u_coloredBgFlag");
        gl.uniform1i(coloredBgFlagLoc, coloredBg ? 1 : 0);
        const initialEffectFlagLoc = gl.getUniformLocation(program, "u_initialEffectFlag");
        gl.uniform1i(initialEffectFlagLoc, initialEffect);

        // set effects
        const revealProgressLoc = gl.getUniformLocation(program, "u_revealProgress");
        gl.uniform1f(revealProgressLoc, 0.0);

        const loop = () => {
            if (initialEffect !== 0) {
                // use elapsed time to find reveal progress
                const progress = startTime < 0 ? 0.0 : Math.min(1.0, (performance.now() - startTime) / 400.0);
                gl.uniform1f(revealProgressLoc, progress);
            }

            if (video.currentTime != lastTime && sampleCtx && charGridData) {
                // draw frame onto scaled down sample canvas
                sampleCtx.drawImage(video, 0, 0, sampleCtx.canvas.width, sampleCtx.canvas.height);
                const imageData = sampleCtx.getImageData(0, 0, sampleCtx.canvas.width, sampleCtx.canvas.height);
                const sw = sampleCtx.canvas.width;
                
                for (let row = 0; row < gridRows; row++) {
                    for (let col = 0; col < gridCols; col++) {
                        // build 6D sampling vector for every cell
                        const samplingVector: number[] = [];
                        
                        // simpler sampling -> each pixel of a 3x2 cell
                        const cellX = col * SAMPLE_WIDTH;
                        const cellY = row * SAMPLE_HEIGHT;

                        for (const [dx, dy] of SIMPLE_CIRCLES) {
                            const i = ((cellY + dy) * sw + (cellX + dx)) * 4;
                            const r = imageData.data[i] / 255;
                            const g = imageData.data[i + 1] / 255;
                            const b = imageData.data[i + 2] / 255;
                            samplingVector.push(0.299 * r + 0.587 * g + 0.114 * b);
                        }

                        // contrast enhancement -> normalize, apply exponent, denormalize (preserve lighter values)
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

                        // create cache key
                        const RANGE = 6;
                        let key = 0;
                        for (let d = 0; d < RANGE; d++) {
                            const q = Math.min(RANGE - 1, Math.floor(samplingVector[d] * RANGE)); // snap into a bucket (0 to 5)
                            key = key * RANGE + q; // create a base 6 digit as key
                        }

                        // lookup -> either O(1) cache or brute force euclidean distance search (and then add to cache)
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

                        // write to char grid
                        const gridIndex = (row * gridCols + col) * 4;
                        charGridData[gridIndex] = charIndex;
                    }
                }

                // upload char grid to GPU
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, charGridTexture!);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridCols, gridRows, gl.RGBA, gl.UNSIGNED_BYTE, charGridData!);

                // upload video frame to GPU
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);

                lastTime = video.currentTime;
            }
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            animFrameId = requestAnimationFrame(loop);
        }

        const onLoaded = () => {
            // set canvas dimensions based on video (no stretching/compression)
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);

            // set resolution with video ratio as well
            const resLoc = gl.getUniformLocation(program, "u_resolution");
            gl.uniform2f(resLoc, canvas.width, canvas.height);

            // write character ramp onto a hidden canvas (and then turn it into a texture to sample from)
            const CHARS = " .'`^\",:;~-_+=*!?/\\|()[]{}<>iIl1tTfLjJrRsSzZcCvVnNmMwWxXyY0OoQq9&%#@$";
            const hiddenCanvas = document.createElement('canvas');
            const hiddenCtx = hiddenCanvas.getContext('2d')!;

            const fontSize = 15;
            hiddenCtx.font = `${fontSize}px monospace`;
            const charW = Math.ceil(hiddenCtx.measureText('M').width);
            const charH = fontSize;

            // make char grid texture (one char index per cell) -> read red channel to find index
            shapeData = computeShapeVectors(CHARS, charW, charH);
            gridCols = Math.floor(canvas.width / charW);
            gridRows = Math.floor(canvas.height / charH);
            // charGridData -> tells you character index that wins at each cell (each cell has one character) 
            charGridData = new Uint8Array(gridCols * gridRows * 4);
            charGridTexture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, charGridTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridCols, gridRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, charGridData);
            const charGridLoc = gl.getUniformLocation(program, "u_charGrid");
            gl.uniform1i(charGridLoc, 2);
            const gridSizeLoc = gl.getUniformLocation(program, "u_gridSize");
            gl.uniform2f(gridSizeLoc, gridCols, gridRows);

            // sampleCanvas is scaled down version of frame -> sample circle to find corresponding vector
            const sampleCanvas = document.createElement('canvas');
            sampleCanvas.width = gridCols * SAMPLE_WIDTH;
            sampleCanvas.height = gridRows * SAMPLE_HEIGHT;
            sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true }); // keep canvas in cpu memory (faster read)

            hiddenCanvas.width = CHARS.length * charW; // need to set width and height
            hiddenCanvas.height = charH;

            // set cell size after dynamic measurement
            const sizeLoc = gl.getUniformLocation(program, "u_cellsize");
            gl.uniform2f(sizeLoc, charW, charH);

            hiddenCtx.font = `${charH}px monospace`;
            hiddenCtx.fillStyle = 'black';
            hiddenCtx.fillRect(0, 0, CHARS.length * charW, charH);
            hiddenCtx.fillStyle = 'white';
            hiddenCtx.textBaseline = 'top';

            for (let c = 0; c < CHARS.length; c += 1) {
                hiddenCtx.fillText(CHARS[c], c * charW, 0);
            }

            const atlasTexture = gl.createTexture();
            atlasTextureRef.current = atlasTexture;
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hiddenCanvas);
            const atlasLoc = gl.getUniformLocation(program, "u_atlas");
            gl.uniform1i(atlasLoc, 1);
            const numLoc = gl.getUniformLocation(program, "u_numChars")
            gl.uniform1f(numLoc, CHARS.length);

            // need to allocate memory for video once
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); 

            video.play();
            startTime = performance.now();
            animFrameId = requestAnimationFrame(loop);
        };

        video.addEventListener("loadeddata", onLoaded);

        return () => {
            cancelAnimationFrame(animFrameId);
            video.removeEventListener("loadeddata", onLoaded);

            // gl cleanup (nice to have -> video should loop forever)
            gl.deleteTexture(texture);
            gl.deleteBuffer(buffer);
            gl.deleteShader(vertShader);
            gl.deleteShader(fragShader);
            gl.deleteProgram(program);
            gl.deleteTexture(atlasTextureRef.current);
        }
    }, [coloredBg])

    return (
        <div style={{ width: '100%', height: 'auto', overflow: 'hidden' }}>
            <video ref={videoRef} muted playsInline autoPlay loop style={{ display: "none" }}>
                <source src="/test.mp4" type="video/mp4" />
            </video>
            <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
        </div>
    );
}

export default AsciiVideoWebGL;
