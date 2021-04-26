# Excel

Install this renderer by adding the following (customized) config file to the appropriate location: 

**.github/render/application/vnd.openxmlformats-officedocument.spreadsheetml.sheet/extension.yaml**
```yaml
name: Excel spreadsheet rendering
description: Render XLSX files
render:
  file:
    uses: app-extensions/extendo-renderers/xlsx/xlsx.js
```

There are currently no configuration inputs for this renderer.