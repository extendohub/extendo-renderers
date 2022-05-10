const yaml = require('js-yaml')

/**
 * do file attachments like imports. Files/attachments chunk that lists the files to get (perhaps
 * with alias). That translates into a variable (observed?) for each file. The files are loaded at 
 * render time and the content packaged in with the render payload.
 * 
 * imports need to be fetched and generated at render time and packaged with the full on content as well
 * This is somewhat like what they do when downloading the code for a notebook.
 * 
 * How to do hidden cells (perhaps not observed?)
 * 
 * Consider allowing for many variables to be declared in one {js} chunk. Perhaps with an 
 * `export` prefix to cause an observed variable to be made. Or use an explicit `export`
 * (or output) list.
*/

module.exports = async ({ helpers, render }) => {
  const content = await render.getContent({})
  const code = await generate(helpers.octokit, content, render.filesSpec)
  return { code }
}

function parseMarkdown(content, namespace) {
  const simplified = content.replace(/\r/g, '')
  const { frontmatter, markdown } = splitMarkdown(simplified)
  const config = parseFrontmatterConfig(frontmatter)
  const chunks = discoverMarkdownChunks(markdown, namespace)
  return { config, chunks }
}

function splitMarkdown(content) {
  const matches = content.match(/^---\n(.*)---/sm)
  if (matches && matches.length === 2)
    return { frontmatter: matches[1], markdown: content.slice(matches[0].length + matches.index) }
  return { frontmatter: undefined, markdown: content }
}

function parseFrontmatterConfig(content) {
  return content ? yaml.load(content) : {}
}

function discoverMarkdownChunks(content, namespace) {
  const matches = [...content.matchAll(/```{([\w# ]+)(?:\((.*?)\))?}(?:\s*?\[([\w\/]+)(?:\((.*?)\))?\])?(.*?)```/gms)]
  let index = 0
  const result = []
  for (const match of matches) {
    const markdown = content.slice(index, match.index).trim()
    if (markdown) result.push({ type: 'md', content: markdown })
    const [type, name] = match[1].split('#')
    const inputs = match[2] ? match[2].split(',').map(e => e.trim()) : undefined
    const renderer = match[3]
    const renderArgs = parseKeyValuePairs(match[4] ? match[4].split(',').map(e => e.trim()) : [])
    const code = match[5].trim()
    result.push({ type, name, inputs, renderer, renderArgs, content: code })
    index = match.index + match[0].length
  }
  if (index !== content.length) {
    const markdown = content.slice(index, content.length).trim()
    if (markdown) result.push({ type: 'md', content: markdown })
  }
  return result
}

function parseKeyValuePairs(spec) {
  return spec.reduce((result, pair) => {
    const [key, value] = pair.trim().split('=')
    if (key) result[key] = value
    return result
  }, {})
}

async function generate(octokit, content, resource, level) {
  const { chunks } = parseMarkdown(content)
  const state = createState(octokit, resource, level)
  const code = generateBody(chunks, state)
  const preamble = await generatePreamble(state)
  const postamble = generatePostamble()
  return [preamble, ...code, postamble].filter(Boolean).map(e => e.trim()).join('\n')
}

async function generatePreamble(state) {
  const importedModules = await captureImportedModules(state)
  return `
// Imported modules
${importedModules.map(entry => entry.code).join('\n').trim()}

// Transpiled user markdown to JavaScript
export${state.level ? ' ' : ' default '}function define${state.level}(runtime, observer) {
  const main = runtime.module()
${importedModules
      .map(entry => entry.unique)
      .map(unique => `  const child${unique} = runtime.module(define${unique})`)
      .join('\n')
    }
`.trim()
}

function captureImportedModules(state) {
  return Promise.all(state.modules.map(async (imported) => {
    const resolved = state.octokit.resolve(imported.name, state.current)
    const content = await getModuleContent(resolved, state.octokit)
    const unique = state.level + imported.alias
    const generated = await generate(state.octokit, content, resolved, unique)
    return { code: generated.trim(), unique }
  }))
}

function getModuleContent(location, octokit) {
  const response = octokit.repos.getContent(location)
  return Buffer.from(response.data.content, 'base64').toString('utf8')
}

function generatePostamble() {
  return `
  return main
}`
}

function createState(octokit, resource, level) {
  return { octokit, current: resource, modules: [], level: level || '' }
}

const generators = {
  md: generateMarkdown,
  html: generateHTML,
  javascript: generateJavaScript,
  imports: generateImports
}

function generateBody(chunks, state) {
  return chunks.reduce((result, chunk) => {
    const generator = generators[chunk.type]
    if (!generator) throw new Error(`Unknown chunk type ${chunk.type}`)
    const generated = generator(chunk, state)
    if (Array.isArray(generated)) result.push(...generated)
    else result.push(generated)
    return result
  }, [])
}

function generateMarkdown(chunk, state) {
  const inputs = ['md', ...(chunk.inputs || [])]
  const name = chunk.name || ''
  return generateVariable(name, inputs, chunk.content, 'md')
}

function generateHTML(chunk, state) {
  const inputs = ['html', ...(chunk.inputs || [])]
  const name = chunk.name || ''
  return generateVariable(name, inputs, chunk.content, 'html')
}

