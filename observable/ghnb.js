const fs = require('fs')
const render = require('./render')

const test = async () => {
  const params = {
    context: {
      render: {
        getContent: () => fs.readFileSync('./five-minute.md').toString()
      },
      target: {
        url: 'https://github.com/foo/bar/scatter.md'
      }
    },
    options: {}
  }
  const rendered = await render(params)
  fs.writeFileSync('./output.html', rendered.html)
}
test()
