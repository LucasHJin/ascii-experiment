import AsciiVideoWebGL from '../components/AsciiVideoWebGL'

function Home() {
  const VIDEOS = ['/m1.mp4', '/m2.mp4', '/m3.mp4', '/m4.mp4', '/m5.mp4'];
  return (
    <div style={{ width: '100vw', height: '100vh'}}>
        <AsciiVideoWebGL 
          src={'/m3.mp4'} 
          fontSize={15} 
          colored={true}
          brightness={1.2} 
          saturation={1.6} 
          bgIntensity={0.3} 
          initialEffect={0} 
          mouseEffect={false}
          trailLen={15}
          trailFalloff={10}
          trailDuration={2000}
          mouseRadiusRatio={0.08}
          mouseBrightness={2.0}
          clickEffect={true}
          fit={'width'}
        />
    </div>
  )
}

export default Home;