function generateJavaScript(chunk, state) {
  const { implicitInputs } = analyzeJS(chunk, state)
  const inputs = [...implicitInputs, ...(chunk.inputs || [])]
  const name = chunk.name || ''
  const hasReturn = chunk.content.match(/(?:^|\s)+return(?:$|\s)+/)
  const isAsync = chunk.content.match(/(?:^|[^\w])+await\s+/)
  const isGenerator = chunk.content.match(/(?:^|[^\w])+yield\s+/)
  const characters = { hasReturn, isAsync, isGenerator }
  return generateVariable(name, inputs, chunk.content, undefined, characters, chunk.renderer, chunk.renderArgs)
}

function generateImports(chunk, state) {
  const lines = chunk.content.split('\n')
  return lines.reduce((result, line) => {
    const parsed = parseImportLine(line)
    if (parsed.module) {
      const { name, alias, module, isViewOf } = parsed
      const moduleEntry = getModuleEntry(module, state.modules)
      if (isViewOf) result.push(generateImport(name, alias, moduleEntry, true))
      result.push(generateImport(name, alias, moduleEntry))
    } else if (parsed.origin) {
      // TODO proper location resolution for imports include version/ref etc
      // This should really use the config registry code so content can come from apps, ...
      const { owner, repo, ref } = state.current
      const url = `https://github.com/${owner}/${repo}/blob/${ref || 'main'}/${parsed.origin.replace('./', '')}?raw=true`
      result.push(`
main.variable(observer("${parsed.alias}")).define("${parsed.alias}", [], function() { 
  return fetch("${url}")
})`)
    }
    return result
  }, [])
}

// { [viewof] foo as [viewof] bar } from xx
function parseImportLine(line) {
  const fromMatches = line.match(/{(.*?)}\s+from\s+(.*)/)
  if (fromMatches) return parseModuleImport(fromMatches)
  const loadMatches = line.match(/(.*?)\s+load\s+(.*)/)
  if (loadMatches) return parseLoadImport(loadMatches)
  throw new Error('missing import statements in import chunk')
}

function parseModuleImport(matches) {
  const originParts = matches[1].match(/^\s?(viewof\s+)?(.+?)(?:(?:\s+as\s+(?:viewof\s+)?(\w+))|$)/)
  const isViewOf = !!originParts[1]
  const name = originParts[2].trim()
  const alias = originParts[3] ? originParts[3].trim() : null
  const module = matches[2].trim()
  return { name, alias, module, isViewOf }
}

function parseLoadImport(matches) {
  const spec = null  // TODO this will be the JSONpath spec to the value in the origin to assign to the alias
  const alias = matches[1].trim()
  const origin = matches[2].trim()
  return { spec, alias, origin }
}

// get or add an entry for the module with the given name in the given list
function getModuleEntry(name, list) {
  const entry = list.find(entry => entry.name === name)
  if (entry) return entry
  const newEntry = { name, alias: list.length.toString() }
  list.push(newEntry)
  return newEntry
}

function generateImport(name, alias, module, isViewOf) {
  const nameString = isViewOf ? `viewof ${name}` : name
  const aliasString = alias ? (isViewOf ? `"viewof ${alias}", ` : `"${alias}", `) : ''
  return `
main.import("${nameString}", ${aliasString}child${module.alias})`
}

function analyzeJS(chunk, state) {
  return { implicitInputs: [] }
}

function generateVariable(name, inputs, content, type, characters = {}, renderer, renderOptions) {
  const wrappedCode = generateWrappedCode(content, type, characters, renderer, renderOptions)
  if (renderer && !inputs.includes('render')) inputs = [...inputs, 'render']
  const inputDeclarations = inputs.map(entry => `"${entry}"`).join(', ')
  const inputArgs = inputs.map(i => i.replace(/ /g, '_')).join(', ')
  const nameString = name ? `"${name}"` : ''
  const functionKeyword = `${characters.isAsync ? 'async ' : ''}function${characters.isGenerator ? '*' : ''}`
  const observerString = !characters.isViewOf && characters.isHidden ? '' : `observer(${nameString})`
  const result = [`main.variable(${observerString}).define(${nameString}${name ? ', ' : ''}[${inputDeclarations}], ${functionKeyword}(${inputArgs}) { ${wrappedCode}})`]
  if (name && characters.isViewOf) result.push(generateViewValue(name, characters.isHidden))
  return result
}

function generateWrappedCode(content, type, characters, renderer, renderOptions) {
  const templatedContent = type ? `${type}\`${content.trim()}\`` : content.trim()
  const wrappedContent = characters.hasReturn || characters.isGenerator ? `\n  ${templatedContent}\n` : `return (\n  ${templatedContent}\n)`
  if (!renderer) return wrappedContent
  return `
    const _content = (() => {
      ${wrappedContent}
    })()
    const _renderOptions = ${JSON.stringify(renderOptions)}
    return render(_content, "${renderer}", _renderOptions)
`
}

function generateViewValue(name, hidden) {
  const [trimmedName] = name.split(' ')
  const observerString = hidden ? '' : `observer("${trimmedName}")`
  return `main.variable(${observerString}).define("${trimmedName}", ["Generators", "${name}"], (G, _) => G.input(_))`
}
