#version 300 es

precision highp float;
precision highp usampler2D;

// flags
uniform int u_revealEffectFlag;
uniform bool u_coloredFlag;

// effects
uniform float u_revealProgress;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_bgOpacity;

uniform bool u_mouseEffect;
#define MOUSE_TRAIL_LEN 30 // note -> need this value to be a compile time constant (set to max of 30)
uniform vec2 u_mousePositions[MOUSE_TRAIL_LEN];
uniform float u_mouseLifeFracs[MOUSE_TRAIL_LEN]; // radius of trail + determines if expired (0)
uniform float u_mouseRadius;
uniform float u_mouseBrightness;

uniform bool u_clickEffect;
#define MAX_RIPPLES 10
uniform vec2 u_ripplePositions[MAX_RIPPLES];
uniform float u_rippleRadii[MAX_RIPPLES]; // current disc radius in pixels
uniform float u_rippleBrightnesses[MAX_RIPPLES]; // applied brightness per ripple

uniform bool u_scatterEffect;
uniform usampler2D u_scatterStateTexture; // gridCols x gridRows, R8UI: 0=inactive, otherwise (charIdx + 1)
uniform sampler2D u_scatterAtlas;          // wide atlas of u_scatterNumChars glyphs
uniform float u_scatterNumChars;

uniform bool u_shapeMatching;

uniform sampler2D u_texture;
uniform sampler2D u_atlas;
uniform usampler2D u_fboTexture;
uniform vec2 u_resolution;
uniform vec2 u_cellsize;
uniform float u_numChars;
uniform vec2 u_gridSize;

out vec4 fragColor;

// hash function to simulate randomness
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031); // mix up axes to avoid symmetry
    p3 += dot(p3, p3.yzx + 33.33); // nonlienar mixing + avoid smaller number collapse
    return fract((p3.x + p3.y) * p3.z); // final fract to be between 0 and 1
}

void main() {
    vec2 fragCoord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y); // flip y coords
    vec2 cellCoord = floor(fragCoord / u_cellsize);

    if (u_revealEffectFlag == 1) {
        // reveal effect -> show what should be revealed, make rest black
        float revealThreshold = (cellCoord.x + cellCoord.y) / (u_gridSize.x + u_gridSize.y - 2.0);
        if (revealThreshold > u_revealProgress) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    } else if (u_revealEffectFlag == 2) {
        float dist = length(cellCoord / u_gridSize - vec2(0.5));
        float revealThreshold = dist / 0.7071; // sqrt of 0.5
        if (revealThreshold > u_revealProgress) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    } else if (u_revealEffectFlag == 3) {
        float revealThreshold = hash(cellCoord);
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

    uint charInd;
    if (u_shapeMatching) {
        charInd = texelFetch(u_fboTexture, ivec2(cellCoord), 0).r; // fetch from the u_fboTexture instead of computing
    } else {
        charInd = uint(floor(luminosity * (u_numChars - 1.0)));
    }

    vec2 withinCellPos = fract(fragCoord / u_cellsize); // need this to determine how a single pixel of atlas maps over (within a character)
    float atlasU = (float(charInd) + withinCellPos.x) / u_numChars;
    float atlasV = withinCellPos.y;
    float glyphMask = texture(u_atlas, vec2(atlasU, atlasV)).r; // only need r to tell if there is white or black

    vec3 bgColor = cellColor * u_bgOpacity;

    bool scatterHit = false;
    vec3 scatterColor = vec3(0.0); // initially black
    // get the color for pixel if affected by scatter effect
    if (u_scatterEffect) {
        uint state = texelFetch(u_scatterStateTexture, ivec2(cellCoord), 0).r; 
        if (state > 0u) {
            int idx = int(state) - 1;
            float su = (float(idx) + withinCellPos.x) / u_scatterNumChars;
            float mask = texture(u_scatterAtlas, vec2(su, withinCellPos.y)).r;
            scatterColor = mix(bgColor, vec3(1.0), mask);
            scatterHit = true;
        }
    }

    vec3 finalColor;
    if (scatterHit) {
        finalColor = scatterColor;
    } else {
        // no scatter effect
        finalColor = mix(bgColor, cellColor, glyphMask);

        if (u_mouseEffect) {
            bool inside = false;
            for (int i = 0; i < MOUSE_TRAIL_LEN; i++) {
                if (u_mouseLifeFracs[i] <= 0.0) {
                    continue;
                }
                float r = u_mouseRadius * u_mouseLifeFracs[i];
                if (distance(cellCenter, u_mousePositions[i]) < r) {
                    inside = true;
                    break;
                }
            }
            if (inside) {
                finalColor = clamp(finalColor * u_mouseBrightness, 0.0, 1.0);
            }
        }

        if (u_clickEffect) {
            float boost = 1.0;
            for (int i = 0; i < MAX_RIPPLES; i++) {
                if (u_rippleBrightnesses[i] <= 1.0) {
                    continue;
                }
                if (distance(cellCenter, u_ripplePositions[i]) < u_rippleRadii[i]) {
                    boost *= u_rippleBrightnesses[i];
                }
            }
            if (boost > 1.0) {
                finalColor = clamp(finalColor * boost, 0.0, 1.0);
            }
        }
    }

    fragColor = vec4(finalColor, 1.0);
}
