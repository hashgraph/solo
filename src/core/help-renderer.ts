// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type SoloLogger} from './logging.js';
import {patchInject} from './dependency-injection/container-helper.js';

@injectable()
export class HelpRenderer {
  constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  private splitAtClosestWhitespace(input: string, maxLength: number = 120): [string, string] {
    if (input.length <= maxLength) {
      return [input, ''];
    }

    const splitIndex = input.lastIndexOf(' ', maxLength);
    if (splitIndex === -1) {
      return [input, ''];
    }

    return [input.substring(0, splitIndex), input.substring(splitIndex + 1)];
  }

  public render(rootCmd: any, rawHelp: string) {
    const splittingString = 'Options:\n';
    const splitOutput = rawHelp.split(splittingString);
    if (splitOutput.length < 2) {
      this.logger.showUser(rawHelp);
      return;
    }

    let finalOutput = splitOutput[0] + splittingString;
    let lines = splitOutput[1].split('\n');
    lines = lines.map(line => line.replace(/^\s+/, ''));

    const table = [];
    for (const line of lines) {
      let columns = line.split(/(--[1-9a-zA-Z|-]+)/);
      const desciptors = columns[2].split(/(\[.+])/);
      columns[2] = desciptors[0];
      columns[3] = desciptors[1] || '';
      columns = columns.map(column => column.trim());
      table.push(columns);
    }

    // apply sorting
    table.sort((row1, row2) => {
      return row1[1].localeCompare(row2[1]);
    });

    const requiredTable = table.filter(row => row[3].includes('required'));
    const optionalTable = table.filter(row => !row[3].includes('required'));
    const sortedTable = requiredTable.concat(optionalTable);

    const columnMaxLengths = [0, 0, 0, 0];
    for (const row of sortedTable) {
      for (let i = 0; i < row.length; i++) {
        columnMaxLengths[i] = Math.max(columnMaxLengths[i], row[i].length);
      }
    }

    // wrap the description column at the wrapping point
    const terminalWidth = rootCmd.terminalWidth();
    let wrap = terminalWidth - columnMaxLengths[0] - columnMaxLengths[1] - columnMaxLengths[3] - 6;
    if (wrap < 30) wrap = 30; // set min and max values
    if (wrap > 70) wrap = 70;
    if (columnMaxLengths[2] < wrap) wrap = columnMaxLengths[2];
    else columnMaxLengths[2] = wrap;
    const wrappedTable = [];
    for (const row of sortedTable) {
      if (row[2].length > wrap) {
        const description = row[2];
        let splitDescription = this.splitAtClosestWhitespace(description, wrap);
        wrappedTable.push([row[0], row[1], splitDescription[0], row[3]]);
        while (splitDescription[1] && splitDescription[1].length > 0) {
          splitDescription = this.splitAtClosestWhitespace(splitDescription[1], wrap);
          wrappedTable.push(['', '', splitDescription[0], '']);
        }
      } else {
        wrappedTable.push(row);
      }
    }

    const outputLines = [];
    for (const row of wrappedTable) {
      const line = [];
      for (let i = 0; i < row.length; i++) {
        line.push(row[i].padEnd(columnMaxLengths[i]));
      }
      outputLines.push(line.join('  '));
    }

    finalOutput += '\n';
    finalOutput += outputLines.join('\n');
    finalOutput += '\n';
    this.logger.showUser(finalOutput);
  }
}
