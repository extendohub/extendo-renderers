import _mathjax from 'mathjax-full/js/mathjax.js'
const { mathjax } = _mathjax
import _TeX from 'mathjax-full/js/input/tex.js'
const { TeX } = _TeX
import _CHTML from 'mathjax-full/js/output/chtml.js'
const { CHTML } = _CHTML
import _liteAdaptor from 'mathjax-full/js/adaptors/liteAdaptor.js'
const { liteAdaptor } = _liteAdaptor
import _RegisterHTMLHandler from 'mathjax-full/js/handlers/html.js'
const { RegisterHTMLHandler } = _RegisterHTMLHandler
import _AllPackages from 'mathjax-full/js/input/tex/AllPackages.js'
const { AllPackages } = _AllPackages

module.exports = async ({ render }) => {
  const content = await render.getContent({}, 'utf8')
  const adaptor = liteAdaptor()
  RegisterHTMLHandler(adaptor)
  const tex = new TeX({});
  const chtml = new CHTML({ fontURL: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2' })
  const htmlConverter = mathjax.document('', { InputJax: tex, OutputJax: chtml })

  const display = content.startsWith('$$') || content.startsWith('\\[')
  const trimmed = trimContent(content)

  const output = htmlConverter.convert(trimmed, { display })
  const html = adaptor.outerHTML(output)
  const styles = adaptor.textContent(chtml.styleSheet(htmlConverter))
  return { html, styles }
}

function trimContent(content) {
  if (content.startsWith('$$') || content.startsWith('\\(') || content.startsWith('\\[')) return content.slice(2, -2)
  if (content.startsWith('$')) return content.slice(1, -1)
  return content
}
