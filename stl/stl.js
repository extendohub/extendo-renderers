// node
const fs = require('fs').promises
module.exports = async ({ render }) => {
  const stlViewer = await fs.readFile('./stlViewer.js')
  const styles = [`div.stlviewer { height: 500px; }`]
  const scripts = [
    `window.onload=function() { STLViewerEnable("stlviewer") }`,
    { url: 'https://unpkg.com/three.js/build/three.min.js' },
    { url: 'https://unpkg.com/three.js/examples/js/WebGL.js' },
    { url: 'https://unpkg.com/three.js/examples/js/loaders/STLLoader.js"' },
    { url: 'https://unpkg.com/three.js/examples/js/controls/OrbitControls.js' },
    stlViewer.toString()
  ]
  const content = await render.getContent()
  const html = `<div class=stlviewer data-src=${content}></div>`
  return { html, styles, scripts }
}


