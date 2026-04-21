import { useRef, useEffect } from "react";

const FONT_SIZE = 10;

// Overall Notes
    // Color doesn't show up that well (need darker background)
    // Individual characters get blurry at smaller font size + very laggy very quickly at higher scales

// IMPROVE SCALING

function AsciiVideo() {
    const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    //const preRef = useRef<HTMLPreElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);


    useEffect(() => {
        const video = videoRef.current;
        const hiddenCanvas = hiddenCanvasRef.current;
        const canvas = canvasRef.current;
        const container = containerRef.current
        if (!video || !hiddenCanvas || !canvas || !container) return;

        const hiddenCtx = hiddenCanvas.getContext("2d");
        const visibleCtx = canvas.getContext("2d");
        if (!hiddenCtx || !visibleCtx) return;
        
        let animFrameId: number;
        const CHARS = ' .\'`,-_":;^=+*!?/\\|()[]{}tfilcjrzxvuneoaswhkqdpbgmyXY0123456789JCZULMWOQDBHNEFK#@';
        let charW: number;
        let charH: number;

        const processFrame = () => {
            const { width, height } = hiddenCanvas;

            hiddenCtx.drawImage(video, 0, 0, width, height);
            const imageData = hiddenCtx.getImageData(0, 0, width, height);
            const pixels = imageData.data;

            visibleCtx.clearRect(0, 0, canvas.width, canvas.height);

            //let result = "";

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4; // [r, g, b, a] -> need to multiply by 4
                    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
                    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
                    const charIndex = Math.floor((brightness / 255) * (CHARS.length - 1)); // normalize and find corresponding index
                    const char = CHARS[charIndex];
                    
                    visibleCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    visibleCtx.fillText(char, x * charW, y * charH);
                    
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
            visibleCtx.font = `${FONT_SIZE}px monospace`
            visibleCtx.textBaseline = "top";

            charW = visibleCtx.measureText('A').width;
            charH = FONT_SIZE;
            const charAspect = charW / charH;

            const cols = Math.floor(container.clientWidth / charW);
            const rows = Math.floor(container.clientHeight / charH);

            const scale = Math.min(cols / video.videoWidth, rows / video.videoHeight); // max for cutoff extra

            hiddenCanvas.width = Math.floor(video.videoWidth * scale / charAspect); // compensate for character aspect ratio
            hiddenCanvas.height = Math.floor(video.videoHeight * scale);

            const dpr = window.devicePixelRatio || 1; // dpr -> make css pixels match browser pixels (no resolution stretching)

            canvas.width = hiddenCanvas.width * charW * dpr;
            canvas.height = hiddenCanvas.height * charH * dpr;
            canvas.style.width = `${hiddenCanvas.width * charW}px`;
            canvas.style.height = `${hiddenCanvas.height * charH}px`;

            // re-apply after resize (it gets reset)
            visibleCtx.scale(dpr, dpr);
            visibleCtx.font = `${FONT_SIZE}px monospace`;
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
        <div 
            ref={containerRef}
            style={{ width: '100vw', height: '100vh', background: 'black', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
        >
            <canvas ref={hiddenCanvasRef} style={{ display: "none" }} />

            <video ref={videoRef} muted playsInline autoPlay style={{ display: "none" }}>
                <source src="/test.mp4" type="video/mp4" />
            </video>

            <canvas ref={canvasRef} style={{ display: 'block' }} />

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
