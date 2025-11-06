import { findRepoContext } from '../services/github.js';
import { extractTask } from '../services/openai.js';
import { createAsanaTask } from '../services/asana.js';

export async function handleTask(params: {
  describe: string;
  projectOption?: string | null;
  sectionOption?: string | null;
  priorityOption?: string | null;
}) {
  const describe = params.describe;
  const projectGid = params.projectOption ?? process.env.ASANA_PROJECT_GID;
  const sectionHint = params.sectionOption ?? process.env.ASANA_SECTION_GID;
  const priority = params.priorityOption ?? 'p2';

  if (!projectGid) {
    throw new Error('No Asana project configured. Provide `project` option or set ASANA_PROJECT_GID.');
  }

  if (!sectionHint) {
    throw new Error('No Asana section configured. Provide `section` option or set ASANA_SECTION_GID.');
  }

  const repoContext = await findRepoContext(describe);
  const task = await extractTask({ describe, priority, repoContext });

  const asanaUrl = await createAsanaTask({
    name: task.title,
    notes: task.body,
    projectGid,
    sectionRef: sectionHint
  });

  return `Created: ${asanaUrl}`;
}
