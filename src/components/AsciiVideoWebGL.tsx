import { useRef, useEffect } from "react";

const vertSrc = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;
const fragSrc = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoord;

void main() {
    gl_FragColor = texture2D(u_texture, v_texCoord);
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

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        const image = new Image();
        image.src = "/test.jpg";

        const gl = canvas.getContext("webgl");
        if (!gl) return;
        const vertShader = createShader(gl, gl.VERTEX_SHADER, vertSrc);
        const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!vertShader || !fragShader) return;

        const program = createProgram(gl, vertShader, fragShader);
        if (!program) return;
        
        // x, y, u, v
        const data = new Float32Array([
            1.0,  1.0,  1.0, 0.0,
            -1.0,  1.0,  0.0, 0.0,
            1.0, -1.0,  1.0, 1.0,
            -1.0, -1.0,  0.0, 1.0,
            -1.0,  1.0,  0.0, 0.0,
            1.0, -1.0,  1.0, 1.0,
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(program, "a_position");
        const uvLoc = gl.getAttribLocation(program, "a_texCoord");
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0); 
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
        gl.enableVertexAttribArray(posLoc);
        gl.enableVertexAttribArray(uvLoc);

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

        image.onload = () => {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        };
    }, [])

    return (
        <div>
            <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block', background: 'black' }} />
        </div>
    );
}

export default AsciiVideoWebGL;
