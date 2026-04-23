import { useRef, useEffect } from "react";

const vertSrc = `
attribute vec2 a_position;
attribute vec3 a_color;
varying vec3 v_color;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_color = a_color;
}
`;
const fragSrc = `
precision mediump float;
varying vec3 v_color;

void main() {
    gl_FragColor = vec4(v_color, 1.0);
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

        const gl = canvas.getContext("webgl");
        if (!gl) return;
        const vertShader = createShader(gl, gl.VERTEX_SHADER, vertSrc);
        const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!vertShader || !fragShader) return;

        const program = createProgram(gl, vertShader, fragShader);
        if (!program) return;
        
        const data = new Float32Array([
            1.0, 1.0, 0.0, 0.0, 0.6,
            0.0, 0.0, 1.0, 0.2, 1.0,
            1.0, -1.0, 0.3, 0.5, 0.7,
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(program, "a_position");
        const colLoc = gl.getAttribLocation(program, "a_color"); // a_color -> input per vertex, v_color -> passed from vshader to fshader

        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 20, 0); // both VAP correspond to the same vertex -> 4 bytes per vertex
        gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 20, 8);
        gl.enableVertexAttribArray(posLoc);
        gl.enableVertexAttribArray(colLoc);

        gl.useProgram(program);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }, [])

    return (
        <div>
            <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block', background: 'black' }} />
        </div>
    );
}

export default AsciiVideoWebGL;
