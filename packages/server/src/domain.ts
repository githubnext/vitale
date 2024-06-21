import * as Domain from "node:domain";

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

type DomainWithWriters = Domain.Domain & {
  stdoutWrite?: (chunk: Buffer) => void;
  stderrWrite?: (chunk: Buffer) => void;
};

const processWithDomain: typeof process & {
  domain?: DomainWithWriters;
} = process;

process.stdout.write = (chunk, ...args) => {
  if (processWithDomain.domain && processWithDomain.domain.stdoutWrite) {
    // @ts-ignore
    processWithDomain.domain.stdoutWrite(Buffer.from(chunk));
  }
  // @ts-ignore
  return originalStdoutWrite(chunk, ...args);
};

process.stderr.write = (chunk, ...args) => {
  if (processWithDomain.domain && processWithDomain.domain.stderrWrite) {
    // @ts-ignore
    processWithDomain.domain.stderrWrite(Buffer.from(chunk));
  }
  // @ts-ignore
  return originalStderrWrite(chunk, ...args);
};

export function createDomain(
  stdoutWrite: (chunk: Buffer) => void,
  stderrWrite: (chunk: Buffer) => void
): DomainWithWriters {
  const domain: DomainWithWriters = Domain.create();
  domain.stdoutWrite = stdoutWrite;
  domain.stderrWrite = stderrWrite;
  return domain;
}
