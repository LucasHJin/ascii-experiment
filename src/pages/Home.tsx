import AsciiVideoWebGL from '../components/AsciiVideoWebGL'

function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh'}}>
        <AsciiVideoWebGL 
          src={'/test.mp4'} 
        /> 
    </div>
  )
}

export default Home;
