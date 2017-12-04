/*
 * Copyright (c) 2016-2017 Konstantin Baierer
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
 */

import {HocrParser} from '@/parser'
import Utils from '@/utils'
import HocrjsToolbar from '@/components/hocr-toolbar'

export const defaultConfig = {
    root: 'body',
    debugLevel: 1,
    fonts: {
        'sans-serif': {},
        serif: {},
        monospace: {},
        UnifrakturCook: {cssUrl: 'https://fonts.googleapis.com/css?family=UnifrakturCook:700'},
        UnifrakturMaguntia: {cssUrl: 'https://fonts.googleapis.com/css?family=UnifrakturMaguntia'},
        'Old Standard TT': {cssUrl: 'https://fonts.googleapis.com/css?family=Old+Standard+TT'},
        Cardo: {cssUrl: 'https://fonts.googleapis.com/css?family=Cardo'},
        'Noto Serif': {cssUrl: 'https://fonts.googleapis.com/css?family=Noto+Serif:400,400i,700&subset=latin-ext'},
        'Libre Baskerville': {cssUrl: 'https://fonts.googleapis.com/css?family=Libre+Baskerville:400,400i,700&subset=latin-ext'},
    },
    features: {
        layout: {enabled: true},
        backgroundImage: {enabled: false},
        scaleFont: {
            enabled: false,
            maxFontSize: 128,
            minFontSize: 2,
            wrapClass: 'hocr-viewer-wrap',
        },
        disableEmStrong: {enabled: false},
        contentEditable: {enabled: false},
        tooltips: {
            enabled: true,
            styleId: 'hocr-viewer-tooltip-style',
        },
        transparentText: {enabled: false},
        highlight: {enabled: true},
        highlightNotPage: {enabled: false},
        highlightInline:  {enabled: false},
        highlightLine:    {enabled: false},
        highlightPar:     {enabled: false},
        highlightCarea:   {enabled: false},
    },
    expandToolbar: true,
    enableToolbar: true,
    rootClass: 'hocr-viewer',
}

class HocrjsViewer {
    constructor(config) {
        this.config = defaultConfig
        Object.keys(config || {}).forEach((k) => {
            // TODO proper conifg
            this.config[k] = config[k]
        })
        this.root = this.config.root
        if (typeof this.root === 'string')
            this.root = document.querySelector(this.root)
        this.parser = new HocrParser(this.config)
        Object.keys(this.config.fonts).forEach((font) => {
            let cssUrl = this.config.fonts[font].cssUrl
            if (cssUrl) Utils.addCssFragment('hocr-view-font-styles', `@import "${cssUrl}";\n`)
        })
        this.cache = {
            scaleFont: {}
        }
    }

    log(level, ...args) {
        if (level > this.config.debugLevel) return
        let levelToFn = ['info', 'debug', 'log']
        console[levelToFn[level]](...args)
    }

    findByOcrClass(query) {
        query = (query || {})

        // Expect tag
        query.tag = (query.tag || '*')

        // Arbitrary clauses
        query.clauses = (query.clauses || '')

        // Return only hocr-elements with a bbox
        if (query.title) query.clauses += `[title*="${query.title}"]`

        // Return specific ocr_* / ocrx_* classes
        query.class = (query.class || '')
        if (typeof query.class === 'string') query.class = [query.class]

        // Build querySelectorAll query
        let qs = query.class.map(function(cls) {
            if (cls.indexOf('ocr') === 0) return cls
            if (cls === '') return 'ocr'
            if (cls.indexOf('x_') !== 0) return `ocr_${cls}`
            return `ocr${cls}`
        }).map(function(cls) {
            return `:scope ${query.tag}[class^="${cls}"]${query.clauses}`
        }).join(',')
        this.log(1, "findByOcrClass:", qs)
        let context = (query.context || document.querySelector('.' + this.config.rootClass))
        let set = Array.prototype.slice.call(context.querySelectorAll(qs))

        // terminal: Return only hocr-elements containing no hocr-elements themselves
        // container: Opposite
        if (query.terminal)
            set = set.filter(function(el) {
                if (!el.querySelector('*[class^="ocr"]')) return el
            })
        if (query.container)
            set = set.filter(function(el) {
                if (el.querySelector('*[class^="ocr"]')) return el
            })

        // Arbitrary filter function
        if (query.filter) {
            set = set.filter(query.filter)
        }

        return set
    }

    placeOcrElements() {
        this.findByOcrClass({
            title: 'bbox'
        }).forEach((el) => {
            let coords = this.parser.bbox(el)
            el.style.left = coords[0] + "px"
            el.style.top = coords[1] + "px"
            el.style.width = coords[2] - coords[0] + "px"
            el.style.height = coords[3] - coords[1] + "px"
        })
        let coords = this.parser.bbox(document.querySelector('.ocr_page'))
        document.querySelector('body').style.minHeight = coords[2] + 'px'
    }

    toggleScaleFont(onoff) {
        // wrapper element containing wrappers for font-size expansion
        console.time('toggleScaleFont')
        let wrap = document.querySelector(`.${this.config.features.scaleFont.wrapClass}`)
        if (!wrap) {
            wrap = document.createElement('span')
            wrap.classList.add(this.config.features.scaleFont.wrapClass)
            this.root.appendChild(wrap)
        }
        if (onoff) {
            this.findByOcrClass({terminal: true}).forEach((el) => this.scaleFont(el, wrap))
            // wrap.style.display = 'none'
        } else {
            this.findByOcrClass({terminal: true}).forEach((el) => el.style.fontSize = 'initial')
        }
        console.timeEnd('toggleScaleFont')
    }

