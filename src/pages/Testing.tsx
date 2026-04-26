import AsciiVideo from '../components/AsciiVideo'
import AsciiVideoWebGLNoEdges from '../components/AsciiVideoWebGLNoEdges'
import AsciiVideoWebGL from '../components/AsciiVideoWebGL'

function Testing() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        width: "100%",
        minHeight: "100vh",
        background: "black",
        padding: "12px",
        boxSizing: "border-box",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{
        width: "700px",
      }}>
        <AsciiVideoWebGLNoEdges />
      </div>
      <div style={{
        width: "700px",
      }}>
        <AsciiVideoWebGL />
      </div>
    </div>
  )
}

export default Testing;
