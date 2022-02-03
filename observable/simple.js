const fs = require('fs')
const render = require('./render')

const test = async () => {
  const params = {
    context: {},
    render: {
      getContent: (spec) => fs.readFileSync(`./${spec.path || 'simple.md'}`).toString(),
      target: {
        resource: {
          owner: 'app-extensions', repo: 'test', path: 'simple.md', ref: 'main'
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
            owner: 'app-extensions', repo: 'test', path: 'scatter.md', ref: 'main'
          }
        }
      }
    },
    inputs: {}
  }
  const rendered = await render(params)
  console.log(rendered.code)
}
test()
