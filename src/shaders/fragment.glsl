precision highp float;

// flags
uniform int u_initialEffectFlag;
uniform bool u_coloredFlag;

// effects
uniform float u_revealProgress;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_bgIntensity;

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

    if (u_initialEffectFlag == 1) {
        // reveal effect -> show what should be revealed, make rest black
        float revealThreshold = (cellCoord.x + cellCoord.y) / (u_gridSize.x + u_gridSize.y - 2.0);
        if (revealThreshold > u_revealProgress) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    } else if (u_initialEffectFlag == 2) {
        float dist = length(cellCoord / u_gridSize - vec2(0.5));
        float revealThreshold = dist / 0.7071; // sqrt of 0.5
        if (revealThreshold > u_revealProgress) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    }

    vec2 cellCenter = (cellCoord + 0.5) * u_cellsize; // figure out center pixel of cell
    vec2 uv = cellCenter / u_resolution; // normalize to 0-1

    vec3 cellColor = texture2D(u_texture, uv).rgb;
    float luminosity = dot(cellColor, vec3(0.299, 0.587, 0.114)); // luminance of pixel
    if (u_coloredFlag) {
        cellColor = clamp(mix(vec3(luminosity), cellColor, u_saturation), 0.0, 1.0); // increase saturation (clamped)
    } else {
        cellColor = vec3(luminosity);
    }
    cellColor = pow(cellColor, vec3(2.0 - u_brightness)); // boost brightness

    vec2 gridUV = (cellCoord + 0.5) / u_gridSize;
    float charInd = floor(texture2D(u_charGrid, gridUV).r * 255.0 + 0.5); // find charInd from char grid texture instead of luminance (convert back from Uint8Array storing as 0 to 1)
    vec2 withinCellPos = fract(fragCoord / u_cellsize); // need this to determine how a single pixel of atlas maps over (within a character)
    float atlasU = (charInd + withinCellPos.x) / u_numChars;
    float atlasV = withinCellPos.y;
    float glyphMask = texture2D(u_atlas, vec2(atlasU, atlasV)).r; // only need r to tell if there is white or black

    vec3 finalColor;
    vec3 bgColor = cellColor * u_bgIntensity;
    finalColor = mix(bgColor, cellColor, glyphMask);

    gl_FragColor = vec4(finalColor, 1.0);
}
