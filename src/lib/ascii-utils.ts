const CIRCLES = [
    [0.25, 0.25], [0.75, 0.25],
    [0.25, 0.50], [0.75, 0.50],
    [0.25, 0.75], [0.75, 0.75],
];

const SIMPLE_CIRCLES = [
    [0, 0], [1, 0],
    [0, 1], [1, 1],
    [0, 2], [1, 2],
]

// computeShapeVectors takes in chars and outputs a 6D vector per char representing its 'shape'
function computeShapeVectors(chars: string, charW: number, charH: number): { char: string, vector: number[] }[] {
    const shapeData = [];
    const charCanvas = document.createElement("canvas");
    charCanvas.width = charW;
    charCanvas.height = charH;
    const charCtx = charCanvas.getContext("2d", { willReadFrequently: true });
    if (!charCtx) return [];
    charCtx.font = `${charH}px monospace`;
    charCtx.textBaseline = 'top';

    const rad = charW / 5;

    for (const char of chars) {
        charCtx.fillStyle = 'black';
        charCtx.fillRect(0, 0, charW, charH);
        charCtx.fillStyle = 'white';
        charCtx.fillText(char, 0, 0);

        const imageData = charCtx.getImageData(0, 0, charW, charH);
        const vector = [];

        for (const [cxFrac, cyFrac] of CIRCLES) {
            const cx = cxFrac * charW; // convert fraction to pixel coords
            const cy = cyFrac * charH;

            let totalBrightness = 0;
            let numPixels = 0;
            for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x += 1) {
                for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y += 1) {
                    const dx = cx - x;
                    const dy = cy - y;
                    if (dx * dx + dy * dy <= rad * rad) {
                        const i = (y * charW + x) * 4;
                        const brightness = imageData.data[i]; // only need red channel
                        totalBrightness += brightness / 255; // normalize for individual circle
                        numPixels++;
                    }
                }
            }

            const coverage = numPixels > 0 ? totalBrightness / numPixels : 0;
            vector.push(coverage);
        }
        shapeData.push({char, vector});
    }

    // normalize all data relative to each other
    const maxPerDim = Array(6).fill(0);
    for (const { vector } of shapeData) {
        for (let i = 0; i < 6; ++i) {
            if (vector[i] > maxPerDim[i]) {
                maxPerDim[i] = vector[i];
            }
        }
    }
    for (const { vector } of shapeData) {
        for (let i = 0; i < 6; ++i) {
            vector[i] /= maxPerDim[i];
        }
    }

    return shapeData;
}

export { computeShapeVectors, CIRCLES, SIMPLE_CIRCLES};
