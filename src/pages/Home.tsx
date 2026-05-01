import AsciiVideoWebGL from '../components/AsciiVideoWebGL'

function Home() {
  const VIDEOS = ['/m1.mp4', '/m2.mp4', '/m3.mp4', '/m4.mp4', '/m5.mp4'];
  return (
    <div style={{ width: '100vw', height: '100vh'}}>
        <AsciiVideoWebGL 
          src={'/test.mp4'} 
          mouseEffect={{ style: 'scatter', lifetime: 0.8 }}
        /> 
    </div>
  )
}

export default Home;
