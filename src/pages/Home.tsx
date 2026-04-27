import AsciiVideoWebGL from '../components/AsciiVideoWebGL'

function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh'}}>
        <AsciiVideoWebGL coloredBg={true} initialEffect={0} />
    </div>
  )
}

export default Home;
