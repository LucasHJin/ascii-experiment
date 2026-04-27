import AsciiVideoWebGL from '../components/AsciiVideoWebGL'

function Home() {
  const VIDEOS = ['/m1.mp4', '/m2.mp4', '/m3.mp4', '/m4.mp4', '/m5.mp4'];
  return (
    <div style={{ width: '100vw', height: '100vh'}}>
        <AsciiVideoWebGL src={'/m1.mp4'} fontSize={12} brightness={1.2} saturation={1.6} coloredBg={true} initialEffect={1} />
    </div>
  )
}

export default Home;
