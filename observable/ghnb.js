const fs = require('fs')
const render = require('./render')

const test = async () => {
  const params = {
    context: {
      render: {
        getContent: (spec) => fs.readFileSync(`./${spec.path || 'five-minute.md'}`).toString()
      },
      target: {
        resource: {
          owner: 'app-extensions', repo: 'test', path: 'five-minute.md', ref: 'main'
        }
      },
      github: {
        resolve: () => {
          return {
            owner: 'app-extensions', repo: 'test', path: 'scatter.md', ref: 'main'
          }
        }
      }
    },
    options: {}
  }
  const rendered = await render(params)
  fs.writeFileSync('./output.html', rendered.html)
}
test()
