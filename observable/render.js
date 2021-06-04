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

module.exports = async ({ options, context }) => {
  const content = await context.render.getContent({})
  const code = await generate(context, content, context.target.resource)
  console.log(code)
  const encoded = Buffer.from(code).toString('base64');
  const stringModule = `data:text/javascript;base64,${encoded}`
  const script = `
    <script type="module">
      import { Runtime, Inspector } from "https://cdn.jsdelivr.net/npm/@observablehq/runtime@4/dist/runtime.js"
      import('${stringModule}').then(notebook => {
        const runtime = new Runtime()
        runtime.module(notebook.default, Inspector.into(document.body))
        window.parent.postMessage('loaded', '*')
      })
    </script>`
  const html = `
<html>
  <meta charset="utf-8">
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/@observablehq/inspector@3/dist/inspector.css">
  <body>
  ${script.trim()}
</html>`.trim()
  return { html }
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
  const matches = [...content.matchAll(/```{([\w# ]+)}(?:\((.*?)\))?\n(.*?)```/gms)]
  let index = 0
  const result = []
  for (const match of matches) {
    const markdown = content.slice(index, match.index).trim()
    if (markdown) result.push({ type: 'md', content: markdown })
    const [type, name] = match[1].split('#')
    const args = parseKeyValuePairs(match[2])
    const inputs = args && args.inputs ? args.inputs.split(';') : undefined
    result.push({ type, name, inputs, content: match[3].trim() })
    index = match.index + match[0].length
  }
  if (index !== content.length) {
    const markdown = content.slice(index, content.length).trim()
    if (markdown) result.push({ type: 'md', content: markdown })
  }
  return result
}

function parseKeyValuePairs(spec) {
  if (!spec) return {}
  const pairs = spec.split(',')
  return pairs.reduce((result, pair) => {
    const [key, value] = pair.trim().split('=')
    if (key) result[key] = value
    return result
  }, {})
}

async function generate(context, content, resource, level) {
  const { chunks } = parseMarkdown(content)
  const state = createState(context, resource, level)
  const code = generateBody(chunks, state)
  const preamble = await generatePreamble(state)
  const postamble = generatePostamble()
  return [preamble, ...code, postamble].filter(Boolean).map(e => e.trim()).join('\n')
}

async function generatePreamble(state) {
  const importedModules = await captureImportedModules(state)
  return `
// Imported modules
${importedModules.trim()}

// Transpiled user markdown to JavaScript
export default function define${state.level}(runtime, observer) {
  const main = runtime.module()`.trim()
}

async function captureImportedModules(state) {
  const entries = await Promise.all(state.modules.map(async (imported) => {
    const resolved = state.context.github.resolve(imported.name, state.current)  
    const content = await getModuleContent(resolved, state.context)
    const unique = state.level + imported.alias
    const generated = await generate(state.context, content, resolved, unique)
    return `
${generated}
const child${unique} = runtime.module(define${unique})`.trim()
  }))
  return entries.join('\n')
}

function getModuleContent(location, context) {
  return context.render.getContent(location)
}

function generatePostamble() {
  return `
  return main
}`
}

function createState(context, resource, level) {
  return { context, current: resource || context.target.resource, modules: [], level: level || '' }
}

const generators = {
  md: generateMarkdown,
  html: generateHTML,
  js: generateJavaScript,
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
  return generateVariable(name, inputs, chunk.content, undefined, characters)
}

function generateImports(chunk, state) {
  const lines = chunk.content.split('\n')
  return lines.reduce((result, line) => {
    const parsed = parseImportLine(line)
    if (parsed.module) {
      const { isViewof, name, alias, module } = parsed
      const moduleEntry = getModuleEntry(module, state.modules)
      if (isViewof) result.push(generateImport(name, alias, moduleEntry, true))
      result.push(generateImport(name, alias, moduleEntry))
    } else if (parsed.origin) {
      // TODO proper location resolution for imports include version/ref etc
      // This should really use the config registry code so content can come from apps, ...
      const url = new URL(parsed.origin, state.url)
      result.push(`
main.variable(observer("${parsed.alias}")).define("${parsed.alias}", function() { 
  return fetch("${url.toString()}")
})`)
    }
    return result
  }, [])
}

// { viewof foo as bar } from xx
function parseImportLine(line) {
  const fromMatches = line.match(/{(.*?)}\s+from\s+(.*)/)
  if (fromMatches) return parseModuleImport(fromMatches)
  const loadMatches = line.match(/(.*?)\s+load\s+(.*)/)
  if (loadMatches) return parseLoadImport(loadMatches)
  throw new Error('missing import statements in import chunk')
}

function parseModuleImport(matches) {
  const originParts = matches[1].match(/^\s?(viewof\s+)?(.+?)(?:(?:\s+as\s+(\w+))|$)/)
  const isViewof = !!originParts[1]
  const name = originParts[2]
  const alias = originParts[3]
  const module = matches[2]
  return { name, alias, module, isViewof }
}

function parseLoadImport(matches) {
  const spec = null  // TODO this will be the JSONpath spec to the value in the origin to assign to the alias
  const alias = matches[1]
  const origin = matches[2]
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

function generateImport(name, alias, module, isViewof) {
  const nameString = isViewof ? `viewof ${name}` : name
  const aliasString = alias ? (isViewof ? `"viewof ${alias}", ` : `"${alias}", `) : ''
  return `
main.import("${nameString}", ${aliasString}child${module.alias})`
}

function analyzeJS(chunk, state) {
  return { implicitInputs: [] }
}

function generateVariable(name, inputs, content, type, characters = {}) {
  const templatedContent = type ? `${type}\`${content.trim()}\`` : content.trim()
  const wrappedContent = characters.hasReturn || characters.isGenerator ? `\n  ${templatedContent}\n` : `return (\n  ${templatedContent}\n)`
  const inputDeclarations = inputs.map(entry => `"${entry}"`).join(', ')
  const inputArgs = inputs.map(i => i.replace(/ /g, '_')).join(', ')
  const nameString = name ? `"${name}"` : ''
  const functionKeyword = `${characters.isAsync ? 'async ' : ''}function${characters.isGenerator ? '*' : ''}`
  return `
main.variable(observer(${nameString})).define(${nameString}${name ? ', ' : ''}[${inputDeclarations}], ${functionKeyword}(${inputArgs}) { ${wrappedContent}})`
}

