// https://github.com/maximilianschmitt/cssman/blob/3cebbd8e83fa23c779870aa4b97fbc2e8b3e95cd/main.js
// it is modified though to be a single function (used functions are inlined etc)

/*
 * Copyright (C) 2015 Pavel Savshenko
 * Copyright (C) 2011 Google Inc.  All rights reserved.
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008 Matt Lilek <webkit@mattlilek.com>
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

module.exports = (node, optimized) => {
  function DOMNodePathStep(value, isOptimized = false) {
    this.value = value
    this.optimized = isOptimized
  }
  DOMNodePathStep.prototype.toString = function toString() {
    return this.value
  }

  // eslint-disable-next-line no-shadow
  const _cssPathStep = (node, optimized, isTargetNode) => {
    const prefixedElementClassNames = nodeElement => {
      const classAttribute = nodeElement.getAttribute('class')
      if (!classAttribute) return []

      return classAttribute
        .split(/\s+/g)
        .filter(Boolean)
        .map(name => {
          // The prefix is required to store "__proto__" in a object-based map.
          return '$' + name
        })
    }

    const isCSSIdentChar = c => {
      if (/[a-zA-Z0-9_-]/.test(c)) return true
      return c.charCodeAt(0) >= 0xa0
    }

    const isCSSIdentifier = value => /^-?[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value)

    const toHexByte = char => {
      let hexByte = char.charCodeAt(0).toString(16)
      if (hexByte.length === 1) hexByte = '0' + hexByte
      return hexByte
    }

    const escapeAsciiChar = (char, isLast) => '\\' + toHexByte(char) + (isLast ? '' : ' ')

    const escapeIdentifierIfNeeded = ident => {
      if (isCSSIdentifier(ident)) return ident
      const shouldEscapeFirst = /^(?:[0-9]|-[0-9-]?)/.test(ident)
      const lastIndex = ident.length - 1
      return ident.replace(/./g, (c, i) => {
        return (shouldEscapeFirst && i === 0) || !isCSSIdentChar(c) ? escapeAsciiChar(c, i === lastIndex) : c
      })
    }

    const idSelector = id => '#' + escapeIdentifierIfNeeded(id)

    if (node.nodeType !== Node.ELEMENT_NODE) return null

    const id = node.getAttribute('id')
    if (optimized) {
      if (id) return new DOMNodePathStep(idSelector(id), true)
      const nodeNameLower = node.nodeName.toLowerCase()
      if (nodeNameLower === 'body' || nodeNameLower === 'head' || nodeNameLower === 'html') {
        return new DOMNodePathStep(node.nodeName.toLowerCase(), true)
      }
    }
    const nodeName = node.nodeName.toLowerCase()

    if (id) return new DOMNodePathStep(nodeName.toLowerCase() + idSelector(id), true)
    const parent = node.parentNode
    if (!parent || parent.nodeType === Node.DOCUMENT_NODE) return new DOMNodePathStep(nodeName.toLowerCase(), true)

    const prefixedOwnClassNamesArray = prefixedElementClassNames(node)
    let needsClassNames = false
    let needsNthChild = false
    let ownIndex = -1
    const siblings = parent.children
    for (let i = 0; (ownIndex === -1 || !needsNthChild) && i < siblings.length; ++i) {
      const sibling = siblings[i]
      if (sibling === node) {
        ownIndex = i
        continue
      }
      if (needsNthChild) continue
      if (sibling.nodeName.toLowerCase() !== nodeName.toLowerCase()) continue

      needsClassNames = true
      const ownClassNames = prefixedOwnClassNamesArray
      let ownClassNameCount = 0

      // eslint-disable-next-line guard-for-in
      for (const name in ownClassNames) ++ownClassNameCount
      if (ownClassNameCount === 0) {
        needsNthChild = true
        continue
      }
      const siblingClassNamesArray = prefixedElementClassNames(sibling)
      for (let j = 0; j < siblingClassNamesArray.length; ++j) {
        const siblingClass = siblingClassNamesArray[j]
        if (ownClassNames.indexOf(siblingClass)) continue
        delete ownClassNames[siblingClass]
        if (!--ownClassNameCount) {
          needsNthChild = true
          break
        }
      }
    }

    let result = nodeName.toLowerCase()
    if (
      isTargetNode &&
      nodeName.toLowerCase() === 'input' &&
      node.getAttribute('type') &&
      !node.getAttribute('id') &&
      !node.getAttribute('class')
    ) {
      result += '[type="' + node.getAttribute('type') + '"]'
    }
    if (needsNthChild) {
      result += ':nth-child(' + (ownIndex + 1) + ')'
    } else if (needsClassNames) {
      // for (var prefixedName in prefixedOwnClassNamesArray.keySet())
      // eslint-disable-next-line guard-for-in
      for (const prefixedName in prefixedOwnClassNamesArray) {
        result += '.' + escapeIdentifierIfNeeded(prefixedOwnClassNamesArray[prefixedName].substr(1))
      }
    }

    return new DOMNodePathStep(result, false)
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const steps = []
  let contextNode = node
  while (contextNode) {
    const step = _cssPathStep(contextNode, !!optimized, contextNode === node)
    if (!step) break // Error - bail out early.
    steps.push(step)
    if (step.optimized) break
    contextNode = contextNode.parentNode
  }
  steps.reverse()
  return steps.join(' > ')
}
