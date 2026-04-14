#!/usr/bin/env node

/**
 * Post-build script: Copy workflow skills directories to .next output.
 * 
 * Skills contain SKILL.md and other assets (.md, .js, .py, etc.) that
 * must be preserved as-is (not transpiled) for runtime use by Copilot SDK.
 */

const { readdirSync, statSync, mkdirSync, cpSync } = require('fs');
const { join } = require('path');

const WORKFLOWS_SRC = join(process.cwd(), 'src', 'workflows');
const NEXT_OUT = join(process.cwd(), '.next', 'workflows');

function copyWorkflowSkills() {
  console.log('[PostBuild] Copying workflow skills to .next/workflows/...');

  try {
    const workflowDirs = readdirSync(WORKFLOWS_SRC).filter(
      (dir) => !dir.startsWith('.') && statSync(join(WORKFLOWS_SRC, dir)).isDirectory()
    );

    let copiedCount = 0;

    for (const workflowDir of workflowDirs) {
      const skillsSrc = join(WORKFLOWS_SRC, workflowDir, 'skills');
      
      try {
        if (!statSync(skillsSrc).isDirectory()) {
          continue;
        }
      } catch {
        // No skills directory
        continue;
      }

      const skillsDest = join(NEXT_OUT, workflowDir, 'skills');
      mkdirSync(skillsDest, { recursive: true });
      
      // Copy entire skills directory preserving structure
      cpSync(skillsSrc, skillsDest, { recursive: true });
      copiedCount++;
      
      console.log(`  ✓ Copied ${workflowDir}/skills`);
    }

    console.log(`[PostBuild] Done! Copied ${copiedCount} workflow skills directories.`);
  } catch (err) {
    console.error('[PostBuild] Failed to copy skills:', err.message);
    process.exit(1);
  }
}

copyWorkflowSkills();
