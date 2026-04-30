#version 300 es

precision highp float;

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

uniform bool u_shapeMatching;

uniform sampler2D u_texture;
uniform sampler2D u_atlas;
uniform vec2 u_resolution;
uniform vec2 u_cellsize;
uniform float u_numChars;
uniform sampler2D u_charVectors;
uniform int u_numCharsInt;
uniform float u_shapeExponent;
uniform int u_circleN; // sampling density per circle -> 1=3x3, 2=5x5, 3=7x7
uniform vec2 u_gridSize;

out vec4 fragColor;

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
        // sample positions per cell 
        const vec2 CIRCLES[6] = vec2[6](
            vec2(0.25, 0.25), vec2(0.75, 0.25),
            vec2(0.25, 0.50), vec2(0.75, 0.50),
            vec2(0.25, 0.75), vec2(0.75, 0.75)
        );
        // radius = charW/5 in UV space (same pixel radius, different UV scale per axis)
        vec2 radiusUV = vec2(u_cellsize.x / 5.0) / u_resolution;

        float sv[6]; // character vector
        for (int ci = 0; ci < 6; ci++) {
            vec2 centerUV = (cellCoord + CIRCLES[ci]) * u_cellsize / u_resolution;
            float total = 0.0;
            int count = 0;
            for (int dx = -u_circleN; dx <= u_circleN; dx++) {
                for (int dy = -u_circleN; dy <= u_circleN; dy++) {
                    if (dx*dx + dy*dy <= u_circleN*u_circleN) {
                        vec2 sampleUV = centerUV + vec2(float(dx), float(dy)) * radiusUV / float(u_circleN);
                        vec3 sc = texture(u_texture, sampleUV).rgb;
                        total += dot(sc, vec3(0.299, 0.587, 0.114)); // add to brightness
                        count++;
                    }
                }
            }
            sv[ci] = count > 0 ? total / float(count) : 0.0; // normalize brightness for index
        }

        // exponent contrast (normalize, apply exponent, denormalize)
        float maxVal = 0.0;
        for (int d = 0; d < 6; d++) {
            maxVal = max(maxVal, sv[d]);
        }
        if (maxVal > 0.0) {
            for (int d = 0; d < 6; d++) {
                sv[d] = pow(sv[d] / maxVal, u_shapeExponent) * maxVal;
            }
        }

        // search for nearest character vector
        uint bestChar = 0u;
        float bestDist = 1e10;
        for (int i = 0; i < u_numCharsInt; i++) {
            vec4 r0 = texelFetch(u_charVectors, ivec2(i, 0), 0);
            vec4 r1 = texelFetch(u_charVectors, ivec2(i, 1), 0);
            float dist = 0.0;
            float diffs[6] = float[6](
                sv[0] - r0.r, sv[1] - r0.g, sv[2] - r0.b, sv[3] - r0.a,
                sv[4] - r1.r, sv[5] - r1.g
            );
            for (int d = 0; d < 6; d++) {
                dist += diffs[d] * diffs[d];
            }
            if (dist < bestDist) { 
                bestDist = dist; 
                bestChar = uint(i); 
            }
        }
        charInd = bestChar;
    } else {
        charInd = uint(floor(luminosity * (u_numChars - 1.0)));
    }

    vec2 withinCellPos = fract(fragCoord / u_cellsize); // need this to determine how a single pixel of atlas maps over (within a character)
    float atlasU = (float(charInd) + withinCellPos.x) / u_numChars;
    float atlasV = withinCellPos.y;
    float glyphMask = texture(u_atlas, vec2(atlasU, atlasV)).r; // only need r to tell if there is white or black

    vec3 finalColor;
    vec3 bgColor = cellColor * u_bgOpacity;
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
            finalColor = clamp(finalColor * u_mouseBrightness, 0.0, 1.0); // increase brightness
        }
    }

    if (u_clickEffect) {
        // Find total brightness multiplier
        float boost = 1.0;
        for (int i = 0; i < MAX_RIPPLES; i++) {
            if (u_rippleBrightnesses[i] <= 1.0) {
                continue; // needs to increase brightness (else ignored)
            }
            if (distance(cellCenter, u_ripplePositions[i]) < u_rippleRadii[i]) {
                boost *= u_rippleBrightnesses[i]; // overlapping discs stack
            }
        }
        if (boost > 1.0) {
            finalColor = clamp(finalColor * boost, 0.0, 1.0);
        }
    }

    fragColor = vec4(finalColor, 1.0);
}
