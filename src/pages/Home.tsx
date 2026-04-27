import AsciiVideoWebGL from '../components/AsciiVideoWebGL'

function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh'}}>
        <AsciiVideoWebGL src={'/test2.mp4'} brightness={1.2} saturation={3} coloredBg={true} initialEffect={0} />
    </div>
  )
}

export default Home;
