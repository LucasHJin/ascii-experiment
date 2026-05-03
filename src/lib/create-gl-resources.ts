import { createProgram, createShader } from './webgl-utils';
import vertSrc from '../shaders/vertex.glsl';
import fragSrc from '../shaders/fragment.glsl';
import pass1FragSrc from '../shaders/fragment_pass1.glsl';

export interface GLResources {
    program: WebGLProgram;
    pass1Program: WebGLProgram;
    buffer: WebGLBuffer;
    vertShader: WebGLShader;
    fragShader: WebGLShader;
    pass1FragShader: WebGLShader;
    // textures
    texture: WebGLTexture;
    atlasTexture: WebGLTexture;
    charVectorsTexture: WebGLTexture;
    fboTexture: WebGLTexture;
    fbo: WebGLFramebuffer;
    scatterAtlasTexture: WebGLTexture;
    scatterStateTexture: WebGLTexture;
    spreadStateTexture: WebGLTexture;
    // pass1 uniform locations
    p1ResLoc: WebGLUniformLocation | null;
    p1CellsizeLoc: WebGLUniformLocation | null;
    p1CircleNLoc: WebGLUniformLocation | null;
    p1NumCharsLoc: WebGLUniformLocation | null;
    p1ExponentLoc: WebGLUniformLocation | null;
    // pass2 uniform locations
    revealEffectFlagLoc: WebGLUniformLocation | null;
    mouseEffectFlagLoc: WebGLUniformLocation | null;
    clickEffectFlagLoc: WebGLUniformLocation | null;
    shapeMatchingLoc: WebGLUniformLocation | null;
    revealProgressLoc: WebGLUniformLocation | null;
    brightnessLoc: WebGLUniformLocation | null;
    saturationLoc: WebGLUniformLocation | null;
    bgOpacityLoc: WebGLUniformLocation | null;
    mouseBrightnessLoc: WebGLUniformLocation | null;
    mousePositionsLoc: WebGLUniformLocation | null;
    mouseLifeFracsLoc: WebGLUniformLocation | null;
    mouseRadiusLoc: WebGLUniformLocation | null;
    ripplePositionsLoc: WebGLUniformLocation | null;
    rippleRadiiLoc: WebGLUniformLocation | null;
    rippleBrightnessesLoc: WebGLUniformLocation | null;
    scatterEffectFlagLoc: WebGLUniformLocation | null;
    scatterNumCharsLoc: WebGLUniformLocation | null;
    spreadEffectFlagLoc: WebGLUniformLocation | null;
    videoModeLoc: WebGLUniformLocation | null;
    resLoc: WebGLUniformLocation | null;
    sizeLoc: WebGLUniformLocation | null;
    numLoc: WebGLUniformLocation | null;
    gridSizeLoc: WebGLUniformLocation | null;
}

