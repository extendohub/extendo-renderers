Renderer for Github Live Markdown

This code is ncc'd and then installed as .github/render/github/live.js


##TODO

* make an inspector that mimics the browser extension in that it allows for pluggable rendering (if needed)
  * The cell can compute/return the rendering, if so, the extensibility is skipped
* add notion of hidden cells
* add rendering such that the source is also shown
* Define model for cell results where can include value, type, and rendering
  * Currently value and rendering (viewof) are separate cells. Maybe that's ok?


## NOTES
1. notebook render is detected
1. render request to server

2. transpile notebook md into observable
3. discover and transpile any imports
4. discover any attachments
5. assemble observable notebook doc that includes imports and links to attachments
    * requires a customer file attachment mechanism to fetch files from gitHub?
6. return rendered content

7. create Observable runtime and inspector and insert into DOM

## Inspector

* how to do hidden cells
* perhaps hidden cells are in another section of the doc or marked as hidden

## Inline
* inline values can just be `${tex <var reference>}`
* the `tex` in that example is the rendered so we could have "s***charts" just as well. 

## Compute nodes
* how to indicate if compute is browser side or server side
  * The server side compute is "content"
  * potentially use different code block tag (e.g., `server`) and implicitness (e.g., `kql` is always server side)
    * is the only ambiguity around JS? Potentially use `node` or `serverless` (node is better as it is specifically JS related.)
    * We'd have kql, docker, node, sql, ...  (these are essentially the `content` types)
* How to indicate rendering
  * should we or should the cell compute the value and then another cell do the presentation?

## Render
* how to plug in renderers
* differentiate between server side and client side rendering
* what's the API for client side
* how do users spec which renderer to use (syntax)



* content type
* how content is produced (with parameters e.g, teams to consider, number of results, ...)
* rendering of content (with parameters eg.., color, line size, ...)

e.g., 
* csv created from JS and rendered as an HTML table
* csv read from file and rendered as a spreadsheet


`\`\`\`{}\`\`\`` -- denotes the how to get the content 
  * required
  * This may imply or give defaults for the content type and/or rendering.
  * could be js, kql, load data from file
  * may take options, one of which is the explicit content type

`[]` -- denotes rendering
* optional. If omitted, we try to derive the content type from the content and then the default rendering for that content type
* Note that the content may itself literally specify the rendering to use (need to sort out the format there)








Each cell has the notions of `value`, `type`,  `view`
* value is the actual value that is computed/loaded. The content
* type is the content type. MIME-esque () 
* view is the rendering of the value

In theory all are somehow optional. Clearly you can have a value (and content type) without a view. If you have a view, there was a value (and content type) but it may not be surfaced or exposed (e.g., it may be embedded in the view DOM in its rendered form)

See some thoughts from @max
https://gist.github.com/max/738c318b17ea47f5708a53c79493bd29

* Default value renderer (derived from `js`). Content type = JSON
```\`\`\`{javascript(cars)}
cars
\`\`\`
```
This injects code during transpilation that interprets the result and renders accordingly using built-in defaults. This is sort of like the Inspector but more sophiticated.

* same as above but renders inline rather than as a block and names the value `foo`
`{javascript#foo(cars)} cars`

* barchart render of JS computed value
```{javascript(cars)}[barchart(xLabel=year)]
cars   // returns an object (not a DOM)
```
This injects code from the cited extension in to the transpiled JS that takes the computed content result and renders accordingly.


```{kql(libary)}[barchart(xLabel=year)]
// returns an object/table
dataset
| invoke library.query(intersting, parameters)
```


* Dynamic renderer (the code returns a DOM)
```{javascript(cars)}
return timechart(cars,'monthly')   // returns a visual (i.e., DOM element/node)
```

* Dynamic renderer (the code returns a DOM)
```{javascript(cars)}
// returns a value and a visual ( DOM element/node)
return { value: cars, visual: timechart(cars,'monthly') }   
```

```{javascript(bar)}
bar[1].trim().length   // some complex thing to be evaluated server side
```


```{imports}
{ viewof selection as cars } from @d3/brushable-scatterplot 
foo load ./bar.csv                             // relative to this file
fred load <org>/<repo>/path/to/file.json       // absolute on GitHub
test load https://example.com/resource.yaml    // Random file on the web ??
{ regions['east'].orders as data } load <org>/<repo>/path/to/file.json   // extract subset of data from file and give it a name

```

