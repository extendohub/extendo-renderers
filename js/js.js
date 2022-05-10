const beautify = require('js-beautify').js

module.exports = async ({ render }) => {
  const code = await render.getContent()
  const output = beautify(code, { indent_size: 2 })
  const html = `<pre><code>${output}</code></pre>`
  return { html }
}
