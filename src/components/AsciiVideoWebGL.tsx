import { useRef, useEffect } from "react";

const vertSrc = `
attribute vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const fragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform sampler2D u_atlas;
uniform vec2 u_resolution;
uniform vec2 u_cellsize;
uniform float u_numChars;

void main() {
    vec2 fragCoord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y); // flip y coords
    vec2 cellCoord = floor(fragCoord / u_cellsize);
    vec2 cellCenter = (cellCoord + 0.5) * u_cellsize; // figure out center pixel of cell
    vec2 uv = cellCenter / u_resolution; // normalize to 0-1

    vec3 cellColor = texture2D(u_texture, uv).rgb;
    float luminosity = dot(cellColor, vec3(0.299, 0.587, 0.114)); // luminance of pixel
    cellColor = clamp(mix(vec3(luminosity), cellColor, 1.8), 0.0, 1.0); // increase saturation (clamped)
    cellColor = pow(cellColor, vec3(0.6)); // boost brightness 

    float charInd = floor(luminosity * (u_numChars - 1.0));
    vec2 withinCellPos = fract(fragCoord / u_cellsize); // need this to determine how a single pixel of atlas maps over (within a character)
    float atlasU = (charInd + withinCellPos.x) / u_numChars;
    float atlasV = withinCellPos.y;
    float glyphMask = texture2D(u_atlas, vec2(atlasU, atlasV)).r; // only need r to tell if there is white or black

    float bgAlpha = 0.3;
    vec3 bgColor = cellColor * bgAlpha;
    vec3 fgColor = cellColor;
    vec3 finalColor = mix(bgColor, fgColor, glyphMask);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

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

function AsciiVideoWebGL() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        const video = videoRef.current;
        if (!video) return;

        const gl = canvas.getContext("webgl");
        if (!gl) return;
        gl.viewport(0, 0, canvas.width, canvas.height);

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

        const resLoc = gl.getUniformLocation(program, "u_resolution");
        gl.uniform2f(resLoc, canvas.width, canvas.height);

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
            if (video.currentTime != lastTime) {
                lastTime = video.currentTime;
                gl.activeTexture(gl.TEXTURE0);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
            }
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            animFrameId = requestAnimationFrame(loop);
        }

        const onLoaded = () => {
            // write character ramp onto a hidden canvas (and then turn it into a texture to sample from)
            const CHARS = ' .\'`,-_":;^=+*!?/\\|()[]{}tfilcjrzxvuneoaswhkqdpbgmyXY0123456789JCZULMWOQDBHNEFK#@';
            const hiddenCanvas = hiddenCanvasRef.current;
            if (!hiddenCanvas) return;
            const hiddenCtx = hiddenCanvas.getContext("2d");
            if (!hiddenCtx) return;

            const dpr = window.devicePixelRatio || 1; // dpr -> how many real pixels used for 1 css pixel
            const fontSize = 15;
            hiddenCtx.font = `${fontSize}px monospace`;
            const charW = Math.ceil(hiddenCtx.measureText('M').width);
            const charH = fontSize;

            hiddenCanvas.width = CHARS.length * charW * dpr; // need to set width and height
            hiddenCanvas.height = charH * dpr;
            hiddenCtx.scale(dpr, dpr); // normalize coordinate system to still use css pixels

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
        }
    }, [])

    return (
        <div>
            <canvas ref={hiddenCanvasRef} style={{ display: "none" }} />
            <video ref={videoRef} muted playsInline autoPlay loop style={{ display: "none" }}>
                <source src="/test.mp4" type="video/mp4" />
            </video>
            <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block'}} />
        </div>
    );
}

export default AsciiVideoWebGL;
