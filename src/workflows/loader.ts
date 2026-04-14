import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import type { WorkflowManifest, LoadedWorkflow, WorkflowFactory } from './types.js';

// Source workflows directory (used in development and for module imports)
const SOURCE_WORKFLOWS_DIR = join(process.cwd(), 'src', 'workflows');

const REQUIRED_FIELDS: (keyof WorkflowManifest)[] = [
  'id',
  'name',
  'description',
  'version',
  'acceptsFiles',
];

let workflowsCache: Map<string, LoadedWorkflow> | null = null;
let _workflowsDir = SOURCE_WORKFLOWS_DIR;

/**
 * Internal: set a custom workflows directory (for testing only).
 */
export function _setWorkflowsDir(dir: string): void {
  _workflowsDir = dir;
}

/**
 * Discover skill directories within a workflow folder.
 * Looks for subdirectories containing a SKILL.md file.
 * Returns absolute paths for runtime use.
 */
export function discoverSkills(workflowFolderPath: string): string[] {
  const skillsPath = join(workflowFolderPath, 'skills');
  const skills: string[] = [];

  try {
    if (!statSync(skillsPath).isDirectory()) {
      return skills;
    }

    const entries = readdirSync(skillsPath);
    for (const entry of entries) {
      const skillPath = join(skillsPath, entry);
      const skillMdPath = join(skillPath, 'SKILL.md');

      try {
        if (statSync(skillPath).isDirectory() && statSync(skillMdPath).isFile()) {
          // Return absolute path for runtime use
          skills.push(skillPath);
        }
      } catch {
        // Skip entries without SKILL.md or that aren't directories
      }
    }
  } catch {
    // No skills directory exists
  }

  return skills;
}

export function validateManifest(
  manifest: unknown,
  folderName: string
): manifest is WorkflowManifest {
  if (typeof manifest !== 'object' || manifest === null) {
    return false;
  }

  const m = manifest as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (m[field] === undefined || m[field] === null) {
      console.warn(
        `[WorkflowLoader] Skipping "${folderName}": missing required field "${field}"`
      );
      return false;
    }
  }

  if (typeof m.id !== 'string' || m.id !== folderName) {
    console.warn(
      `[WorkflowLoader] Skipping "${folderName}": manifest.id "${m.id}" does not match folder name`
    );
    return false;
  }

  return true;
}

// Workflow module type for static imports
interface WorkflowModule {
  default: WorkflowFactory;
}

// Static import map — add new workflows here for Next.js compatibility.
// Each entry maps a folder name to a dynamic import() call that Next.js
// can statically analyze.
const WORKFLOW_IMPORTS: Record<string, () => Promise<WorkflowModule>> = {
  _example: () => import('./_example/index'),
  'code-review': () => import('./code-review/index'),
};

async function loadWorkflow(folderName: string): Promise<LoadedWorkflow | null> {
  try {
    const folderPath = join(_workflowsDir, folderName);
    const folderStat = statSync(folderPath);
    if (!folderStat.isDirectory()) return null;

    const manifestPath = join(folderPath, 'manifest.json');
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    const manifest: unknown = JSON.parse(manifestContent);

    if (!validateManifest(manifest, folderName)) {
      return null;
    }

    // Use the static import map for Next.js compatibility
    const importFn = WORKFLOW_IMPORTS[folderName];
    if (!importFn) {
      console.warn(
        `[WorkflowLoader] Skipping "${folderName}": no registered import in WORKFLOW_IMPORTS`
      );
      return null;
    }

    const workflowModule = await importFn();

    if (typeof workflowModule.default !== 'function') {
      console.warn(
        `[WorkflowLoader] Skipping "${folderName}": index.ts does not export a default factory function`
      );
      return null;
    }

    // Discover skills from the workflow's skills/ directory.
    // Try production path (.next/workflows/) first, then fall back to source path.
    const projectRoot = process.cwd();
    const prodSkillsPath = resolve(projectRoot, '.next', 'workflows', folderName, 'skills');
    const sourceSkillsPath = join(_workflowsDir, folderName, 'skills');
    
    let skillDirectories: string[] = [];
    
    // Check if production skills directory exists
    try {
      if (statSync(prodSkillsPath).isDirectory()) {
        skillDirectories = discoverSkills(resolve(projectRoot, '.next', 'workflows', folderName));
      }
    } catch {
      // Production path doesn't exist, use source path
    }
    
    // If no skills found in production path, try source path
    if (skillDirectories.length === 0) {
      skillDirectories = discoverSkills(join(_workflowsDir, folderName));
    }

    return {
      manifest,
      factory: workflowModule.default,
      skillDirectories,
    };
  } catch (err) {
    console.warn(`[WorkflowLoader] Failed to load workflow "${folderName}":`, err);
    return null;
  }
}

async function scanWorkflows(): Promise<Map<string, LoadedWorkflow>> {
  const cache = new Map<string, LoadedWorkflow>();

  try {
    const entries = readdirSync(_workflowsDir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;

      const workflow = await loadWorkflow(entry);
      if (workflow) {
        cache.set(entry, workflow);
      }
    }
  } catch (err) {
    console.warn('[WorkflowLoader] Failed to scan workflows directory:', err);
  }

  return cache;
}

function getWorkflowsMap(): Map<string, LoadedWorkflow> {
  if (!workflowsCache) {
    workflowsCache = new Map();
  }
  return workflowsCache;
}

export function getWorkflows(): WorkflowManifest[] {
  const map = getWorkflowsMap();
  return Array.from(map.values())
    .map((w) => w.manifest)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getWorkflow(id: string): LoadedWorkflow | undefined {
  const map = getWorkflowsMap();
  return map.get(id);
}

export async function reloadWorkflows(): Promise<void> {
  workflowsCache = await scanWorkflows();
}

// Auto-load on module import
reloadWorkflows().catch((err) => {
  console.warn('[WorkflowLoader] Initial load failed:', err);
});
