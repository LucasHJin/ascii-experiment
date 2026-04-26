import { useRef, useEffect } from "react";

const vertSrc = `
attribute vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const fragSrc = `
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_atlas;
uniform vec2 u_resolution;
uniform vec2 u_cellsize;
uniform float u_numChars;
uniform sampler2D u_charGrid;
uniform vec2 u_gridSize;

void main() {
    vec2 fragCoord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y); // flip y coords
    vec2 cellCoord = floor(fragCoord / u_cellsize);
    vec2 cellCenter = (cellCoord + 0.5) * u_cellsize; // figure out center pixel of cell
    vec2 uv = cellCenter / u_resolution; // normalize to 0-1

    vec3 cellColor = texture2D(u_texture, uv).rgb;
    float luminosity = dot(cellColor, vec3(0.299, 0.587, 0.114)); // luminance of pixel
    cellColor = clamp(mix(vec3(luminosity), cellColor, 1.8), 0.0, 1.0); // increase saturation (clamped)
    cellColor = pow(cellColor, vec3(0.6)); // boost brightness 

    vec2 gridUV = (cellCoord + 0.5) / u_gridSize;
    float charInd = floor(texture2D(u_charGrid, gridUV).r * 255.0 + 0.5); // find charInd from char grid texture instead of luminance (convert back from Uint8Array storing as 0 to 1)
    vec2 withinCellPos = fract(fragCoord / u_cellsize); // need this to determine how a single pixel of atlas maps over (within a character)
    float atlasU = (charInd + withinCellPos.x) / u_numChars;
    float atlasV = withinCellPos.y;
    float glyphMask = texture2D(u_atlas, vec2(atlasU, atlasV)).r; // only need r to tell if there is white or black

    float bgAlpha = 0.3;
    vec3 bgColor = cellColor * bgAlpha;
    vec3 fgColor = cellColor;
    vec3 finalColor = mix(bgColor, fgColor, glyphMask);

    // vignette effect (based on distance to center)
    vec2 pixel_uv = (fragCoord / u_resolution) - 0.5;
    float vignette = clamp(1.0 - pow(dot(pixel_uv, pixel_uv) * 2.5, 2.0), 0.0, 1.0);
    vignette = clamp(vignette, 0.0, 1.0);

    gl_FragColor = vec4(finalColor * vignette, 1.0);
}
`;

const CIRCLES = [
    [0.25, 0.25], [0.75, 0.25],
    [0.25, 0.50], [0.75, 0.50],
    [0.25, 0.75], [0.75, 0.75],
];

const SIMPLE_CIRCLES = [
    [0, 0], [1, 0],
    [0, 1], [1, 1],
    [0, 2], [1, 2],
]

function createShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) {
        throw new Error("Failed to create shader");
    }
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) return shader;

    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
}

function createProgram(gl: WebGLRenderingContext, vert: WebGLShader, frag: WebGLShader): WebGLProgram | null {
    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) return program;
    
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
}

// computeShapeVectors takes in chars and outputs a 6D vector per char representing its 'shape'
function computeShapeVectors(chars: string, charW: number, charH: number): { char: string, vector: number[] }[] {
    const shapeData = [];
    const charCanvas = document.createElement("canvas");
    charCanvas.width = charW;
    charCanvas.height = charH;
    const charCtx = charCanvas.getContext("2d");
    if (!charCtx) return [];
    charCtx.font = `${charH}px monospace`;
    charCtx.textBaseline = 'top';

    const rad = charW / 5;

    for (const char of chars) {
        charCtx.fillStyle = 'black';
        charCtx.fillRect(0, 0, charW, charH);
        charCtx.fillStyle = 'white';
        charCtx.fillText(char, 0, 0);

        const imageData = charCtx.getImageData(0, 0, charW, charH);
        const vector = [];

        for (const [cxFrac, cyFrac] of CIRCLES) {
            const cx = cxFrac * charW; // convert fraction to pixel coords
            const cy = cyFrac * charH;

            let totalBrightness = 0;
            let numPixels = 0;
            for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x += 1) {
                for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y += 1) {
                    const dx = cx - x;
                    const dy = cy - y;
                    if (dx * dx + dy * dy <= rad * rad) {
                        const i = (y * charW + x) * 4;
                        const brightness = imageData.data[i]; // only need red channel
                        totalBrightness += brightness / 255; // normalize for individual circle
                        numPixels++;
                    }
                }
            }

            const coverage = numPixels > 0 ? totalBrightness / numPixels : 0;
            vector.push(coverage);
        }
        shapeData.push({char, vector});
    }

    // normalize all data relative to each other
    const maxPerDim = Array(6).fill(0);
    for (const { vector } of shapeData) {
        for (let i = 0; i < 6; ++i) {
            if (vector[i] > maxPerDim[i]) {
                maxPerDim[i] = vector[i];
            }
        }
    }
    for (const { vector } of shapeData) {
        for (let i = 0; i < 6; ++i) {
            vector[i] /= maxPerDim[i];
        }
    }

    return shapeData;
}

function AsciiVideoWebGL() {
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

        const canvas = canvasRef.current
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

        const loop = () => {
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
            const CHARS = ' .\'`,-_":;^=+*!?/\\|()[]{}tfilcjrzxvuneoaswhkqdpbgmyXY0123456789JCZULMWOQDBHNEFK#@';
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
    }, [])

    return (
        <div
            style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
        >
            <video ref={videoRef} muted playsInline autoPlay loop style={{ display: "none" }}>
                <source src="/test2.mp4" type="video/mp4" />
            </video>
            <canvas ref={canvasRef} style={{ width: '100vw', height: 'auto', display: 'block'}} />
        </div>
    );
}

export default AsciiVideoWebGL;
