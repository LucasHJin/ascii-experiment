import { useRef, useEffect } from "react";

const vertSrc = `
attribute vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const fragSrc = `
precision mediump float;

void main() {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
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

        const program = createProgram(gl, vertShader, fragShader);
        if (!program) return;
        
        const positions = new Float32Array([
            1.0, 1.0,
            0.0, 0.0,
            1.0, -1.0,
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const loc = gl.getAttribLocation(program, "a_position");
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc);

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
