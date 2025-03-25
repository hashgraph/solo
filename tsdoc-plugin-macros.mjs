// SPDX-License-Identifier: Apache-2.0

// eslint-disable-next-line n/no-unpublished-import
import {Converter} from 'typedoc';

/**
 * Dictionary of macros. Define reusable text blocks here.
 */
const MACROS = {
  DNS_1123_LABEL:
    'A valid RFC-1123 DNS label consists of the following:\n' +
    '- The first character must be a-z or 0-9\n' +
    '- The middle part can contain a-z, 0-9, or -\n' +
    '- The last character must be a-z or 0-9\n' +
    '- The total length must not exceed 63 characters\n',
};

/**
 * TypeDoc Plugin: Macro Processor for TSDoc
 */
export function load(app) {
  app.converter.on(Converter.EVENT_RESOLVE, (context, reflection) => {
    if (reflection.comment) {
      replaceMacrosInComment(reflection, app);
    }
  });
}

/**
 * Replaces @include references with predefined text.
 */
function replaceMacrosInComment(reflection, app) {
  if (reflection.comment.blockTags) {
    for (let i = 0; i < reflection.comment.blockTags.length; i++) {
      if (reflection.comment.blockTags[i].tag === '@include') {
        const replacementText = replaceMacros(reflection.comment.blockTags[i].content[0].text, reflection, app);
        if (replacementText) {
          reflection.comment.blockTags[i].content[0].text = replacementText;
        }
        console.log(' reflection.comment.summary[0]: ', reflection.comment.summary[0]);
        if (!reflection.comment.summary) {
          reflection.comment.summary = [];
        }
        if (!reflection.comment.summary[0]) {
          reflection.comment.summary.push({kind: 'text', text: ''});
        }
        reflection.comment.summary[0].text = reflection.comment.summary[0]?.text
          ? `${reflection.comment.summary[0].text}\n${reflection.comment.blockTags[i].content[0].text}`
          : `${reflection.comment.blockTags[i].content[0].text}`;
        reflection.comment.blockTags.splice(i, 1);
        i--;
      }
    }
  }
}

function replaceMacros(macroName, reflection, app) {
  if (MACROS[macroName]) {
    return MACROS[macroName];
  }
  app.logger.error(`Unknown macro: ${macroName}, reflection.sources: ${JSON.stringify(reflection.sources, null, 2)}`);
  return `/* Unknown macro: ${macroName} */`;
}