export function createGLResources(gl: WebGL2RenderingContext): GLResources | null {
    const vertShader = createShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vertShader || !fragShader) return null;

    const program = createProgram(gl, vertShader, fragShader);
    if (!program) return null;

    const data = new Float32Array([
        1.0, 1.0,
        -1.0, 1.0,
        1.0, -1.0,
        -1.0, -1.0,
        -1.0, 1.0,
        1.0, -1.0,
    ]);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posLoc);

    gl.useProgram(program);

    // video texture
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const texLoc = gl.getUniformLocation(program, "u_texture");
    gl.uniform1i(texLoc, 0);

    // atlas texture
    const atlasTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const atlasLoc = gl.getUniformLocation(program, "u_atlas");
    gl.uniform1i(atlasLoc, 1);

    // charVectors texture -> one time texture of vectors for each character
    const charVectorsTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, charVectorsTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // pass1 -> compute best vector once per cell (writes char index per cell to frame buffer)
    const pass1FragShader = createShader(gl, gl.FRAGMENT_SHADER, pass1FragSrc);
    if (!pass1FragShader) return null;
    const pass1Program = createProgram(gl, vertShader, pass1FragShader);
    if (!pass1Program) return null;
    gl.useProgram(pass1Program);
    gl.uniform1i(gl.getUniformLocation(pass1Program, "u_texture"), 0);
    gl.uniform1i(gl.getUniformLocation(pass1Program, "u_charVectors"), 2);
    const p1ResLoc      = gl.getUniformLocation(pass1Program, "u_resolution");
    const p1CellsizeLoc = gl.getUniformLocation(pass1Program, "u_cellsize");
    const p1CircleNLoc  = gl.getUniformLocation(pass1Program, "u_circleN");
    const p1NumCharsLoc = gl.getUniformLocation(pass1Program, "u_numCharsInt");
    const p1ExponentLoc = gl.getUniformLocation(pass1Program, "u_shapeExponent");

    // FBO texture (each byte stores one character index)
    const fboTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, fboTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer()!;

    // scatter atlas texture
    const scatterAtlasTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, scatterAtlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // scatter state texture (based on cellChar)
    const scatterStateTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, scatterStateTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // spread state texture
    const spreadStateTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, spreadStateTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // pass2 uniform locations
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "u_fboTexture"), 3);
    gl.uniform1i(gl.getUniformLocation(program, "u_scatterAtlas"), 4);
    gl.uniform1i(gl.getUniformLocation(program, "u_scatterStateTexture"), 5);
    gl.uniform1i(gl.getUniformLocation(program, "u_spreadStateTexture"), 6);

    // effects
    const revealEffectFlagLoc = gl.getUniformLocation(program, "u_revealEffectFlag");
    const mouseEffectFlagLoc = gl.getUniformLocation(program, "u_mouseEffect");
    const clickEffectFlagLoc = gl.getUniformLocation(program, "u_clickEffect");
    const shapeMatchingLoc = gl.getUniformLocation(program, "u_shapeMatching");
    const revealProgressLoc = gl.getUniformLocation(program, "u_revealProgress");
    const brightnessLoc = gl.getUniformLocation(program, "u_brightness");
    const saturationLoc = gl.getUniformLocation(program, "u_saturation");
    const bgOpacityLoc = gl.getUniformLocation(program, "u_bgOpacity");
    const mouseBrightnessLoc = gl.getUniformLocation(program, "u_mouseBrightness");
    const mousePositionsLoc = gl.getUniformLocation(program, "u_mousePositions");
    const mouseLifeFracsLoc = gl.getUniformLocation(program, "u_mouseLifeFracs");
    const mouseRadiusLoc = gl.getUniformLocation(program, "u_mouseRadius");
    const ripplePositionsLoc = gl.getUniformLocation(program, "u_ripplePositions");
    const rippleRadiiLoc = gl.getUniformLocation(program, "u_rippleRadii");
    const rippleBrightnessesLoc = gl.getUniformLocation(program, "u_rippleBrightnesses");
    const scatterEffectFlagLoc = gl.getUniformLocation(program, "u_scatterEffect");
    const scatterNumCharsLoc = gl.getUniformLocation(program, "u_scatterNumChars");
    const spreadEffectFlagLoc = gl.getUniformLocation(program, "u_spreadEffect");
    const videoModeLoc = gl.getUniformLocation(program, "u_videoMode");
    const resLoc = gl.getUniformLocation(program, "u_resolution");
    const sizeLoc = gl.getUniformLocation(program, "u_cellsize");
    const numLoc = gl.getUniformLocation(program, "u_numChars");
    const gridSizeLoc = gl.getUniformLocation(program, "u_gridSize");

    return {
        program, pass1Program,
        buffer,
        vertShader, fragShader, pass1FragShader,
        texture, atlasTexture, charVectorsTexture, fboTexture, fbo,
        scatterAtlasTexture, scatterStateTexture, spreadStateTexture,
        p1ResLoc, p1CellsizeLoc, p1CircleNLoc, p1NumCharsLoc, p1ExponentLoc,
        revealEffectFlagLoc, mouseEffectFlagLoc, clickEffectFlagLoc,
        shapeMatchingLoc, revealProgressLoc, brightnessLoc, saturationLoc, bgOpacityLoc,
        mouseBrightnessLoc, mousePositionsLoc, mouseLifeFracsLoc, mouseRadiusLoc,
        ripplePositionsLoc, rippleRadiiLoc, rippleBrightnessesLoc,
        scatterEffectFlagLoc, scatterNumCharsLoc, spreadEffectFlagLoc, videoModeLoc,
        resLoc, sizeLoc, numLoc, gridSizeLoc,
    };
}
