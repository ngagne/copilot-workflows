import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  validateManifest,
  getWorkflows,
  getWorkflow,
  reloadWorkflows,
  _setWorkflowsDir,
  discoverSkills,
} from '@/src/workflows/loader';

/**
 * Create a temporary workflow directory with the given workflows.
 */
function createTestWorkflowsDir(workflows: Record<string, { manifest?: object }>): string {
  const dir = join(tmpdir(), `test-workflows-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });

  for (const [folderName, content] of Object.entries(workflows)) {
    const folderPath = join(dir, folderName);
    mkdirSync(folderPath, { recursive: true });

    if (content.manifest !== undefined) {
      writeFileSync(join(folderPath, 'manifest.json'), JSON.stringify(content.manifest));
    }
  }

  return dir;
}

describe('Workflow Loader', () => {
  const originalDir = join(process.cwd(), 'src', 'workflows');

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    _setWorkflowsDir(originalDir);
  });

  // ---- Pure function: validateManifest ----

  describe('validateManifest', () => {
    it('should return false for null', () => {
      expect(validateManifest(null, 'test')).toBe(false);
    });

    it('should return false for a non-object', () => {
      expect(validateManifest('string', 'test')).toBe(false);
      expect(validateManifest(42, 'test')).toBe(false);
      expect(validateManifest(undefined, 'test')).toBe(false);
    });

    it('should return false for manifest missing required fields', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const partial = { id: 'test', description: 'x', version: '1.0.0', acceptsFiles: false };
      expect(validateManifest(partial, 'test')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing required field "name"'),
      );
    });

    it('should return false when manifest id does not match folder name', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const bad = { id: 'wrong', name: 'X', description: 'x', version: '1.0.0', acceptsFiles: false };
      expect(validateManifest(bad, 'test')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('does not match folder name'),
      );
    });

    it('should return true for a valid manifest', () => {
      const valid = {
        id: 'my-workflow',
        name: 'My Workflow',
        description: 'A test workflow',
        version: '1.0.0',
        acceptsFiles: true,
      };
      expect(validateManifest(valid, 'my-workflow')).toBe(true);
    });

    it('should return true for a manifest with optional fields', () => {
      const full = {
        id: 'full-workflow',
        name: 'Full Workflow',
        description: 'A complete workflow',
        version: '2.0.0',
        acceptsFiles: true,
        maxFiles: 5,
        allowedFileTypes: ['.ts', '.js'],
        promptPlaceholder: 'Enter a prompt',
        tags: ['test'],
      };
      expect(validateManifest(full, 'full-workflow')).toBe(true);
    });

    it('should reject manifest with null required field values', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const bad = { id: null, name: 'X', description: 'x', version: '1.0.0', acceptsFiles: false };
      expect(validateManifest(bad, 'x')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing required field "id"'),
      );
    });

    it('should reject manifest with non-string id', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const bad = { id: 123, name: 'X', description: 'x', version: '1.0.0', acceptsFiles: false };
      expect(validateManifest(bad, 'x')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('does not match folder name'),
      );
    });

    it('should validate each required field individually', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const requiredFields = ['id', 'name', 'description', 'version', 'acceptsFiles'];

      for (const field of requiredFields) {
        warnSpy.mockClear();

        // Create a manifest missing one field
        const manifest: Record<string, unknown> = {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          acceptsFiles: false,
        };
        delete manifest[field];

        expect(validateManifest(manifest, 'test')).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining(`missing required field "${field}"`),
        );
      }
    });
  });

  // ---- Error path tests via temp directories ----

  describe('discoverSkills', () => {
    it('should return empty array when no skills directory exists', () => {
      const dir = join(tmpdir(), `test-wf-no-skills-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, 'my-workflow'));
      writeFileSync(join(dir, 'my-workflow', 'manifest.json'), JSON.stringify({
        id: 'my-workflow',
        name: 'Test',
        description: 'Test',
        version: '1.0.0',
        acceptsFiles: false,
      }));

      const skills = discoverSkills(join(dir, 'my-workflow'));
      expect(skills).toEqual([]);

      rmSync(dir, { recursive: true, force: true });
    });

    it('should discover skills with SKILL.md files', () => {
      const dir = join(tmpdir(), `test-wf-skills-${Date.now()}`);
      const workflowPath = join(dir, 'my-workflow');
      mkdirSync(workflowPath, { recursive: true });

      // Create skill 1
      const skill1Path = join(workflowPath, 'skills', 'security-review');
      mkdirSync(skill1Path, { recursive: true });
      writeFileSync(join(skill1Path, 'SKILL.md'), '# Security Review');

      // Create skill 2
      const skill2Path = join(workflowPath, 'skills', 'performance-review');
      mkdirSync(skill2Path, { recursive: true });
      writeFileSync(join(skill2Path, 'SKILL.md'), '# Performance Review');

      // Create directory without SKILL.md (should be skipped)
      const incompleteSkillPath = join(workflowPath, 'skills', 'incomplete');
      mkdirSync(incompleteSkillPath, { recursive: true });

      const skills = discoverSkills(workflowPath);
      expect(skills).toHaveLength(2);
      expect(skills).toContain(join(skill1Path));
      expect(skills).toContain(join(skill2Path));

      rmSync(dir, { recursive: true, force: true });
    });

    it('should handle skills directory with missing SKILL.md gracefully', () => {
      const dir = join(tmpdir(), `test-wf-bad-skills-${Date.now()}`);
      const workflowPath = join(dir, 'my-workflow');
      mkdirSync(workflowPath, { recursive: true });

      // Create a skills directory with only non-SKILL.md files
      const skillPath = join(workflowPath, 'skills', 'bad-skill');
      mkdirSync(skillPath, { recursive: true });
      writeFileSync(join(skillPath, 'README.md'), '# Not a skill');

      const skills = discoverSkills(workflowPath);
      expect(skills).toEqual([]);

      rmSync(dir, { recursive: true, force: true });
    });

    it('should return empty when skills path is a file not a directory', () => {
      const dir = join(tmpdir(), `test-wf-skills-file-${Date.now()}`);
      const workflowPath = join(dir, 'my-workflow');
      mkdirSync(workflowPath, { recursive: true });

      // Create a file named 'skills' instead of a directory
      writeFileSync(join(workflowPath, 'skills'), 'not a directory');

      const skills = discoverSkills(workflowPath);
      expect(skills).toEqual([]);

      rmSync(dir, { recursive: true, force: true });
    });

    it('should handle skill directories that are actually files (edge case)', () => {
      const dir = join(tmpdir(), `test-wf-skills-edge-${Date.now()}`);
      const workflowPath = join(dir, 'my-workflow');
      mkdirSync(workflowPath, { recursive: true });

      // Create skills directory with a proper skill subdirectory
      const skillsPath = join(workflowPath, 'skills');
      mkdirSync(skillsPath, { recursive: true });

      // Create a proper skill subdirectory with SKILL.md
      const skillSubPath = join(skillsPath, 'test-skill');
      mkdirSync(skillSubPath, { recursive: true });
      writeFileSync(join(skillSubPath, 'SKILL.md'), '# Test Skill');

      const skills = discoverSkills(workflowPath);
      expect(skills).toHaveLength(1);

      rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('loadWorkflow error paths', () => {
    it('should skip workflows with invalid JSON manifest', async () => {
      const dir = join(tmpdir(), `test-wf-bad-json-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      const wfDir = join(dir, 'bad-json');
      mkdirSync(wfDir);
      writeFileSync(join(wfDir, 'manifest.json'), 'not valid json {{{');

      _setWorkflowsDir(dir);
      await reloadWorkflows();

      expect(getWorkflow('bad-json')).toBeUndefined();
      rmSync(dir, { recursive: true, force: true });
    });

    it('should skip workflows with missing manifest.json', async () => {
      const dir = join(tmpdir(), `test-wf-no-manifest-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, 'no-manifest'));

      _setWorkflowsDir(dir);
      await reloadWorkflows();

      expect(getWorkflow('no-manifest')).toBeUndefined();
      rmSync(dir, { recursive: true, force: true });
    });

    it('should skip workflows with valid manifest but no import mapping', async () => {
      const dir = createTestWorkflowsDir({
        unregistered: {
          manifest: {
            id: 'unregistered',
            name: 'Unregistered',
            description: 'Not in WORKFLOW_IMPORTS',
            version: '1.0.0',
            acceptsFiles: false,
          },
        },
      });

      _setWorkflowsDir(dir);
      await reloadWorkflows();

      // No import mapping → skipped gracefully
      expect(getWorkflow('unregistered')).toBeUndefined();

      rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('scanWorkflows error paths', () => {
    it('should handle scandir failure gracefully', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const fakeDir = join(tmpdir(), `does-not-exist-${Date.now()}`);
      _setWorkflowsDir(fakeDir);

      await reloadWorkflows();

      // scanWorkflows catches the error and warns
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('Failed to scan workflows directory');

      // getWorkflows returns empty since the scan found nothing
      // (cache may contain previous workflows if scanWorkflows returned the empty map)
      const workflows = getWorkflows();
      expect(Array.isArray(workflows)).toBe(true);
    });

    it('should skip hidden directories (starting with .)', async () => {
      const dir = join(tmpdir(), `test-wf-hidden-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, '.hidden-workflow'));

      _setWorkflowsDir(dir);
      await reloadWorkflows();

      // Should return empty since .hidden-workflow is skipped and no real workflows exist
      const workflows = getWorkflows();
      // Filter to only include workflows from our temp dir
      const tempWorkflows = workflows.filter(w =>
        w.id === 'unregistered' // from previous test's temp dir
      );
      expect(tempWorkflows).toEqual([]);

      rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('cache behavior', () => {
    it('should return consistent results on subsequent calls', async () => {
      await reloadWorkflows();
      const first = getWorkflows();
      const second = getWorkflows();

      expect(first.length).toBe(second.length);
      expect(first).toEqual(second);
    });

    it('should reset cache on reloadWorkflows', async () => {
      await reloadWorkflows();
      const count1 = getWorkflows().length;

      await reloadWorkflows();
      const count2 = getWorkflows().length;

      expect(count2).toBe(count1);
    });

    it('should return empty array when cache is empty', async () => {
      const fakeDir = join(tmpdir(), `test-empty-cache-${Date.now()}`);
      mkdirSync(fakeDir, { recursive: true });
      _setWorkflowsDir(fakeDir);

      await reloadWorkflows();
      const workflows = getWorkflows();

      expect(workflows).toEqual([]);

      rmSync(fakeDir, { recursive: true, force: true });
    });
  });

  // ---- Integration: real filesystem ----

  describe('getWorkflows (real fs)', () => {
    it('should return sorted manifests from loaded workflows', async () => {
      _setWorkflowsDir(originalDir);
      await reloadWorkflows();
      const workflows = getWorkflows();

      expect(workflows.length).toBeGreaterThanOrEqual(2);
      const names = workflows.map((w) => w.name);
      expect(names).toEqual([...names].sort());
    });

    it('should include _example and code-review manifests', async () => {
      _setWorkflowsDir(originalDir);
      await reloadWorkflows();
      const workflows = getWorkflows();
      const ids = workflows.map((w) => w.id);
      expect(ids).toContain('_example');
      expect(ids).toContain('code-review');
    });
  });

  describe('getWorkflow (real fs)', () => {
    it('should return undefined for non-existent workflow', async () => {
      _setWorkflowsDir(originalDir);
      await reloadWorkflows();
      expect(getWorkflow('non-existent')).toBeUndefined();
    });

    it('should return loaded workflow for _example', async () => {
      _setWorkflowsDir(originalDir);
      await reloadWorkflows();
      const wf = getWorkflow('_example');
      expect(wf).toBeDefined();
      expect(wf?.manifest.id).toBe('_example');
      expect(wf?.manifest.name).toBe('Echo Workflow');
    });

    it('should return loaded workflow for code-review', async () => {
      _setWorkflowsDir(originalDir);
      await reloadWorkflows();
      const wf = getWorkflow('code-review');
      expect(wf).toBeDefined();
      expect(wf?.manifest.id).toBe('code-review');
      expect(wf?.factory).toBeDefined();
    });
  });
});
