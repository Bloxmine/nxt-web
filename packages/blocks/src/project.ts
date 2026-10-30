import type { Program } from './model.js';

/** Identifies a saved project file. */
export const PROJECT_FORMAT = 'nxt-web-studio-project';
/** Current project file version. Bump and add a migration when the model changes. */
export const PROJECT_VERSION = 1;
/** File extension for saved projects. */
export const PROJECT_EXTENSION = '.nxtproj.json';

/** A saved project: one program plus metadata. */
export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  program: Program;
}

/** Creates an empty program. */
export function emptyProgram(name = 'Untitled-1'): Program {
  return {
    name,
    variables: [{ name: 'Number 1', type: 'number' }],
    myBlocks: [],
    body: [],
    parallel: [],
    wires: [],
    comments: [],
  };
}

/** Serialises a program to the project file format. */
export function serializeProject(program: Program, savedAt = new Date().toISOString()): string {
  const file: ProjectFile = { format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt, program };
  return JSON.stringify(file, null, 2);
}

/** Thrown when a file is not a valid project. */
export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

/** Parses a project file. Throws {@link ProjectFormatError} with a readable message. */
export function parseProject(text: string): Program {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFormatError('This file is not a project (it is not valid JSON).');
  }
  if (!isRecord(data) || data['format'] !== PROJECT_FORMAT) {
    throw new ProjectFormatError('This file is not an NXT Web Studio project.');
  }
  const version = data['version'];
  if (typeof version !== 'number' || version > PROJECT_VERSION) {
    throw new ProjectFormatError('This project was made with a newer version of NXT Web Studio.');
  }
  const program = data['program'];
  if (
    !isRecord(program) ||
    typeof program['name'] !== 'string' ||
    !Array.isArray(program['body']) ||
    !Array.isArray(program['variables']) ||
    !Array.isArray(program['myBlocks'])
  ) {
    throw new ProjectFormatError('The project file is damaged: the program is missing.');
  }
  return normalizeProgram(program as unknown as Program);
}

/** Fills in fields added after a project was saved (parallel beams, wires). */
export function normalizeProgram(program: Program): Program {
  return {
    ...program,
    parallel: Array.isArray(program.parallel) ? program.parallel : [],
    wires: Array.isArray(program.wires) ? program.wires : [],
    comments: Array.isArray(program.comments) ? program.comments : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
