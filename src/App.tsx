import './App.css'
import './components/AsciiVideo'
import AsciiVideo from './components/AsciiVideo'
import AsciiVideoWebGLNoEdges from './components/AsciiVideoWebGLNoEdges'
import AsciiVideoWebGL from './components/AsciiVideoWebGL'

function App() {
  return (
    <div>
      {/* <AsciiVideo /> */}
      <AsciiVideoWebGL />
    </div>
  )
}

export default App
