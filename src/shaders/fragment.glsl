#version 300 es

precision highp float;
precision highp usampler2D;

// flags
uniform int u_initialEffectFlag;
uniform bool u_coloredFlag;

// effects
uniform float u_revealProgress;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_bgIntensity;

uniform bool u_mouseEffect;
#define MOUSE_TRAIL_LEN 15
uniform vec2 u_mousePositions[MOUSE_TRAIL_LEN];
uniform float u_mouseLifeFracs[MOUSE_TRAIL_LEN]; // radius of trail + determines if expired (0)
uniform float u_mouseRadius;

uniform sampler2D u_texture;
uniform sampler2D u_atlas;
uniform vec2 u_resolution;
uniform vec2 u_cellsize;
uniform float u_numChars;
uniform usampler2D u_charGrid;
uniform vec2 u_gridSize;

out vec4 fragColor;

void main() {
    vec2 fragCoord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y); // flip y coords
    vec2 cellCoord = floor(fragCoord / u_cellsize);

    if (u_initialEffectFlag == 1) {
        // reveal effect -> show what should be revealed, make rest black
        float revealThreshold = (cellCoord.x + cellCoord.y) / (u_gridSize.x + u_gridSize.y - 2.0);
        if (revealThreshold > u_revealProgress) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    } else if (u_initialEffectFlag == 2) {
        float dist = length(cellCoord / u_gridSize - vec2(0.5));
        float revealThreshold = dist / 0.7071; // sqrt of 0.5
        if (revealThreshold > u_revealProgress) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    }

    vec2 cellCenter = (cellCoord + 0.5) * u_cellsize; // figure out center pixel of cell
    vec2 uv = cellCenter / u_resolution; // normalize to 0-1

    vec3 cellColor = texture(u_texture, uv).rgb;
    float luminosity = dot(cellColor, vec3(0.299, 0.587, 0.114)); // luminance of pixel
    if (u_coloredFlag) {
        cellColor = clamp(mix(vec3(luminosity), cellColor, u_saturation), 0.0, 1.0); // increase saturation (clamped)
    } else {
        cellColor = vec3(luminosity);
    }
    cellColor = pow(cellColor, vec3(2.0 - u_brightness)); // boost brightness

    uint charInd = texelFetch(u_charGrid, ivec2(cellCoord), 0).r; // find charInd from char grid texture instead of luminance
    vec2 withinCellPos = fract(fragCoord / u_cellsize); // need this to determine how a single pixel of atlas maps over (within a character)
    float atlasU = (float(charInd) + withinCellPos.x) / u_numChars;
    float atlasV = withinCellPos.y;
    float glyphMask = texture(u_atlas, vec2(atlasU, atlasV)).r; // only need r to tell if there is white or black

    vec3 finalColor;
    vec3 bgColor = cellColor * u_bgIntensity;
    finalColor = mix(bgColor, cellColor, glyphMask);

    if (u_mouseEffect) {
        bool inside = false;
        for (int i = 0; i < MOUSE_TRAIL_LEN; i++) {
            if (u_mouseLifeFracs[i] <= 0.0) {
                continue;
            }
            float r = u_mouseRadius * u_mouseLifeFracs[i];
            if (distance(cellCenter, u_mousePositions[i]) < r) { // use cellCenter so it snaps to whole cells
                inside = true;
                break;
            }
        }
        if (inside) {
            finalColor = clamp(finalColor * 2.0, 0.0, 1.0); // increase brightness
        }
    }

    fragColor = vec4(finalColor, 1.0);
}
