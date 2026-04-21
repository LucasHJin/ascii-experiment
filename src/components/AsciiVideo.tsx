import { useRef, useEffect } from "react";

const SCALE = 0.15;

function AsciiVideo() {
    const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const preRef = useRef<HTMLPreElement | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        const hiddenCanvas = hiddenCanvasRef.current;
        if (!video || !hiddenCanvas) return;

        const ctx = hiddenCanvas.getContext("2d");
        if (!ctx) return;
        
        let animFrameId: number;

        const processFrame = () => {
            const { width, height } = hiddenCanvas;

            ctx.drawImage(video, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const pixels = imageData.data;

            const BLOCK_SIZE = 1;
            const CHARS = ' .,:;i1tfLCG08@';
            let result = '';

            for (let y = 0; y < height; y += BLOCK_SIZE) {
                for (let x = 0; x < width; x += BLOCK_SIZE) {
                    const i = (y * width + x) * 4; // [r, g, b, a] -> need to multiply by 4
                    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
                    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
                    const charIndex = Math.floor((brightness / 255) * (CHARS.length - 1)); // normalize and find corresponding index
                    result += CHARS[charIndex];
                }
                result += '\n';
            }
            if (preRef.current) preRef.current.textContent = result;
        };

        const loop = () => {
            processFrame();
            animFrameId = requestAnimationFrame(loop);
        };

        const onLoaded = () => {
            hiddenCanvas.width = Math.floor(video.videoWidth * SCALE);
            hiddenCanvas.height = Math.floor(video.videoHeight * SCALE);
            video.play();
            animFrameId = requestAnimationFrame(loop);
        };

        video.addEventListener("loadeddata", onLoaded);

        return () => {
            video.removeEventListener("loadeddata", onLoaded);
            cancelAnimationFrame(animFrameId);
        }
    }, []);

    return (
        <div>
            <canvas ref={hiddenCanvasRef} style={{ display: "none" }} />

            <video ref={videoRef} muted playsInline autoPlay style={{ display: "none" }}>
                <source src="/test.mp4" type="video/mp4" />
            </video>

            <pre ref={preRef} style={{ 
                fontSize: '6px', 
                lineHeight: '3px',
                fontFamily: 'monospace'
            }}/>
        </div>
    );
}

export default AsciiVideo;
