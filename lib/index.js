const puppeteer = require('puppeteer')
const { dirname } = require('path')
const cssPath = require('./cssPath')
const flatten = require('lodash/fp/flatten')
const map = require('lodash/fp/map')
const merge = require('lodash/fp/merge')
const uniq = require('lodash/fp/uniq')

const getFreshPage = async (browser, url) => {
  const page = await browser.newPage()
  await page.goto(url)
  return page
}

const getDir = async (page, componentName) => {
  const pathHandle = await page.$(`#${componentName}-container > header > :last-child`)
  return dirname(await page.evaluate(handle => handle.textContent, pathHandle))
}

const getSelector = async page => {
  const [, handle] = await page.$$('[data-reactroot]')
  return page.evaluate(cssPath, handle)
}

const getTitle = async (page, handle) =>
  page.evaluate(element => {
    const exampleRootElement = element.parentElement.parentElement.parentElement.parentElement
    let elementIndex = 0
    for (const childNode of exampleRootElement.parentElement.childNodes) {
      if (childNode === exampleRootElement) {
        break
      }
      elementIndex++
    }
    return exampleRootElement.parentElement.childNodes[elementIndex - 1].textContent
  }, handle)

const getUrl = async (page, handle) =>
  page.evaluate(element => {
    const previewElement = element.parentElement.parentElement.parentElement

    let elementIndex = 0
    for (const childNode of previewElement.parentElement.childNodes) {
      if (childNode === previewElement) {
        break
      }
      elementIndex++
    }

    const controlsElement = previewElement.parentElement.childNodes[elementIndex + 1]
    return controlsElement.querySelector('a').href
  }, handle)

const scrapeExamples = (browser, page) => async handle => {
  const [title, url] = await Promise.all([getTitle(page, handle), getUrl(page, handle)])
  const singleExamplePage = await getFreshPage(browser, url)
  return { title, url, selector: await getSelector(singleExamplePage) }
}

const scrapeComponent = (browser, styleguideUrl) => async componentName => {
  const pageAddress = `${styleguideUrl}/#!/${componentName}`
  const page = await getFreshPage(browser, pageAddress)
  // 1st element is the root of the styleguide itself
  const dir = await getDir(page, componentName)
  const [, ...exampleHandles] = await page.$$('[data-reactroot]')
  const examples = await Promise.all(exampleHandles.map(scrapeExamples(browser, page)))
  return map(merge({ component: componentName, dir }), examples)
}

module.exports = async styleguideUrl => {
  const browser = await puppeteer.launch()
  const page = await getFreshPage(browser, styleguideUrl)
  const componentNames = uniq(
    await page.$$eval('[data-preview]', elements => elements.map(element => element.dataset.preview))
  )
  const componentsData = flatten(await Promise.all(componentNames.map(scrapeComponent(browser, styleguideUrl))))
  await browser.close()
  return componentsData
}
