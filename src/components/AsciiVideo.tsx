import { useRef, useEffect } from "react";

const SCALE = 0.05;

// Overall Notes
    // Color doesn't show up that well (need darker background)
    // Individual characters get blurry at smaller font size + very laggy very quickly at higher scales

// IMPROVE SCALING

function AsciiVideo() {
    const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    //const preRef = useRef<HTMLPreElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        const hiddenCanvas = hiddenCanvasRef.current;
        const canvas = canvasRef.current;
        if (!video || !hiddenCanvas || !canvas) return;

        const hiddenCtx = hiddenCanvas.getContext("2d");
        const visibleCtx = canvas.getContext("2d");
        if (!hiddenCtx || !visibleCtx) return;
        
        let animFrameId: number;
        const BLOCK_SIZE = 1;
        const CHARS = ' .,:;i1tfLCG08@';
        const FONT_SIZE = 12;

        const processFrame = () => {
            const { width, height } = hiddenCanvas;

            hiddenCtx.drawImage(video, 0, 0, width, height);
            const imageData = hiddenCtx.getImageData(0, 0, width, height);
            const pixels = imageData.data;

            visibleCtx.clearRect(0, 0, canvas.width, canvas.height);

            //let result = "";

            for (let y = 0; y < height; y += BLOCK_SIZE) {
                for (let x = 0; x < width; x += BLOCK_SIZE) {
                    const i = (y * width + x) * 4; // [r, g, b, a] -> need to multiply by 4
                    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
                    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
                    const charIndex = Math.floor((brightness / 255) * (CHARS.length - 1)); // normalize and find corresponding index
                    const char = CHARS[charIndex];
                    
                    visibleCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    visibleCtx.fillText(char, x * FONT_SIZE, y * FONT_SIZE);
                    
                    //result += CHARS[charIndex];
                }
                //result += '\n';
            }
            //if (preRef.current) preRef.current.textContent = result;
        };

        const loop = () => {
            processFrame();
            animFrameId = requestAnimationFrame(loop);
        };

        const onLoaded = () => {
            hiddenCanvas.width = Math.floor(video.videoWidth * SCALE);
            hiddenCanvas.height = Math.floor(video.videoHeight * SCALE);

            canvas.width = hiddenCanvas.width * FONT_SIZE;
            canvas.height = hiddenCanvas.height * FONT_SIZE;

            visibleCtx.font = `${FONT_SIZE}px monospace`
            visibleCtx.textBaseline = "top";

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

            <canvas ref={canvasRef} style={{ background: 'black' }} />

            {/*
            <pre ref={preRef} style={{ 
                fontSize: '6px', 
                lineHeight: '3px',
                fontFamily: 'monospace'
            }}/>
            */}
        </div>
    );
}

export default AsciiVideo;
