'use strict'

const { name: packageName } = require('../package.json')
const fs = require('fs')
const crypto = require('crypto')
const { promises: fsp } = fs
const LazyReadable = require('./lazy-readable')
const MultiFileReadStream = require('./multi-file-read-stream')
const ospath = require('path')
const template = require('./template')

function register({ config: { rows, cols, autoPlay, ...unknownOptions } }) {
  const logger = this.getLogger(packageName)

  if (Object.keys(unknownOptions).length) {
    const keys = Object.keys(unknownOptions)
    throw new Error(`Unrecognized option${keys.length > 1 ? 's' : ''} specified for ${packageName}: ${keys.join(', ')}`)
  }

  const defaultOptions = { rows, cols, autoPlay }

  this.on('uiLoaded', async ({ playbook, uiCatalog }) => {
    playbook.env.SITE_ASCIINEMA_PROVIDER = 'asciinema'
    const uiOutputDir = playbook.ui.outputDir
    // vendorJsFile(uiCatalog, logger, uiOutputDir, 'lunr/lunr.min.js', 'lunr.js')
    assetFile(uiCatalog, logger, uiOutputDir, 'css', 'asciinema-player.css')
    assetFile(uiCatalog, logger, uiOutputDir, 'js', 'asciinema-player.min.js')

    const asciinemaScriptsPartialPath = 'partials/asciinema-scripts.hbs'
    if (!uiCatalog.findByType('partial').some(({ path }) => path === asciinemaScriptsPartialPath)) {
      const asciinemaScriptsPartialFilepath = ospath.join(__dirname, '../data', asciinemaScriptsPartialPath)
      uiCatalog.addFile({
        contents: Buffer.from(template(await fsp.readFile(asciinemaScriptsPartialFilepath, 'utf8'), {  })),
        path: asciinemaScriptsPartialPath,
        stem: 'asciinema-scripts',
        type: 'partial',
      })
    }

    const asciinemaStylesPartialPath = 'partials/asciinema-styles.hbs'
    if (!uiCatalog.findByType('partial').some(({ path }) => path === asciinemaStylesPartialPath)) {
      const asciinemaStylesPartialFilepath = ospath.join(__dirname, '../data', asciinemaStylesPartialPath)
      uiCatalog.addFile({
        contents: Buffer.from(template(await fsp.readFile(asciinemaStylesPartialFilepath, 'utf8'), {  })),
        path: asciinemaStylesPartialPath,
        stem: 'asciinema-styles',
        type: 'partial',
      })
    }

  })

  this.on('contentClassified', async ({ siteAsciiDocConfig, uiCatalog }) => {
    if (!siteAsciiDocConfig.extensions) siteAsciiDocConfig.extensions = []
    siteAsciiDocConfig.extensions.push({
        register: (registry, _context) => {
            registry.block("asciinema", processAsciinemaBlock3(uiCatalog, defaultOptions))
            // registry.block("asciinema", processAsciinemaBlock)
            return registry
        }
    })
  });
}

function processAsciinemaBlock3(uiCatalog, defaultOptions) {
  return function () {
    // console.log("xxx")
    this.onContext(['listing', 'literal'])
    this.positionalAttributes(['target', 'format'])
    this.process((parent, reader, attrs) => {
        const source = reader.getLines().join('\n');
        return toBlock(attrs, parent, source, this, uiCatalog, defaultOptions)
    })
  }
};

const toBlock = (attrs, parent, source, context, uiCatalog, defaultOptions) => {
    if (typeof attrs === 'object' && '$$smap' in attrs) {
        attrs = fromHash(attrs)
    }
    const doc = parent.getDocument()
    const subs = attrs.subs
    if (subs) {
        source = doc.$apply_subs(attrs.subs, doc.$resolve_subs(subs))
    }
    const idAttr = attrs.id ? ` id="${attrs.id}"` : ''
    const classAttr = attrs.role ? `${attrs.role} videoblock` : `videoblock`

    const block = context.$create_pass_block(
        parent,
        '',
        Opal.hash(attrs));

    const title = attrs.title
    if (title) {
        block.title = title
        delete block.caption
        const caption = attrs.caption
        delete attrs.caption
        block.assignCaption(caption, 'figure')
    }

    // const xxx = require('crypto').createHash('md5').update(source, 'utf8').digest('hex');
    const xxx = crypto.createHash('md5').update(source, 'utf8').digest('hex');

    uiCatalog.addFile({
      contents: Buffer.from(source),
      path: xxx,
      type: 'asset',
      out: { dirname: 'xxx', path: 'xxx' + '/' + xxx, basename: xxx },
    })

    const ooo = JSON.stringify(buildOptions(attrs, defaultOptions));

    const titleElement = title ? `<div class="title">${block.caption}${title}</div>` : ''
    const style = `${Object.hasOwn(attrs, 'width') ? `width: ${attrs.width}px;` : ''} ${Object.hasOwn(attrs, 'height') ? `height: ${attrs.height}px;` : ''}`
    block.lines = [
      `<div${idAttr} class="${classAttr}">`,
      `<div class="content"><div id="${xxx}" style="${style}"></div></div>`,
      `${titleElement}</div>`,
      `<script>AsciinemaPlayer.create('./xxx/${xxx}', document.getElementById('${xxx}'), ${ooo})</script>`
    ]
    return block
}

function buildOptions(attrs, defaultOptions) {
  const options = {}
  const rows = attrs.rows ? attrs.rows : defaultOptions.rows
  if (rows) {
    options['rows'] = rows
  }
  const cols = attrs.cols ? attrs.cols : defaultOptions.cols
  if (cols) {
    options['cols'] = cols
  }
  const autoPlay = attrs.autoPlay ? attrs.autoPlay : defaultOptions.autoPlay
  if (autoPlay) {
    options['autoPlay'] = autoPlay
  }
  return options
}


function assetFile (
  uiCatalog,
  logger,
  uiOutputDir,
  assetDir,
  basename,
  assetPath = assetDir + '/' + basename,
  contents = new LazyReadable(() => fs.createReadStream(ospath.join(__dirname, '../data', assetPath))),
  overwrite = false
) {
  const outputDir = uiOutputDir + '/' + assetDir
  const existingFile = uiCatalog.findByType('asset').some(({ path }) => path === assetPath)
  if (existingFile) {
    if (overwrite) {
      logger.warn(`Please remove the following file from your UI since it is managed by ${packageName}: ${assetPath}`)
      existingFile.contents = contents
      delete existingFile.stat
    } else {
      logger.info(`The following file already exists in your UI: ${assetPath}, skipping`)
    }
  } else {
    uiCatalog.addFile({
      contents,
      type: 'asset',
      path: assetPath,
      out: { dirname: outputDir, path: outputDir + '/' + basename, basename },
    })
  }
}

function vendorJsFile (uiCatalog, logger, uiOutputDir, requireRequest, basename = requireRequest.split('/').pop()) {
  let contents
  if (Array.isArray(requireRequest)) {
    const filepaths = requireRequest.map(require.resolve)
    contents = new LazyReadable(() => new MultiFileReadStream(filepaths))
  } else {
    const filepath = require.resolve(requireRequest)
    contents = new LazyReadable(() => fs.createReadStream(filepath))
  }
  const jsVendorDir = 'js/vendor'
  assetFile(uiCatalog, logger, uiOutputDir, jsVendorDir, basename, jsVendorDir + '/' + basename, contents)
}

module.exports = { register }
