// SPDX-License-Identifier: Apache-2.0

import * as assert from 'node:assert';
import {existsSync} from 'node:fs';
import {readFileSync} from 'node:fs';
import path from 'node:path';

type Violation = {
  lineNumber: string;
  severity: string;
  message: string;
  rule: string;
  sourceFile: string;
};

class LintFormatter {
  public constructor(private readonly inputFile: string) {
    if (!existsSync(inputFile)) {
      assert.fail(`Input file does not exist: ${inputFile}`);
    }
  }

  public transformOutput(): void {
    const input: Buffer = readFileSync(this.inputFile);
    const ruleToViolationMap: Map<string, Violation[]> = new Map();
    let currentFile: string = '';
    for (const line of input.toString().split('\n')) {
      const tokens: string[] = line.trim().split(/\s+/);
      if (tokens.length === 0) {
        continue;
      }
      if (line.includes('errors') && line.includes('warnings')) {
        continue;
      }

      if (tokens[0].includes(path.sep) && tokens[0].endsWith('.ts')) {
        currentFile = tokens[0];
        continue;
      }
      const lineNumber: string = tokens[0];
      const severity: string = tokens[1];
      const message: string = tokens.slice(2, -1).join(' ');
      const rule: string = tokens.at(-1);
      const violationArray: Violation[] | undefined = ruleToViolationMap.get(rule);
      const violation: Violation = {
        lineNumber,
        severity,
        message,
        rule,
        sourceFile: currentFile,
      };
      if (violationArray === undefined) {
        ruleToViolationMap.set(rule, [violation]);
      } else {
        violationArray.push(violation);
        ruleToViolationMap.set(rule, violationArray);
      }
    }

    for (const [rule, violations] of ruleToViolationMap.entries()) {
      console.log(`Rule: ${rule}, Count: ${violations.length}`);
      console.log('----------------------------------------');
      let fileCount: number = 1;
      for (const violation of violations) {
        console.log(
          `${fileCount++}:${violation.severity}: ${violation.sourceFile}:${violation.lineNumber}: ${violation.message}`,
        );
      }
      console.log('----------------------------------------');
    }

    for (const [rule, violations] of ruleToViolationMap.entries()) {
      console.log(`Count: ${violations.length}, Severity: ${violations[0].severity}, Rule: ${rule}, `);
    }
  }
}

const lintFormatter: LintFormatter = new LintFormatter(process.argv[2]);
lintFormatter.transformOutput();
