# Live Markdown demo script

With all the recent work investigating user-defined rendering on GitHub, markdown files started to look a lot like "notebooks" (ala Jupyter and R) -- some amount of user prose with accompanying computed and interestingly rendered content. Really this work has been making the markdown documents "live".

To explore this "Live Markdown" idea further, I looked at a few approaches and dove deep with the tech from Observable. 

> show observable Five minute doc, talk about cells and execution order

The story looks great and has a compelling user experience.

> show the code for observable notebook

But under the covers an Observable Notebook is actually a JS function that constructs the document from a set of chunks, and then an "Inspector" that converts the chunks into DOM elements.

This is less than optimal: 
* Writing JS is not very approachable
* This doesn't match our notion of markdown surfaces across GitHub
* Despite being text the notebooks don't really diff well 

> Show the live markdown version

To address these issues I mapped this onto a markdown syntax similar to what I used in the rendering extensibility demos. This is the exact same content phrases as Markdown-with-code-chunks rather than code-with-markdown-expressions. I wrote a little translator from this live md to observable notebook and then run it with the Observable runtime/inspector.

> show rendered live markdown
This is the simple rendering by the default Inspector 

Some cool things to note:
* Like a spreadsheet, cells can be evaluated in any order
* modularity is supported
  * One markdown file can refer to cells from another. Here the car scatter plot actually comes from this other versioned scatter.md file
  * authors can `require` modules. For example, `d3` is used in several places and required into the running browser
* data can be loaded from (potentially versioned) files
  * the cars data here is in a csv in the repo 
  * the country info from a random file on the web)
* live and interactive. authors can use and link standard inputs to their live content (for example, 
  * this slider value is reflected elsewhere, 
  * brushing this scatter plot causes the selected values to show up elsewhere)
* programming model
  * async/promises and generators are possible


Still some quirks but using the Observable runtime addresses a couple of the major problem points around notebooks in general

* Modularity/versioning/setup/testing
* Execution order

Not everytihng is done
* editing - most noticeable is the lack of an editing experience
* rendering - we also need to integrate the extensible rendering approach 
* remote compute - and we need a paved path for calling server side compute for cell values (e.g., kql, sql, r, python, ...)
* security model -- a big part of the power is being able to require modules from the web. That may not jive well with our security model

This direction looks interesting and is super-powerful. It may ultimately be too powerful and we may need to tone it down for normal consumption. Either way, it seems worth investigating further.