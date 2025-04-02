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
    const footer: string[] = [];
    let currentFile: string = '';
    for (const line of input.toString().split('\n')) {
      const tokens: string[] = line.trim().split(/\s+/);
      if (tokens.length === 0 || tokens[0].trim() === '') {
        continue;
      }

      if (line.includes('errors') && line.includes('warnings')) {
        footer.push(line);
        continue;
      }

      if (tokens[0]?.trim().includes(path.sep) && tokens[0]?.trim().endsWith('.ts')) {
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

    const sortedKeys: string[] = [...ruleToViolationMap.keys()].sort();
    for (const [rule, violations] of sortedKeys.map((key: string): [string, Violation[]] => [
      key,
      ruleToViolationMap.get(key),
    ])) {
      console.log(`Rule: ${rule}, Count: ${violations.length}`);
      console.log('----------------------------------------');
      let fileCount: number = 1;
      // max file count length
      const maxFileCountLength: number = violations.length.toString().length;
      const maxSeverityLength: number = Math.max(
        ...[...ruleToViolationMap.values()].map((violations: Violation[]): number => violations[0]?.severity?.length),
      );
      for (const violation of violations) {
        console.log(
          `${(fileCount++).toString().padStart(maxFileCountLength, ' ')}: ${violation?.severity?.toString().padStart(maxSeverityLength, ' ')}: ${violation.sourceFile}:${violation.lineNumber} : ${violation.message}`,
        );
      }
      console.log('----------------------------------------');
    }

    console.log('\n\n');
    console.log('----------------------------------------');

    const maxCountLength: number = Math.max(
      ...[...ruleToViolationMap.values()].map((violations: Violation[]): number => violations.length.toString().length),
    );
    const maxSeverityLength: number = Math.max(
      ...[...ruleToViolationMap.values()].map((violations: Violation[]): number => violations[0]?.severity?.length),
    );
    for (const [rule, violations] of sortedKeys.map((key: string): [string, Violation[]] => [
      key,
      ruleToViolationMap.get(key),
    ])) {
      console.log(
        `Count: ${violations?.length.toString().padStart(maxCountLength, ' ')}, Severity: ${violations[0]?.severity?.toString().padStart(maxSeverityLength, ' ')}, Rule: ${rule}, `,
      );
    }

    console.log('----------------------------------------');
    console.log('\n\n');

    for (const line of footer) {
      console.log(line);
    }
  }
}

const lintFormatter: LintFormatter = new LintFormatter(process.argv[2]);
lintFormatter.transformOutput();