    scaleFont(el, wrap) {
        if (el.textContent.trim().length === 0) return
        if (!(el.textContent in this.cache.scaleFont)) {
            // wrap.setAttribute('class', el.getAttribute('class'))
            // wrap.style.width = '100%'
            wrap.style.fontFamily = el.style.fontFamily
            wrap.innerHTML = el.textContent
            let w = 'offsetWidth'
            let h = 'offsetHeight'
            let fontsize = Math.min(el[w], el[h])
            let min = this.config.features.scaleFont.minFontSize
            wrap.style.fontSize = fontsize + 'px'
            if (fontsize > min && wrap[h] > el[h]) {
                fontsize -= wrap[h] - el[h]
                wrap.style.fontSize = fontsize + 'px'
            }
            while (fontsize > min && wrap[w] > el[w]) {
                fontsize -= 1
                wrap.style.fontSize = fontsize + 'px'
            }
            // if (iterations > 1) console.debug(iterations, el.textContent, wrap[h], el[h], wrap[w], el[w])
            this.cache.scaleFont[el.textContent] = fontsize
        }
        el.style.fontSize = this.cache.scaleFont[el.textContent] + 'px'
    }

    toggleTooltips(onoff) {
        let style = document.querySelector('#' + this.config.features.tooltips.styleId)
        if (!onoff) {
            if (style) style.remove()
        } else {
            let ocrClasses = {}
            for (let el of this.findByOcrClass()) {
                ocrClasses[el.getAttribute('class')] = true
            }
            this.log(0, "Detected OCR classes", Object.keys(ocrClasses))
            if (!style) {
                style = document.createElement('style')
                style.setAttribute('id', this.config.features.tooltips.styleId)
            }
            style.appendChild(document.createTextNode(Object.keys(ocrClasses).map((cls) =>
                `.${this.config.rootClass} .${cls}:hover::before { content: "${cls}"; }\n`
            ).join("\n")))
            document.head.appendChild(style)
        }
    }

    toggleBackgroundImage(onoff) {
        let page = this.root.querySelector('.ocr_page')
        if (onoff) {
            this.findByOcrClass({
                title: 'image'
            }).forEach((el) => {
                let imageFile = this.parser.image(el)
                page.style.backgroundImage = `url(${imageFile})`
            })
        } else {
            page.style.backgroundImage = ''
            // delete this.root.style.backgroundImage
        }
    }

    toggleContentEditable(onoff) {
        let onContentEditableInput = (ev) => {
            console.warn("Scaling of contentEditable is broken right now")
            if (this.config.features.scaleFont.enabled) {
                this.scaleFont(ev.target)
                this.findByOcrClass({
                    context: ev.target
                }).forEach((child) => {
                    this.scaleFont(child)
                })
            }
        }
        this.findByOcrClass({
            class: ['line', 'x_word'],
            clauses: '',
        }).forEach((el) => {
            if (onoff) {
                el.setAttribute('contentEditable', 'true')
                el.addEventListener('input', onContentEditableInput)
            } else {
                el.removeAttribute('contentEditable')
                el.removeEventListener('input', onContentEditableInput)
            }
        })
    }

    toggleFeature(feature, onoff) {
        this.root.classList.toggle(`feature-${feature}`, onoff)
        let toggle = 'toggle' + feature.substr(0, 1).toUpperCase() + feature.substring(1)
        if (toggle in this) {
            this.log(0, `Calling this.${toggle}`)
            this[toggle](onoff)
        }
    }

    addToolbar() {
        this.toolbar = this.root.querySelector('hocr-toolbar')
        if (this.toolbar) return
        this.toolbar = new HocrjsToolbar({
          root: document.createElement('div'),
          $parent: this,
          config: this.config
        })
        document.body.appendChild(this.toolbar.dom)
    }

    scaleTo(scaleFactor) {
        let page = this.root.querySelector('.ocr_page')
        let coords = this.parser.bbox(document.querySelector('.ocr_page'))
        if (scaleFactor === 'height') {
            scaleFactor = window.innerHeight / coords[3]
        } else if (scaleFactor === 'width') {
            scaleFactor = window.innerWidth / coords[2]
        } else if (scaleFactor === 'original') {
            scaleFactor = 1
        }
        page.style.transform = `scale(${scaleFactor})`
        page.style.transformOrigin = 'top left'
        this.toolbar.dom.querySelector('span.zoom').innerHTML = Math.floor(scaleFactor * 10000) / 100.0
        // console.log()
    }


    onConfigChange() {
        Object.keys(this.config.features).forEach((feature) => {
            this.toggleFeature(feature, this.config.features[feature].enabled)
        })
    }

    init() {
        this.root.classList.add(this.config.rootClass)

        if (this.config.enableToolbar) {
            this.addToolbar()
        }

        // place the elements on the page
        this.placeOcrElements()

        // Events
        this.onConfigChange()
        window.addEventListener('resize', () => this.onConfigChange())
    }

}

export {HocrjsViewer}