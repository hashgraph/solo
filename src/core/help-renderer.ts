// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {patchInject} from './dependency-injection/container-helper.js';

type Table = string[][];

@injectable()
export class HelpRenderer {
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  private splitAtClosestWhitespace(input: string, maxLength: number = 120): [string, string] {
    if (input.length <= maxLength) {
      return [input, ''];
    }

    const splitIndex: number = input.lastIndexOf(' ', maxLength);
    if (splitIndex === -1) {
      return [input, ''];
    }

    return [input.substring(0, splitIndex), input.substring(splitIndex + 1)];
  }

  private createFlagsTable(lines: string[]): Table {
    const table: Table = [];
    for (const line of lines) {
      let columns: string[] = line.split(/(--[1-9a-zA-Z|-]+)/);

      // if the description contains --flag there will be more than the expected amount of columns
      // joins all columns after columns[2]
      if (columns.length > 3) {
        const firstPart: string[] = columns.slice(0, 2);
        const secondPart: string = columns.slice(2).join(' ');
        columns = [...firstPart, secondPart];
      }

      const descriptions: string[] = columns[2].split(/(\[.+])/);
      columns[2] = descriptions[0];
      columns[3] = descriptions[1] || '';
      columns = columns.map((column: string): string => column.trim());
      table.push(columns);
    }

    return table;
  }

  private sortFlagsTable(table: Table): Table {
    table.sort((row1: string[], row2: string[]) => {
      return row1[1].localeCompare(row2[1]);
    });

    const requiredTable: Table = table.filter((row: string[]): boolean => row[3].includes('required'));
    const optionalTable: Table = table.filter((row: string[]): boolean => !row[3].includes('required'));
    return requiredTable.concat(optionalTable);
  }

  private calculateMaxColumnLengths(table: Table): number[] {
    const columnMaxLengths: number[] = [0, 0, 0, 0];
    for (const row of table) {
      for (const [index, element] of row.entries()) {
        columnMaxLengths[index] = Math.max(columnMaxLengths[index], element.length);
      }
    }

    return columnMaxLengths;
  }

  private wrapFlagsTable(table: Table, columnMaxLengths: number[], wrap: number): Table {
    const wrappedTable: Table = [];
    for (const row of table) {
      if (row[2].length > wrap) {
        const description: string = row[2];
        let splitDescription: [string, string] = this.splitAtClosestWhitespace(description, wrap);
        wrappedTable.push([row[0], row[1], splitDescription[0], row[3]]);
        while (splitDescription[1] && splitDescription[1].length > 0) {
          splitDescription = this.splitAtClosestWhitespace(splitDescription[1], wrap);
          wrappedTable.push(['', '', splitDescription[0], '']);
        }
      } else {
        wrappedTable.push(row);
      }
    }

    return wrappedTable;
  }

  private getDescriptionWrap(terminalWidth: number, columnMaxLengths: number[]): number {
    let wrap: number = terminalWidth - columnMaxLengths[0] - columnMaxLengths[1] - columnMaxLengths[3] - 6;
    if (wrap < 30) {
      wrap = 30;
    } // set min and max values
    if (wrap > 70) {
      wrap = 70;
    }
    if (columnMaxLengths[2] < wrap) {
      wrap = columnMaxLengths[2];
    } else {
      columnMaxLengths[2] = wrap;
    }
    return wrap;
  }

  private addColumnPadding(table: Table, columnMaxLengths: number[]): string[] {
    const outputLines: string[] = [];
    for (const row of table) {
      const line: string[] = [];
      for (const [index, element] of row.entries()) {
        line.push(element.padEnd(columnMaxLengths[index]));
      }
      outputLines.push(line.join('  '));
    }

    return outputLines;
  }

  public render(rootCmd: any, rawHelp: string): void {
    const splittingString: string = 'Options:\n';
    const splitOutput: string[] = rawHelp.split(splittingString);
    if (splitOutput.length < 2) {
      this.logger.showUser(rawHelp);
      return;
    }

    let finalOutput: string = splitOutput[0] + splittingString;
    let lines: string[] = splitOutput[1].split('\n');
    lines = lines.map((line: string): string => line.replace(/^\s+/, ''));

    // Formatting for flag options
    const table: Table = this.createFlagsTable(lines);

    // apply sorting
    const sortedTable: Table = this.sortFlagsTable(table);

    const columnMaxLengths: number[] = this.calculateMaxColumnLengths(sortedTable);

    // wrap the description column at the wrapping point
    const terminalWidth: number = rootCmd.terminalWidth();
    const wrap: number = this.getDescriptionWrap(terminalWidth, columnMaxLengths);

    const wrappedTable = this.wrapFlagsTable(sortedTable, columnMaxLengths, wrap);
    const outputLines = this.addColumnPadding(wrappedTable, columnMaxLengths);

    finalOutput += '\n';
    finalOutput += outputLines.join('\n');
    finalOutput += '\n';
    this.logger.showUser(finalOutput);
  }
}
