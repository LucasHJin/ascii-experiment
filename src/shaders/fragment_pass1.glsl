#version 300 es

precision highp float;
precision highp usampler2D;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_cellsize;
uniform int u_circleN;
uniform sampler2D u_charVectors;
uniform int u_numCharsInt;
uniform float u_shapeExponent;
uniform vec2 u_cropOffset;
uniform vec2 u_cropScale;

out uvec4 fragCharInd;

// only need to process once per cell
void main() {
    // get the cell coordinate (in terms of [gridCols, gridRows])
    ivec2 cellCoord = ivec2(floor(gl_FragCoord.xy));

    const vec2 CIRCLES[6] = vec2[6](
        vec2(0.25, 0.25), vec2(0.75, 0.25),
        vec2(0.25, 0.50), vec2(0.75, 0.50),
        vec2(0.25, 0.75), vec2(0.75, 0.75)
    );
    vec2 radiusUV = vec2(u_cellsize.x / 5.0) / u_resolution * u_cropScale; // remaps from [0, 1] to relevant sub-rectangle of video texture

    float sv[6];
    for (int ci = 0; ci < 6; ci++) {
        // normalized coordinates for circle center over full video texture
        vec2 centerUV = u_cropOffset + (vec2(cellCoord) + CIRCLES[ci]) * u_cellsize / u_resolution * u_cropScale;
        float total = 0.0;
        int count = 0;
        for (int dx = -u_circleN; dx <= u_circleN; dx++) {
            for (int dy = -u_circleN; dy <= u_circleN; dy++) {
                if (dx*dx + dy*dy <= u_circleN*u_circleN) {
                    vec2 sampleUV = centerUV + vec2(float(dx), float(dy)) * radiusUV / float(u_circleN);
                    vec3 sc = texture(u_texture, sampleUV).rgb;
                    total += dot(sc, vec3(0.299, 0.587, 0.114));
                    count++;
                }
            }
        }
        // create vector for cell
        sv[ci] = count > 0 ? total / float(count) : 0.0;
    }

    float maxVal = 0.0;
    for (int d = 0; d < 6; d++) maxVal = max(maxVal, sv[d]);
    if (maxVal > 0.0) {
        for (int d = 0; d < 6; d++) sv[d] = pow(sv[d] / maxVal, u_shapeExponent) * maxVal;
    }

    // find best matching character vector
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
            bestDist = dist; bestChar = uint(i); 
        }
    }

    fragCharInd = uvec4(bestChar, 0u, 0u, 0u);
}
