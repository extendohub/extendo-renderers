const fs = require('fs')
const render = require('./render')

const test = async () => {
  const params = {
    context: {},
    render: {
      getContent: (spec) => fs.readFileSync(`./${spec.path || 'five-minute.md'}`).toString(),
      target: {
        resource: {
          owner: 'extendohub', repo: 'test', path: 'five-minute.md', ref: 'main'
        }
      }
    },
    helpers: {
      octokit: {
        repos: {
          getContent: (spec) => {
            return { data: { content: fs.readFileSync(`./${spec.path || 'scatter.md'}`) } }
          }
        },
        resolve: () => {
          return {
            owner: 'extendohub', repo: 'test', path: 'scatter.md', ref: 'main'
          }
        }
      }
    },
    inputs: {}
  }
  const rendered = await render(params)
  fs.writeFileSync('./output.html', rendered.html)
}
test()
